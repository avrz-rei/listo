/**
 * Listo API — /api/analyze  (v5 — client-side ZIMAS architecture)
 *
 * The browser queries ZIMAS directly (public ArcGIS API, no key needed).
 * This endpoint receives the pre-fetched parcel data + calls Claude.
 *
 * v5 changes:
 * - Server no longer queries ZIMAS (Vercel→ZIMAS times out / services stopped)
 * - Browser passes geocode + parcel data in request body
 * - Full survey report checklist in Claude prompt per architect spec
 */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { address, projectType, projectDetails, jurisdiction, geocode, parcel } = req.body;
  if (!address || !projectType) return res.status(400).json({ error: "Address and project type required" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: buildSystem(jurisdiction || "city-of-la"),
        messages: [{ role: "user", content: buildMessage(address, geocode || null, parcel || null, projectType, projectDetails, jurisdiction) }],
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
    console.error("[HANDLER] Fatal error:", err);
    return res.status(500).json({ error: err.message });
  }
}


// ══════════════════════════════════════════════════════════════════════════
// Claude System Prompt
// ══════════════════════════════════════════════════════════════════════════

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
    "",
    "RULES:",
    "1. Facts only. No investment advice whatsoever.",
    "2. VERIFIED data = use exactly. Never override verified parcel data.",
    "3. NOT VERIFIED data = state explicitly as unverified + direct user to source.",
    "4. If lot size provided: use exact density math (lot sf / 800 = N). Show arithmetic.",
    "5. If lot size unknown: say 'Lot size not provided — density calculation not possible. Verify at zimas.lacity.org.'",
    "6. VERDICT: GO | CAUTION | COMPLEX — one only.",
    "7. Never say 'consult a professional' — assume user IS the professional (architect/contractor).",
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
    "═══════════════════════════════════════════════════════════════════════════",
    "SURVEY REPORT CHECKLIST — every report MUST address each item below.",
    "For each item: state VERIFIED + value, or NOT VERIFIED + direct user to zimas.lacity.org.",
    "═══════════════════════════════════════════════════════════════════════════",
    "",
    "PARCEL IDENTIFICATION:",
    "- Address with ZIP code",
    "- PIN number",
    "- Assessor Parcel No. (APN)",
    "- Zoning designation",
    "- Lot/parcel area size (sf)",
    "- Existing building size (sf)",
    "- Year built",
    "- Number of units",
    "",
    "HAZARDS & ENVIRONMENTAL:",
    "- Airport Hazard (yes/no)",
    "- Coastal Zone Calvo Exclusion Area (yes/no)",
    "- Coastal Zone Single Permit Jurisdiction Area (yes/no)",
    "- Coastal Bluff Potential (yes/no)",
    "- Canyon Bluff Potential (yes/no)",
    "- Urban Agriculture Incentive Zone (yes/no)",
    "- Very High Fire Hazard Severity Zone (yes/no)",
    "- Fire District No. 1 (yes/no)",
    "- Flood Zone (yes/no)",
    "- Watercourse (yes/no)",
    "- Streams (yes/no)",
    "- Methane Hazard Site (yes/no)",
    "- High Wind Velocity Areas (yes/no)",
    "- Special Grading Area (yes/no)",
    "- Wells (yes/no)",
    "- Sea Level Rise Area (yes/no)",
    "- Oil Well Adjacency (yes/no)",
    "- Universal Planning Review Service Applicability (yes/no)",
    "",
    "PLANNING & ZONING OVERLAYS:",
    "- Minimum Density Requirement (yes/no)",
    "- Special Notes (if applicable)",
    "- Zoning Information (ZI) — list all applicable ZIs",
    "- General Plan Land Use designation",
    "- General Plan Note(s) (yes/no)",
    "- Hillside Area (yes/no)",
    "- Specific Plan Area (which ones if applicable)",
    "- Specific Plan Area Subarea (which ones if applicable)",
    "- Special Land Use / Zoning (which ones if applicable)",
    "- Historic Preservation Review (yes/no)",
    "- HistoricPlacesLA (yes/no)",
    "- CDO: Community Design Overlay (which ones if applicable)",
    "- CPIO: Community Plan Imp. Overlay (which ones if applicable)",
    "- CPIO Subarea (which ones if applicable)",
    "- CPIO Historic Preservation Review (yes/no)",
    "- CUGU: Clean Up-Green Up (which ones if applicable)",
    "- HCR: Hillside Construction Regulation (yes/no)",
    "- NSO: Neighborhood Stabilization Overlay (yes/no)",
    "- POD: Pedestrian Oriented Districts (which ones if applicable)",
    "- RBP: Restaurant Beverage Program Eligible Area (which ones if applicable)",
    "- ASP: Alcohol Sales Program (yes/no)",
    "- RFA: Residential Floor Area District (which ones if applicable)",
    "- RIO: River Implementation Overlay (yes/no)",
    "- SN: Sign District (yes/no)",
    "- AB 2334: Very Low Vehicle Travel Area (yes/no)",
    "- AB 2097: Within a half mile of a Major Transit Stop (yes/no)",
    "- Streetscape (yes/no)",
    "- Adaptive Reuse Subareas (yes/no)",
    "- Adaptive Reuse Program (which ones if applicable)",
    "- High Quality Transit Corridor (within 1/2 mile) (yes/no)",
    "- ED 1 Eligibility (yes/no)",
    "- RPA: Redevelopment Project Area (which ones if applicable)",
    "- Central City Parking (yes/no)",
    "- Downtown Parking (yes/no)",
    "- Building Line (yes/no)",
    "- 500 Ft School Zone (which ones if applicable)",
    "- 500 Ft Park Zone (which ones if applicable)",
    "",
    "SEISMIC HAZARDS:",
    "- Active Fault Near-Source Zone (yes/no)",
    "- Nearest Fault (Distance in km + Name)",
    "- Alquist-Priolo Fault Zone (yes/no)",
    "- Landslide (yes/no)",
    "- Liquefaction (yes/no)",
    "- Tsunami Hazard Area (yes/no)",
    "",
    "HOUSING:",
    "- Rent Stabilization Ordinance (RSO) (yes/no + unit count)",
    "- Transit Oriented Communities (TOC) — tier if applicable",
    "- Housing Element (HE) Replacement Required (yes/no)",
    "- Just Cause Eviction Ordinance (JCO) (yes/no)",
    "",
    "LAMC-DERIVED DEVELOPMENT STANDARDS (from the lot's zone designation):",
    "- Uses permitted on this lot",
    "- Maximum Buildable Floor Area Ratio (FAR × lot sf = max sf)",
    "- Maximum Lot Coverage (if applicable — some zones like R2 say N/A)",
    "- Maximum envelope height limit (if multiple limits, note slope %)",
    "- Setbacks: front yard, rear yard, side yards (with prevailing setback note)",
    "- Off-street parking requirements (spaces per unit or per sf)",
    "- ADU / JADU floor area exemption",
    "- Garage exemption (attached and detached)",
    "",
    "═══════════════════════════════════════════════════════════════════════════",
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
    "## Parcel Survey",
    "Present ALL items from the Survey Report Checklist above.",
    "Group by category (Identification, Hazards, Planning, Seismic, Housing).",
    "Format: [Item] | [YES/NO/value] | [VERIFIED or NOT VERIFIED]",
    "If an item is VERIFIED from parcel data, show the value.",
    "If NOT VERIFIED, state 'NOT VERIFIED — check zimas.lacity.org'.",
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
    "Lot Coverage | [%] = [max sf] or N/A | [proposed sf] | LAMC 12.21C.10(e)",
    "Parking | [N spaces] | [proposed] | LAMC 12.21C.10(g)",
    "Then list each exemption on its own line:",
    "EXEMPTION: [description] | [amount/condition] | [LAMC ref]",
    "EXEMPTION: ADU/JADU floor area exemption | [amount] | [LAMC ref]",
    "EXEMPTION: Garage exemption (attached) | [amount] | [LAMC ref]",
    "EXEMPTION: Garage exemption (detached) | [amount] | [LAMC ref]",
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


