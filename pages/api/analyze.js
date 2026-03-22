/**
 * Listo API — /api/analyze
 *
 * Data pipeline:
 * 1. Census geocoder → verified address + lat/lng
 * 2. ZIMAS D_QUERYLAYERS → parcel profile by address (zoning, lot, RSO, etc.)
 * 3. ZIMAS spatial layers → coastal zone, overlays by coordinates
 * 4. Claude analysis with verified parcel data
 *
 * All ZIMAS services are public — no API key required.
 * ArcGIS REST accepts inSR=4326 (WGS84 lat/lng) — no coordinate conversion needed.
 */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { address, projectType, projectDetails } = req.body;
  if (!address || !projectType) return res.status(400).json({ error: "Address and project type required" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });

  try {
    // Step 1: Geocode
    let geocode = null;
    try {
      const params = new URLSearchParams({
        address: /CA|California/i.test(address) ? address : address + ", CA",
        benchmark: "Public_AR_Current",
        format: "json",
      });
      const r = await fetch(
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" + params,
        { signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const d = await r.json();
        const m = d?.result?.addressMatches?.[0];
        if (m) geocode = {
          address: m.matchedAddress,
          city: m.addressComponents?.city || "",
          state: m.addressComponents?.state || "CA",
          zip: m.addressComponents?.zip || "",
          lat: m.coordinates?.y,
          lng: m.coordinates?.x,
        };
      }
    } catch (e) { console.log("Geocode fallback:", e.message); }

    // Step 2: ZIMAS parcel data
    let parcel = null;
    try {
      parcel = await queryZIMAS(geocode?.address || address, geocode);
    } catch (e) { console.log("ZIMAS failed:", e.message); }

    // Step 3: Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: buildSystem(req.body.jurisdiction || "city-of-la"),
        messages: [{ role: "user", content: buildMessage(address, geocode, parcel, projectType, projectDetails, req.body.jurisdiction) }],
      }),
    });

    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      return res.status(502).json({ error: "Claude API error " + claudeRes.status + ": " + t.slice(0, 300) });
    }

    const data = await claudeRes.json();
    if (data.error) return res.status(502).json({ error: data.error.message });

    const analysis = data.content?.map(b => b.text || "").join("\n") || "";
    return res.status(200).json({ analysis, geocode, parcel });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}

