/**
 * Listo API — /api/analyze
 *
 * Data pipeline:
 * 1. Census geocoder → verified address + lat/lng
 * 2. ZIMAS B_ZONING spatial query → authoritative zoning by lat/lng (PRIMARY)
 * 3. ZIMAS D_QUERYLAYERS → lot size, RSO, year built, overlays by address (SUPPLEMENTARY)
 * 4. ZIMAS D_LEGENDLAYERS → coastal zone check by lat/lng
 * 5. Claude analysis with verified parcel data
 *
 * B_ZONING spatial query is PRIMARY because it only needs lat/lng (always available
 * from geocoder) and doesn't depend on address string matching.
 */

// ── LA neighborhood → city mapping ───────────────────────────────────────
// The Census geocoder needs "Los Angeles" as the city, not a neighborhood name.
// Without this, addresses like "622 Woodlawn Ave, Venice" return no match
// and ALL downstream spatial queries are skipped.
const LA_NEIGHBORHOODS = [
  "Venice","Westchester","Playa Del Rey","Playa del Rey","Marina del Rey",
  "Marina Del Rey","Pacific Palisades","Brentwood","Bel Air","Bel-Air",
  "Westwood","Century City","Mar Vista","Del Rey","Palms","Sawtelle",
  "Silver Lake","Silverlake","Echo Park","Hancock Park","Los Feliz",
  "Hollywood Hills","Laurel Canyon","Beachwood Canyon","Larchmont",
  "Mid-Wilshire","Koreatown","Leimert Park","Hyde Park","Watts",
  "Boyle Heights","Lincoln Heights","El Sereno","Highland Park",
  "Eagle Rock","Glassell Park","Atwater Village","Filipinotown",
  "Chinatown","Downtown","Arts District","South Park",
  "North Hollywood","Van Nuys","Sherman Oaks","Studio City",
  "Encino","Tarzana","Woodland Hills","Reseda","Canoga Park",
  "Chatsworth","Granada Hills","Northridge","Lake Balboa",
  "Panorama City","Arleta","Pacoima","Sun Valley","Sylmar",
  "Toluca Lake","Burbank-adjacent","Ladera Heights","Windsor Hills",
  "View Park","Westlake","Thai Town","Little Armenia",
  "Griffith Park","Mount Washington","Cypress Park",
  "San Pedro","Watts","Wilmington","Harbor City","Harbor Gateway",
  "Playa Vista","Westchester","El Segundo-adjacent",
];