// ══════════════════════════════════════════════════════════════════════════
// Claude User Message Builder
// ══════════════════════════════════════════════════════════════════════════

function buildMessage(rawAddr, geocode, parcel, projectType, details, jurisdictionKey) {
  const lines = ["PROPERTY:"];

  if (geocode) {
    lines.push("Verified Address: " + (geocode.address || geocode.display || rawAddr));
    lines.push("City: " + (geocode.city || "") + ", ZIP: " + (geocode.zip || ""));
    if (geocode.lat && geocode.lng) {
      lines.push("Coordinates: " + geocode.lat.toFixed(6) + ", " + geocode.lng.toFixed(6));
    }
  } else {
    lines.push("Address (unverified): " + rawAddr);
  }

  lines.push("");

  if (parcel?.hasData) {
    lines.push("PARCEL DATA (Source: ZIMAS + LA County Assessor — treat as ground truth):");

    // Core identification
    if (parcel.zoning) lines.push("Zoning: " + parcel.zoning + " (VERIFIED — ZIMAS zma/zimas layer 1902)");
    if (parcel.zoneClass) lines.push("Zone Class: " + parcel.zoneClass);
    if (parcel.apn) lines.push("APN: " + parcel.apn + " (VERIFIED — LA County Assessor Parcel Layer)");
    if (parcel.situsAddr) lines.push("ZIMAS/Assessor Address: " + parcel.situsAddr);
    if (parcel.lotSizeSf) lines.push("Lot Size: " + parcel.lotSizeSf.toLocaleString() + " sf (VERIFIED — calculated from parcel geometry)");
    if (parcel.yearBuilt) lines.push("Year Built: " + parcel.yearBuilt);
    if (parcel.existingUnits) lines.push("Existing Units: " + parcel.existingUnits);
    if (parcel.existingBuildingSqft) lines.push("Existing Building: " + parcel.existingBuildingSqft + " sf");
    if (parcel.useCode) lines.push("Use Code: " + parcel.useCode + (parcel.useDescription ? " — " + parcel.useDescription : ""));
    if (parcel.useType) lines.push("Use Type: " + parcel.useType);
    if (parcel.agencyName) lines.push("Agency: " + parcel.agencyName);
    if (parcel.generalPlanLandUse) lines.push("General Plan Land Use: " + parcel.generalPlanLandUse);
    if (parcel.communityPlan) lines.push("Community Plan: " + parcel.communityPlan);
    if (parcel.specificPlan) lines.push("Specific Plan: " + parcel.specificPlan);
    if (parcel.heightDistrict) lines.push("Height District: " + parcel.heightDistrict);

    // Density
    if (parcel.lotSizeSf > 0) {
      const units = Math.floor(parcel.lotSizeSf / 800);
      lines.push("Density: " + parcel.lotSizeSf.toLocaleString() + " sf / 800 = " + units + " units by-right (VERIFIED — use exactly)");
    }

    // RSO
    if (parcel.rso !== undefined) {
      lines.push("RSO: " + (parcel.rso ? "YES — " + (parcel.rsoUnits || "unknown") + " RSO units" : "No") + " (" + (parcel.rsoSource || "VERIFIED") + ")");
    } else {
      lines.push("RSO: NOT VERIFIED — check at hcidla.lacity.org");
    }

    // Overlays from ZIMAS identify results
    if (parcel.coastalZone) lines.push("Coastal Zone: " + parcel.coastalZone + " (VERIFIED)");
    if (parcel.coastalZoneType) lines.push("Coastal Zone Type: " + parcel.coastalZoneType + " (VERIFIED)");
    if (parcel.toc) lines.push("TOC: " + parcel.toc + " (VERIFIED)");
    if (parcel.liquefaction !== undefined) lines.push("Liquefaction Zone: " + (parcel.liquefaction ? "YES" : "No") + " (VERIFIED)");
    if (parcel.hillside !== undefined) lines.push("Hillside: " + (parcel.hillside ? "YES" : "No") + " (VERIFIED)");
    if (parcel.specialGrading !== undefined) lines.push("Special Grading: " + (parcel.specialGrading ? "YES" : "No") + " (VERIFIED)");
    if (parcel.fireHazard !== undefined) lines.push("Very High Fire Hazard Severity Zone: " + (parcel.fireHazard ? "YES" : "No") + " (VERIFIED)");
    if (parcel.floodZone) lines.push("Flood Zone: " + parcel.floodZone + " (VERIFIED)");
    if (parcel.methane) lines.push("Methane Hazard: " + parcel.methane + " (VERIFIED)");
    if (parcel.seaLevelRise !== undefined) lines.push("Sea Level Rise Area: " + (parcel.seaLevelRise ? "YES" : "No") + " (VERIFIED)");
    if (parcel.faultZone) lines.push("Fault Zone: " + parcel.faultZone + " (VERIFIED)");

    // Raw overlay layers from identify (catch-all for anything we might miss)
    if (parcel.overlayLayers?.length) {
      lines.push("");
      lines.push("ALL ZIMAS OVERLAY LAYERS DETECTED AT THIS PARCEL:");
      for (const layer of parcel.overlayLayers) {
        lines.push("  - [Layer " + layer.layerId + "] " + layer.layerName + ": " + JSON.stringify(layer.attrs));
      }
    }

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
  lines.push("Produce a complete Listo permit analysis with full survey report.");
  lines.push("Cover EVERY item in the Survey Report Checklist. Mark each VERIFIED or NOT VERIFIED.");

  return lines.join("\n");
}