async function queryZIMAS(address, geocode) {
  const BASE = "https://zimas.lacity.org/ArcGIS/rest/services";
  const result = { source: "ZIMAS", hasData: false };

  // Clean address for ZIMAS query: "5514 W THORNBURN ST"
  const streetOnly = address
    .replace(/,?\s*Los Angeles\b.*$/i, "")
    .replace(/,?\s*CA\b.*$/i, "")
    .replace(/,?\s*\d{5}.*$/, "")
    .trim()
    .toUpperCase();

  // Layer 0: Main parcel profile
  try {
    const q = new URLSearchParams({
      where: "SITUS_ADDR LIKE '" + streetOnly.replace(/'/g, "''") + "%'",
      outFields: "*",
      returnGeometry: "false",
      f: "json",
    });
    const r = await fetch(BASE + "/D_QUERYLAYERS/MapServer/0/query?" + q, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const d = await r.json();
      const f = d?.features?.[0]?.attributes;
      if (f) {
        result.hasData = true;
        result.rawFields = Object.keys(f);
        result.apn = f.APN || f.ASSESSOR_ID || null;
        result.zoning = f.ZONE_CMPLT || f.ZONING || null;
        result.lotSizeSf = f.LOT_SIZE ? Math.round(parseFloat(f.LOT_SIZE)) : null;
        result.yearBuilt = f.YEAR_BUILT || null;
        result.existingUnits = f.NO_OF_UNITS || f.UNITS || null;
        result.existingBuildingSqft = f.BUILDING_SQ_FT || f.BLDG_SQ_FT || null;
        result.useCode = f.USE_CODE || null;
        result.communityPlan = f.COMM_PLAN || f.COMMUNITY_PLAN_AREA || null;
        result.specificPlan = f.SPECIFIC_PLAN || null;
        result.generalPlanLandUse = f.GENERAL_PLAN || f.GP_LAND_USE || null;
        result.hillside = f.HILLSIDE === "Y" || f.HCR === "YES" || null;
        result.hpoz = f.HPOZ || null;
        result.coastalZone = f.COASTAL_ZONE || null;
        result.liquefaction = f.LIQUEFACTION === "Y" || f.LIQUEFACTION === "Yes" || null;
        result.specialGrading = f.SPEC_GRADING_AREA === "Y" || f.SPECIAL_GRADING === "Y" || null;
        result.toc = f.TOC_TIER || f.TOC || null;
      }
    }
  } catch (e) { console.log("ZIMAS layer 0:", e.message); }

  // Layer 12: RSO (confirmed working per cityhubla/a_modest_proposal_1)
  try {
    const q = new URLSearchParams({
      where: "Property_Address LIKE '" + streetOnly.replace(/'/g, "''") + "%'",
      outFields: "Property_Address,RSO_Units",
      returnGeometry: "false",
      f: "json",
    });
    const r = await fetch(BASE + "/D_QUERYLAYERS/MapServer/12/query?" + q, { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const d = await r.json();
      const f = d?.features?.[0]?.attributes;
      if (f !== undefined) {
        result.rsoUnits = parseInt(f?.RSO_Units) || 0;
        result.rso = result.rsoUnits > 0;
        result.rsoSource = "ZIMAS RSO Registry (verified)";
        result.hasData = true;
      }
    }
  } catch (e) { console.log("ZIMAS RSO:", e.message); }

  // Spatial queries with lat/lng (inSR=4326)
  if (geocode?.lat && geocode?.lng) {
    const geo = geocode.lng + "," + geocode.lat;
    const sp = (fields) => new URLSearchParams({
      geometry: geo, geometryType: "esriGeometryPoint",
      inSR: "4326", spatialRel: "esriSpatialRelIntersects",
      outFields: fields, returnGeometry: "false", f: "json",
    });

    // Zoning from B_ZONING (most reliable)
    if (!result.zoning) {
      try {
        const r = await fetch(
          "https://zimas.lacity.org/arcgis/rest/services/B_ZONING/MapServer/9/query?" + sp("ZONE_CMPLT,ZONE_CLASS,SPECIFIC_PLAN,HEIGHT_DIST"),
          { signal: AbortSignal.timeout(6000) }
        );
        if (r.ok) {
          const d = await r.json();
          const f = d?.features?.[0]?.attributes;
          if (f) {
            result.zoning = f.ZONE_CMPLT || f.ZONE_CLASS;
            result.heightDistrict = f.HEIGHT_DIST || null;
            if (!result.specificPlan) result.specificPlan = f.SPECIFIC_PLAN || null;
            result.hasData = true;
          }
        }
      } catch (e) { console.log("B_ZONING:", e.message); }
    }

    // Coastal zone check
    if (!result.coastalZone) {
      try {
        const r = await fetch(
          "https://zimas.lacity.org/arcgis/rest/services/D_LEGENDLAYERS/MapServer/112/query?" + sp("CST_TYPE"),
          { signal: AbortSignal.timeout(6000) }
        );
        if (r.ok) {
          const d = await r.json();
          result.coastalZone = d?.features?.length > 0 ? "Yes" : "No";
          if (d?.features?.length > 0) result.coastalZoneType = d.features[0].attributes?.CST_TYPE;
        }
      } catch (e) { console.log("Coastal:", e.message); }
    }
  }

  // RSO inference fallback
  if (result.rso === undefined || result.rso === null) {
    const pre78 = result.yearBuilt && parseInt(result.yearBuilt) < 1978;
    const multi = result.existingUnits && parseInt(result.existingUnits) >= 2;
    result.rso = (pre78 && multi) ? true : (pre78 !== null && multi !== null) ? false : null;
    result.rsoSource = (pre78 && multi)
      ? "Inferred (pre-1978 + 2+ units) — verify with HCIDLA"
      : "Not verified";
  }

  // Lot size and density
  if (result.lotSizeSf > 0) {
    result.unitsByRight = Math.floor(result.lotSizeSf / 800);
    result.densityCalc = result.lotSizeSf.toLocaleString() + " sf / 800 = " + result.unitsByRight + " units by-right";
  }

  return result;
}

function buildSystem(jurisdictionKey) {
  return [
    "You are Listo's permit intelligence engine.",
    "Voice: direct, factual, confident. No jargon. No investment advice. No opinions.",
    "This is a DISCOVERY tool. Users enter address + project type. Show what is possible.",
    "",
    jurisdictionKey === "santa-monica" ?
      "JURISDICTION: Santa Monica — separate from City of LA. Building dept: Santa Monica Building & Safety. " +
      "Santa Monica Rent Control Board (stricter than LA RSO — covers buildings built before April 10, 1979 with 2+ units). " +
      "Fully within California Coastal Zone — CCC permit required for most projects near beach. " +
      "Santa Monica Municipal Code applies, not LAMC. Fee schedule differs from LADBS." : "",
    jurisdictionKey === "beverly-hills" ?
      "JURISDICTION: Beverly Hills — separate from City of LA. Building dept: Beverly Hills Building & Safety Division. " +
      "Beverly Hills Municipal Code applies, not LAMC. Own zoning code (BHMC Title 10). " +
      "No RSO equivalent but strong tenant protections. Own fee schedule. " +
      "Some hillside areas with specific grading requirements." : "",
    jurisdictionKey === "city-of-la" || !jurisdictionKey ?
      "JURISDICTION: City of Los Angeles. Building dept: LADBS. Permit agency: LADBS (ladbs.org). LAMC applies." : "",
    "",
    "RULES:",
    "1. Facts only. No investment advice whatsoever.",
    "2. VERIFIED data = use exactly. Never override verified parcel data.",
    "3. ESTIMATED data = flag clearly, recommend verification.",
    "4. If lot size provided: use exact density math (lot sf / 800 = N). Show arithmetic.",
    "5. If lot size unknown: say so. Do not estimate.",
    "6. VERDICT: GO | CAUTION | COMPLEX — one only.",
    "7. Coastal Transportation Corridor (ZI-1874) = TRANSPORTATION plan, NOT Coastal Zone.",
    "8. RSO verified: state unit count + full compliance. RSO inferred: flag as estimate.",
    "9. If demolishing RSO units: flag HE Replacement Required + Housing Crisis Act + relocation costs.",
    "10. Liquefaction confirmed: flag geotech requirements + cost range $15K-$40K.",
    "11. Special Grading Area: flag BOE grading permit.",
    "12. Complete every section. Never truncate.",
    "13. Documents: STAMP YES for all architect/engineer plans in LA — never mark architectural, structural, or MEP as NOT REQUIRED.",
    "14. DEMO, BUILDING, TECHNICAL REPORTS are section headers in Documents — put each on its own line before the docs in that group.",
    "",
    "OUTPUT — ## sections in this exact order:",
    "## Deal Summary",
    "VERDICT: [GO|CAUTION|COMPLEX] | [one sentence facts]",
    "ZONING: [exact code] | [permitted uses 6 words]",
    "UNITS: [N] by-right ([lot sf] sf / 800 = [N]) | TOC: [eligibility]",
    "PERMITS: $[low]-$[high] | [N]-[N] week critical path",
    "ALERTS: [N] critical | [N] caution | [N] informational",
    "DATA: [Verified — ZIMAS | Estimated — ZIP knowledge]",
    "",
    "## Zone Alerts",
    "[CRITICAL|CAUTION|INFO] | [Name] | [$ impact] | [time impact]",
    "[One sentence what must be done]",
    "If none: CLEAR | No special zone restrictions detected",
    "",
    "## Zoning & Density",
    "ZONING: [code] — [full name]",
    "Development standards table (setbacks, height, FAR, coverage, parking, open space)",
    "DENSITY MATH: [lot sf] sf / 800 = [N] units by-right",
    "TOC BONUS: [result] | ADU: [N ADUs + N JADUs]",
    "MAX BUILDOUT: [N] total units",
    "EXISTING STRUCTURE: [year, units, sqft, RSO status]",
    "",
    "## Permit Roadmap",
    "### Phase 1 - Pre-Application",
    "### Phase 2 - Primary Permits",
    "### Phase 3 - Trade & Ancillary",
    "[NAME] | [OTC|PLAN CHECK|SPECIAL] | [Agency] | [X-Y weeks] | $[low]-$[high]",
    "CRITICAL PATH: [N]-[N] weeks",
    "",
    "## Documents",
    "DEMO",
    "[Doc name] | [Who prepares] | [Stamp: YES/NO]",
    "BUILDING",
    "[Doc name] | [Who prepares] | [Stamp: YES/NO]",
    "TECHNICAL REPORTS",
    "[Doc name] | [Who prepares] | [Stamp: YES/NO]",
    "",
    "## Fee Summary",
    "[Permit] | [Basis] | $[low]-$[high]",
    "TOTAL FEES: $[low]-$[high]",
    "EXCLUDES: [list — no design fee estimates]",
    "",
    "## Timeline",
    "Weeks [N]-[N]: [activity]",
    "BEST CASE: [N] weeks | WORST CASE: [N] weeks",
    "",
    "## Next Steps",
    "Max 7. First 3 actionable THIS WEEK.",
    "[N]. [Action] | [Who] | [Cost]",
    "",
    "## Legal Notice",
    "AI-generated guidance based on publicly available LA permit data. Always verify with your jurisdiction before submitting. This is not legal advice. Listo makes no warranties regarding accuracy or completeness.",
  ].join("\n");
}

function buildMessage(rawAddr, geocode, parcel, projectType, details, jurisdictionKey) {
  const lines = ["PROPERTY:"];

  if (geocode) {
    lines.push("Verified Address: " + geocode.address);
    lines.push("City: " + geocode.city + ", ZIP: " + geocode.zip);
    lines.push("Coordinates: " + geocode.lat?.toFixed(6) + ", " + geocode.lng?.toFixed(6));
  } else {
    lines.push("Address (unverified): " + rawAddr);
  }

  lines.push("");

  if (parcel?.hasData) {
    lines.push("PARCEL DATA (Source: " + parcel.source + " — treat as ground truth):");
    if (parcel.apn)                 lines.push("APN: " + parcel.apn);
    if (parcel.zoning)              lines.push("Zoning: " + parcel.zoning + " (VERIFIED)");
    if (parcel.heightDistrict)      lines.push("Height District: " + parcel.heightDistrict);
    if (parcel.lotSizeSf)           lines.push("Lot Size: " + parcel.lotSizeSf.toLocaleString() + " sf (VERIFIED)");
    if (parcel.densityCalc)         lines.push("Density: " + parcel.densityCalc + " (VERIFIED — use exactly)");
    if (parcel.existingUnits)       lines.push("Existing Units: " + parcel.existingUnits);
    if (parcel.yearBuilt)           lines.push("Year Built: " + parcel.yearBuilt);
    if (parcel.existingBuildingSqft) lines.push("Existing Building: " + parcel.existingBuildingSqft + " sf");
    if (parcel.useCode)             lines.push("Use Code: " + parcel.useCode);
    if (parcel.communityPlan)       lines.push("Community Plan: " + parcel.communityPlan);
    if (parcel.specificPlan)        lines.push("Specific Plan: " + parcel.specificPlan);
    if (parcel.generalPlanLandUse)  lines.push("General Plan Land Use: " + parcel.generalPlanLandUse);

    // RSO
    if (parcel.rso !== null && parcel.rso !== undefined) {
      lines.push("RSO: " + (parcel.rso ? "YES — " + (parcel.rsoUnits || "unknown") + " RSO units" : "No") + " (" + parcel.rsoSource + ")");
    } else {
      lines.push("RSO: Not verified — flag as unverified");
    }

    if (parcel.coastalZone !== null && parcel.coastalZone !== undefined)
      lines.push("California Coastal Zone: " + parcel.coastalZone + (parcel.coastalZoneType ? " — " + parcel.coastalZoneType : "") + " (VERIFIED)");
    if (parcel.hillside !== null)   lines.push("Hillside Regulation: " + (parcel.hillside ? "Yes" : "No"));
    if (parcel.hpoz)                lines.push("HPOZ: " + parcel.hpoz);
    if (parcel.liquefaction !== null) lines.push("Liquefaction Zone: " + (parcel.liquefaction ? "Yes" : "No"));
    if (parcel.specialGrading !== null) lines.push("Special Grading Area: " + (parcel.specialGrading ? "Yes" : "No"));
    if (parcel.toc)                 lines.push("TOC: " + parcel.toc);
    if (parcel.rawFields?.length)   lines.push("[Available ZIMAS fields: " + parcel.rawFields.slice(0,30).join(", ") + "]");
  } else {
    lines.push("PARCEL DATA: ZIMAS returned no results for this address.");
    lines.push("Use ZIP/neighborhood knowledge. Flag ALL estimates as unverified.");
    lines.push("Tell user to verify at zimas.lacity.org before any decisions.");
  }

  lines.push("");
  lines.push("Project Type: " + projectType);
  if (details) lines.push("Details: " + details);
  lines.push("");
  lines.push("Produce a complete Listo permit analysis. Discovery analysis — show what is possible on this parcel.");

  return lines.join("\n");
}