function normalizeAddressForGeocode(raw) {
  const s = raw.trim();
  // Already has a city-like token recognized by Census — leave alone
  const knownCities = /\b(Los Angeles|Santa Monica|Beverly Hills|Malibu|Burbank|Glendale|Pasadena|Long Beach|Torrance|Inglewood|Compton|Carson|Culver City|West Hollywood|El Segundo|Hawthorne|Gardena|Redondo Beach|Hermosa Beach|Manhattan Beach)\b/i;
  if (knownCities.test(s)) return s;
  // Has a ZIP — Census can use that
  if (/\b\d{5}\b/.test(s)) return s;
  // Check for neighborhood names and substitute Los Angeles
  for (const hood of LA_NEIGHBORHOODS) {
    if (s.toLowerCase().includes(hood.toLowerCase())) {
      // Replace neighborhood with Los Angeles in the string
      const re = new RegExp(",?\\s*" + hood.replace(/[-]/g, "[-]?"), "i");
      const cleaned = s.replace(re, "").trim().replace(/,\s*$/, "");
      console.log("Geocode normalize: '" + s + "' → '" + cleaned + ", Los Angeles, CA'");
      return cleaned + ", Los Angeles, CA";
    }
  }
  // Fallback: append Los Angeles if no state/city clue
  return /CA|California/i.test(s) ? s : s + ", Los Angeles, CA";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { address, projectType, projectDetails } = req.body;
  if (!address || !projectType) return res.status(400).json({ error: "Address and project type required" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });

  try {
    // Step 1: Geocode with neighborhood normalization
    let geocode = null;
    try {
      const geocodeAddr = normalizeAddressForGeocode(address);
      const params = new URLSearchParams({
        address: geocodeAddr,
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
        if (m) {
          geocode = {
            address: m.matchedAddress,
            city: m.addressComponents?.city || "",
            state: m.addressComponents?.state || "CA",
            zip: m.addressComponents?.zip || "",
            lat: m.coordinates?.y,
            lng: m.coordinates?.x,
          };
          console.log("Geocode success:", geocode.address, geocode.lat, geocode.lng);
        } else {
          console.log("Geocode: no match for", geocodeAddr);
        }
      }
    } catch (e) { console.log("Geocode error:", e.message); }

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
  const BASE   = "https://zimas.lacity.org/ArcGIS/rest/services";
  const ARCGIS = "https://zimas.lacity.org/arcgis/rest/services";
  const result = { source: "ZIMAS", hasData: false };

  // ── SPATIAL QUERIES — use lat/lng, no address string matching ─────────────
  // These work whenever the geocoder succeeds. They are the PRIMARY data path.
  if (geocode?.lat && geocode?.lng) {
    const geo = geocode.lng + "," + geocode.lat;
    const sp = (fields) => new URLSearchParams({
      geometry: geo,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: fields,
      returnGeometry: "false",
      f: "json",
    });

    // 1. Authoritative zoning (B_ZONING MapServer/9)
    try {
      const r = await fetch(
        ARCGIS + "/B_ZONING/MapServer/9/query?" + sp("ZONE_CMPLT,ZONE_CLASS,SPECIFIC_PLAN,HEIGHT_DIST"),
        { signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const d = await r.json();
        const f = d?.features?.[0]?.attributes;
        if (f) {
          result.zoning = f.ZONE_CMPLT || f.ZONE_CLASS || null;
          result.heightDistrict = f.HEIGHT_DIST || null;
          result.specificPlan = f.SPECIFIC_PLAN || null;
          result.hasData = true;
          result.zoningSource = "ZIMAS B_ZONING spatial (verified)";
          console.log("B_ZONING hit:", result.zoning);
        }
      }
    } catch (e) { console.log("B_ZONING spatial:", e.message); }

    // 2. Parcel data spatially — bypasses address string matching entirely
    // D_QUERYLAYERS/MapServer/0 supports spatial queries, returns same rich fields
    try {
      const r = await fetch(
        BASE + "/D_QUERYLAYERS/MapServer/0/query?" + sp(
          "APN,ASSESSOR_ID,SITUS_ADDR,ZONE_CMPLT,ZONING,LOT_SIZE,YEAR_BUILT," +
          "NO_OF_UNITS,UNITS,BUILDING_SQ_FT,BLDG_SQ_FT,USE_CODE," +
          "COMM_PLAN,COMMUNITY_PLAN_AREA,SPECIFIC_PLAN,GENERAL_PLAN,GP_LAND_USE," +
          "HILLSIDE,HCR,HPOZ,COASTAL_ZONE,LIQUEFACTION,SPEC_GRADING_AREA,SPECIAL_GRADING,TOC_TIER,TOC"
        ),
        { signal: AbortSignal.timeout(10000) }
      );
      if (r.ok) {
        const d = await r.json();
        const f = d?.features?.[0]?.attributes;
        if (f) {
          result.hasData = true;
          result.spatialParcelHit = true;
          result.apn = f.APN || f.ASSESSOR_ID || null;
          // Don't override zoning already found from B_ZONING (more authoritative)
          if (!result.zoning) result.zoning = f.ZONE_CMPLT || f.ZONING || null;
          result.lotSizeSf = f.LOT_SIZE ? Math.round(parseFloat(f.LOT_SIZE)) : null;
          result.yearBuilt = f.YEAR_BUILT || null;
          result.existingUnits = f.NO_OF_UNITS || f.UNITS || null;
          result.existingBuildingSqft = f.BUILDING_SQ_FT || f.BLDG_SQ_FT || null;
          result.useCode = f.USE_CODE || null;
          result.communityPlan = f.COMM_PLAN || f.COMMUNITY_PLAN_AREA || null;
          if (!result.specificPlan) result.specificPlan = f.SPECIFIC_PLAN || null;
          result.generalPlanLandUse = f.GENERAL_PLAN || f.GP_LAND_USE || null;
          result.hillside = f.HILLSIDE === "Y" || f.HCR === "YES" || false;
          result.hpoz = f.HPOZ || null;
          if (!result.coastalZone) result.coastalZone = f.COASTAL_ZONE || null;
          result.liquefaction = f.LIQUEFACTION === "Y" || f.LIQUEFACTION === "Yes" || false;
          result.specialGrading = f.SPEC_GRADING_AREA === "Y" || f.SPECIAL_GRADING === "Y" || false;
          result.toc = f.TOC_TIER || f.TOC || null;
          // Also capture the verified SITUS address for display
          if (f.SITUS_ADDR) result.situsAddr = f.SITUS_ADDR;
          console.log("D_QUERYLAYERS SPATIAL hit:", result.apn, result.lotSizeSf, "sf lot,", result.zoning);
        } else {
          console.log("D_QUERYLAYERS spatial: no features at this point");
        }
      }
    } catch (e) { console.log("D_QUERYLAYERS spatial:", e.message); }

    // 3. Coastal Zone — dedicated spatial check (more detailed than layer 0)
    try {
      const r = await fetch(
        ARCGIS + "/D_LEGENDLAYERS/MapServer/112/query?" + sp("CST_TYPE,CST_ZONE"),
        { signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const d = await r.json();
        if (d?.features?.length > 0) {
          result.coastalZone = "Yes";
          result.coastalZoneType = d.features[0].attributes?.CST_TYPE || "Coastal Zone";
          console.log("Coastal zone hit:", result.coastalZoneType);
        } else if (result.coastalZone === null || result.coastalZone === undefined) {
          result.coastalZone = "No";
        }
      }
    } catch (e) { console.log("Coastal zone:", e.message); }

    // 4. TOC tier — dedicated spatial layer (more reliable than parcel field)
    try {
      const r = await fetch(
        ARCGIS + "/D_LEGENDLAYERS/MapServer/101/query?" + sp("TIER"),
        { signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const d = await r.json();
        const f = d?.features?.[0]?.attributes;
        if (f?.TIER) {
          result.toc = "Tier " + f.TIER;
          console.log("TOC hit: Tier", f.TIER);
        }
      }
    } catch (e) { console.log("TOC spatial:", e.message); }
  }

  // ── ADDRESS QUERIES — supplementary, fills gaps when spatial misses fields ─
  // Build streetOnly from the best available address.
  // Prefer the SITUS address returned by the spatial query (already clean + directional).
  const baseAddr = result.situsAddr || geocode?.address || address;
  const streetOnly = baseAddr
    .replace(/,?\s*(Los Angeles|Venice|Westchester|Playa Del Rey|Marina del Rey|Pacific Palisades|Santa Monica|Beverly Hills|Malibu)\b.*$/i, "")
    .replace(/,?\s*CA\b.*$/i, "")
    .replace(/,?\s*\d{5}.*$/, "")
    .trim()
    .toUpperCase();

  // Try to get additional parcel fields not covered by spatial query above
  // (raw fields list, RSO from layer 12)
  // Only run address query if spatial parcel query didn't already get the core fields
  if (!result.spatialParcelHit || !result.lotSizeSf) {
    const addressVariants = buildAddressVariants(streetOnly);
    for (const variant of addressVariants) {
      try {
        const q = new URLSearchParams({
          where: "SITUS_ADDR LIKE '" + variant.replace(/'/g, "''") + "%'",
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
            if (!result.apn) result.apn = f.APN || f.ASSESSOR_ID || null;
            if (!result.zoning) result.zoning = f.ZONE_CMPLT || f.ZONING || null;
            if (!result.lotSizeSf) result.lotSizeSf = f.LOT_SIZE ? Math.round(parseFloat(f.LOT_SIZE)) : null;
            if (!result.yearBuilt) result.yearBuilt = f.YEAR_BUILT || null;
            if (!result.existingUnits) result.existingUnits = f.NO_OF_UNITS || f.UNITS || null;
            if (!result.existingBuildingSqft) result.existingBuildingSqft = f.BUILDING_SQ_FT || f.BLDG_SQ_FT || null;
            if (!result.useCode) result.useCode = f.USE_CODE || null;
            if (!result.communityPlan) result.communityPlan = f.COMM_PLAN || f.COMMUNITY_PLAN_AREA || null;
            if (!result.specificPlan) result.specificPlan = f.SPECIFIC_PLAN || null;
            if (!result.generalPlanLandUse) result.generalPlanLandUse = f.GENERAL_PLAN || f.GP_LAND_USE || null;
            if (result.hillside === undefined || result.hillside === null)
              result.hillside = f.HILLSIDE === "Y" || f.HCR === "YES" || false;
            if (!result.hpoz) result.hpoz = f.HPOZ || null;
            if (!result.coastalZone) result.coastalZone = f.COASTAL_ZONE || null;
            if (result.liquefaction === undefined || result.liquefaction === null)
              result.liquefaction = f.LIQUEFACTION === "Y" || f.LIQUEFACTION === "Yes" || false;
            if (result.specialGrading === undefined || result.specialGrading === null)
              result.specialGrading = f.SPEC_GRADING_AREA === "Y" || f.SPECIAL_GRADING === "Y" || false;
            if (!result.toc) result.toc = f.TOC_TIER || f.TOC || null;
            console.log("D_QUERYLAYERS address hit (variant: '" + variant + "'):", result.apn);
            break; // Got data — stop trying variants
          }
        }
      } catch (e) { console.log("ZIMAS address variant '" + variant + "':", e.message); }
    }
  }

  // RSO — layer 12, address-based (this data isn't in spatial layers)
  const rsoVariants = buildAddressVariants(streetOnly);
  for (const variant of rsoVariants) {
    try {
      const q = new URLSearchParams({
        where: "Property_Address LIKE '" + variant.replace(/'/g, "''") + "%'",
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
          console.log("RSO hit (variant: '" + variant + "'):", result.rso, result.rsoUnits, "units");
          break;
        }
      }
    } catch (e) { console.log("RSO variant:", e.message); }
  }

  // ── RSO inference fallback ─────────────────────────────────────────────
  if (result.rso === undefined || result.rso === null) {
    const pre78 = result.yearBuilt && parseInt(result.yearBuilt) < 1978;
    const multi = result.existingUnits && parseInt(result.existingUnits) >= 2;
    result.rso = (pre78 && multi) ? true : false;
    result.rsoSource = (pre78 && multi)
      ? "Inferred (pre-1978 + 2+ units) — verify with HCIDLA"
      : "Not verified";
  }

  // ── Density calculation ────────────────────────────────────────────────
  if (result.lotSizeSf > 0) {
    result.unitsByRight = Math.floor(result.lotSizeSf / 800);
    result.densityCalc = result.lotSizeSf.toLocaleString() + " sf / 800 = " + result.unitsByRight + " units by-right";
  }

  return result;
}

// Build address variants to try against ZIMAS when directional prefix is unknown.
// ZIMAS stores addresses as "622 W WOODLAWN AVE" — user may enter "622 WOODLAWN AVE".
// Try: exact, then each directional, then strip any existing directional.
function buildAddressVariants(streetOnly) {
  const variants = [streetOnly]; // always try exact first
  const dirMatch = streetOnly.match(/^(\d+)\s+([NSEW])\s+(.+)$/);
  if (dirMatch) {
    // Has a directional — also try without it
    variants.push(dirMatch[1] + " " + dirMatch[3]);
  } else {
    const numMatch = streetOnly.match(/^(\d+)\s+(.+)$/);
    if (numMatch) {
      const [, num, rest] = numMatch;
      // Try adding each directional
      for (const dir of ["W", "N", "E", "S"]) {
        variants.push(num + " " + dir + " " + rest);
      }
    }
  }
  return variants;
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
    jurisdictionKey === "malibu" ?
      "JURISDICTION: City of Malibu — separate from City of LA and LA County. Building dept: City of Malibu Building & Safety. " +
      "Malibu Municipal Code applies. The ENTIRE city of Malibu is within the California Coastal Zone — " +
      "California Coastal Commission (CCC) permit required for virtually all development. " +
      "Coastal Development Permit (CDP) required. Fee schedule and timelines differ significantly from LADBS." : "",
    jurisdictionKey === "city-of-la" || !jurisdictionKey ?
      "JURISDICTION: City of Los Angeles. Building dept: LADBS. Permit agency: LADBS (ladbs.org). LAMC applies." : "",
    "",
    "CRITICAL LANGUAGE RULE — VERIFIED vs NOT VERIFIED:",
    "NEVER use 'likely', 'may require', 'appears to be', 'probably', 'seems to', or any hedging language.",
    "Two modes only: VERIFIED (state as fact, cite source) or NOT VERIFIED (say so + direct to verification source).",
    "Example: Do NOT say 'Liquefaction may be an issue.' DO say: 'Liquefaction Zone: NOT VERIFIED — check at zimas.lacity.org.'",
    "",
    "RULES:",
    "1. Facts only. No investment advice whatsoever.",
    "2. VERIFIED data = use exactly. Never override verified parcel data.",
    "3. NOT VERIFIED data = state explicitly as unverified + direct user to source.",
    "4. If lot size provided: use exact density math (lot sf / 800 = N). Show arithmetic.",
    "5. If lot size unknown: say 'Lot size not provided — density calculation not possible. Verify at zimas.lacity.org.'",
    "6. VERDICT: GO | CAUTION | COMPLEX — one only.",
    "7. ZI-1874 'Specific Plan: Los Angeles Coastal Transportation Corridor' is a TRANSPORTATION plan near I-405/LAX. NOT the California Coastal Zone. NEVER flag CCC or Coastal Development Permit requirements for ZI-1874 addresses. ZIP codes 90045, 90293, 90094, 90066 are Transportation Corridor, NOT Coastal Zone.",
    "7b. Venice Coastal Zone (ZI-2273) — distinct from the general California Coastal Zone. City of LA is the Single Permit Authority (not CCC). Applies throughout Venice (ZIP 90291). Requires Venice Specific Plan compliance + City of LA Coastal Development Permit. Calvo Exclusion Area within Venice has additional demolition/rebuild restrictions. When ZI-2273 is present, flag: ACTION REQUIRED — Venice Coastal Zone applies. Design must comply with Venice Specific Plan. City of LA Coastal Development Permit required (not CCC).",
    "8. RSO verified: state unit count + full compliance. RSO not verified: say 'NOT VERIFIED — check at hcidla.lacity.org.'",
    "9. If demolishing RSO units: flag HE Replacement Required + Housing Crisis Act + relocation costs as ACTION REQUIRED.",
    "10. Liquefaction confirmed: flag geotech requirements + cost range $15K-$40K.",
    "11. Special Grading Area: flag BOE grading permit.",
    "12. Complete every section. Never truncate.",
    "13. Documents: STAMP YES for all architect/engineer plans — never mark architectural, structural, or MEP as NOT REQUIRED.",
    "14. DEMO, BUILDING, TECHNICAL REPORTS are section headers in Documents — each on its own line.",
    "15. Always include LAMC code citations in Development Standards (e.g. LAMC 12.08 C.2).",
    "16. List all exemptions explicitly: garage FAR exemptions, JADU FAR exemptions, detached parking lot coverage exemptions.",
    "17. ZONING ESTIMATION PROHIBITED: If parcel data is missing or unverified, do NOT estimate the zoning designation. State: 'ZONING: NOT VERIFIED — analysis cannot be completed accurately. Enter parcel data from zimas.lacity.org using the manual entry form.' Do not guess R1, R2, or any zone.",
    "18. PREVAILING SETBACK RULE: Front yard setback in LA is not always 20 ft. Per LAMC 12.08 C.1, if 40%+ of developed lots on the block have consistent front yards, the minimum front yard is the average of those lots. Always note this rule in Development Standards and flag if prevailing setback data is unknown.",
    "19. TOC BONUS: Always state TOC tier if verified. Tiers 1-4 allow 35-70% density bonus. If TOC = Tier 3 or 4, this is a major development opportunity worth flagging prominently.",
    "20. HE REPLACEMENT: If Housing Element (HE) Replacement Required = Yes, any demolition triggers unit replacement obligations. Flag as ACTION REQUIRED on all demolition and ground-up projects.",
    "",
    "OUTPUT — ## sections in this exact order:",
    "## Project Overview",
    "VERDICT: [GO|CAUTION|COMPLEX] | [one sentence facts only]",
    "ZONING: [exact code] | [permitted uses 6 words]",
    "UNITS: [N] by-right ([lot sf] sf / 800 = [N]) | TOC: [eligibility]",
    "PERMITS: $[low]-$[high] | [N]-[N] week critical path",
    "ALERTS: [N] action-required | [N] caution | [N] informational",
    "DATA: [Verified — ZIMAS | Estimated — ZIP knowledge]",
    "",
    "## Zone Alerts",
    "Use label ACTION REQUIRED for true blockers, CAUTION for watch items, NOTE for context, CLEAR if none.",
    "[ACTION REQUIRED|CAUTION|NOTE] | [Name] | [$ impact] | [time impact]",
    "[One sentence — VERIFIED or NOT VERIFIED, no hedging]",
    "If none: CLEAR | No special zone restrictions detected",
    "",
    "## Development Standards",
    "ZONING: [code] — [full name] ([LAMC section])",
    "STANDARD | MAX ALLOWED | PROPOSED/TYPICAL | LAMC REF",
    "Front Yard Setback | [value] | [value] | LAMC 12.08 C.1",
    "Side Yard Setback | [value] | [value] | LAMC 12.08 C.2",
    "Rear Yard Setback | [value] | [value] | LAMC 12.08 C.2",
    "Max Height | [value] | [value] | LAMC 12.21.1",
    "Floor Area Ratio | [multiplier] × [buildable sf] = [max sf] | [proposed sf] | LAMC 12.21.1(a)",
    "Lot Coverage | [%] = [max sf] | [proposed sf] | LAMC 12.21C.10(e)",
    "Parking | [N spaces] | [proposed] | LAMC 12.21C.10(g)",
    "Then list each exemption on its own line:",
    "EXEMPTION: [description] | [amount/condition] | [LAMC ref]",
    "Then add applicable technical specs:",
    "ENCROACHMENT PLANE: [origin height] ft above grade, 45° inward slope (LAMC 12.08 C.5)",
    "GRADING: [threshold]+ cy requires BOE grading permit (LAMC 91.7006.5)",
    "BASEMENT: Exempt from FAR if ceiling ≤6 ft above grade (LAMC 12.21 C.10(d))",
    "FIRE SPRINKLERS: [trigger condition] (LAMC 12.21 C.10(h))",
    "OFFSET PLAN BREAK: Required for side walls >45 ft long and >14 ft high (LAMC 12.21 C.10(a))",
    "",
    "## Zoning & Density",
    "DENSITY MATH: [lot sf] sf / 800 = [N] units by-right",
    "TOC BONUS: [result] | ADU: [N ADUs + N JADUs]",
    "MAX BUILDOUT: [N] total units",
    "EXISTING STRUCTURE: [year, units, sqft, RSO status — VERIFIED or NOT VERIFIED]",
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
  ].filter(s => s !== "").join("\n");
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
  if (parcel?.situsAddr) lines.push("ZIMAS Verified Street Address: " + parcel.situsAddr);

  lines.push("");

  if (parcel?.hasData) {
    const src = parcel.spatialParcelHit ? "ZIMAS spatial query" : "ZIMAS address query";
    lines.push("PARCEL DATA (Source: " + src + " — treat as ground truth):");
    if (parcel.apn)                 lines.push("APN: " + parcel.apn);
    if (parcel.zoning)              lines.push("Zoning: " + parcel.zoning + " (" + (parcel.zoningSource || "VERIFIED") + ")");
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
    if (parcel.hillside !== null && parcel.hillside !== undefined)
      lines.push("Hillside Regulation: " + (parcel.hillside ? "Yes" : "No") + " (VERIFIED)");
    if (parcel.hpoz)
      lines.push("HPOZ: " + parcel.hpoz + " (VERIFIED)");
    if (parcel.liquefaction !== null && parcel.liquefaction !== undefined)
      lines.push("Liquefaction Zone: " + (parcel.liquefaction ? "YES — geotech report required" : "No") + " (VERIFIED)");
    if (parcel.specialGrading !== null && parcel.specialGrading !== undefined)
      lines.push("Special Grading Area: " + (parcel.specialGrading ? "Yes" : "No") + " (VERIFIED)");
    if (parcel.toc)
      lines.push("TOC: " + parcel.toc + " (VERIFIED)");
    if (parcel.rawFields?.length)
      lines.push("[Available ZIMAS fields: " + parcel.rawFields.slice(0, 20).join(", ") + "]");
  } else {
    lines.push("PARCEL DATA: ZIMAS returned no results for this address.");
    lines.push("CRITICAL: Do NOT estimate zoning. Do NOT guess R1, R2, or any zone designation.");
    lines.push("State in Project Overview: 'Zoning: NOT VERIFIED — analysis incomplete.'");
    lines.push("Direct user to verify at zimas.lacity.org before any project decisions.");
  }

  lines.push("");
  lines.push("Project Type: " + projectType);
  if (details) lines.push("Details: " + details);
  lines.push("");
  lines.push("Produce a complete Listo permit analysis. Discovery analysis — show what is possible on this parcel.");

  return lines.join("\n");
}
