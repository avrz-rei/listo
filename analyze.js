/**
 * Listo API — /api/analyze
 * 
 * Server-side only. API keys never reach the browser.
 * 
 * Flow:
 * 1. Geocode address via US Census API
 * 2. Pull parcel data from LA County Assessor + LA City Planning ArcGIS
 * 3. Build analysis prompt with verified parcel data
 * 4. Call Claude for permit analysis
 * 5. Return analysis + parcel data to client
 */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { address, projectType, projectDetails } = req.body;
  if (!address || !projectType) return res.status(400).json({ error: "Address and project type required" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in environment variables." });

  try {
    // ── Step 1: Geocode ────────────────────────────────────────────────────
    let geocode = null;
    try {
      const params = new URLSearchParams({
        address: /CA|California/i.test(address) ? address : address + ", CA",
        benchmark: "Public_AR_Current",
        format: "json",
      });
      const r = await fetch(
        `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`,
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

    // ── Step 2: Parcel data ────────────────────────────────────────────────
    let parcel = null;
    if (geocode?.lat && geocode?.lng) {
      try { parcel = await fetchParcel(geocode.lat, geocode.lng); }
      catch (e) { console.log("Parcel fallback:", e.message); }
    }

    // ── Step 3: Analyze ────────────────────────────────────────────────────
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
        system: buildSystem(),
        messages: [{ role: "user", content: buildMessage(address, geocode, parcel, projectType, projectDetails) }],
      }),
    });

    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      return res.status(502).json({ error: `Claude API error ${claudeRes.status}: ${t.slice(0,200)}` });
    }

    const data = await claudeRes.json();
    if (data.error) return res.status(502).json({ error: data.error.message });

    const analysis = data.content?.map(b => b.text || "").join("\n") || "";

    return res.status(200).json({ analysis, geocode, parcel });

  } catch (err) {
    console.error("analyze error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ── LA County Assessor + City Planning parcel lookup ──────────────────────
async function fetchParcel(lat, lng) {
  // LA County Assessor
  const assessorUrl = new URL("https://assessor.gis.lacounty.gov/ogl/rest/services/ASSESSOR/Demographics_and_Statistics/MapServer/0/query");
  assessorUrl.searchParams.set("geometry", `${lng},${lat}`);
  assessorUrl.searchParams.set("geometryType", "esriGeometryPoint");
  assessorUrl.searchParams.set("inSR", "4326");
  assessorUrl.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  assessorUrl.searchParams.set("outFields", "APN,UseCode,YearBuilt,Units,SQFTmain,LotSize1");
  assessorUrl.searchParams.set("returnGeometry", "false");
  assessorUrl.searchParams.set("f", "json");

  const r = await fetch(assessorUrl.toString(), { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Assessor HTTP ${r.status}`);
  const d = await r.json();
  const f = d?.features?.[0]?.attributes;
  if (!f) return null;

  // LA City Planning zoning
  let zoning = null, specificPlan = null;
  try {
    const zoningUrl = new URL("https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/LA_Zoning/FeatureServer/0/query");
    zoningUrl.searchParams.set("geometry", `${lng},${lat}`);
    zoningUrl.searchParams.set("geometryType", "esriGeometryPoint");
    zoningUrl.searchParams.set("inSR", "4326");
    zoningUrl.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    zoningUrl.searchParams.set("outFields", "ZONE_CLASS,SPEC_PLAN");
    zoningUrl.searchParams.set("returnGeometry", "false");
    zoningUrl.searchParams.set("f", "json");
    const zr = await fetch(zoningUrl.toString(), { signal: AbortSignal.timeout(6000) });
    if (zr.ok) {
      const zd = await zr.json();
      const zf = zd?.features?.[0]?.attributes;
      if (zf) { zoning = zf.ZONE_CLASS; specificPlan = zf.SPEC_PLAN; }
    }
  } catch (e) { /* zoning optional */ }

  const lotSizeSf = f.LotSize1 ? Math.round(parseFloat(f.LotSize1) * 43560) : null;

  return {
    apn: f.APN || null,
    lotSizeSf,
    existingUnits: f.Units || null,
    yearBuilt: f.YearBuilt || null,
    existingBuildingSqft: f.SQFTmain || null,
    useCode: f.UseCode || null,
    likelyRSO: f.YearBuilt && parseInt(f.YearBuilt) < 1978 && parseInt(f.Units || 0) >= 2,
    zoning,
    specificPlan,
    source: "LA County Assessor + LA City Planning",
  };
}

// ── System prompt ─────────────────────────────────────────────────────────
function buildSystem() {
  return [
    "You are Listo's permit intelligence engine.",
    "Listo helps LA contractors and real estate investors understand permit requirements before they build.",
    "Voice: direct, no jargon, confident. Never hedge when facts are available. Never give investment advice.",
    "This is a DISCOVERY tool. Users come in knowing only an address and project type. Tell them what is possible.",
    "",
    "RULES:",
    "1. Facts only. No investment advice or recommendations.",
    "2. If real parcel data is provided, use it as ground truth. Never override verified data.",
    "3. If lot size is known: show density math (lot sf / 800 = N units by-right).",
    "4. If lot size unknown: show formula + range based on typical lots in that neighborhood.",
    "5. VERDICT: GO | CAUTION | COMPLEX — one of these, nothing else.",
    "6. Coastal Transportation Corridor Specific Plan (ZI-1874) is a TRANSPORTATION plan. NOT California Coastal Zone.",
    "7. Never truncate — complete every section fully.",
    "8. Timelines in weeks. Fees scaled to $200K-$2M high-end residential.",
    "9. Flag data as verified (from assessor) or estimated (from ZIP knowledge).",
    "10. RSO: pre-1978 buildings with 2+ units trigger Housing Crisis Act review, HE Replacement, relocation requirements.",
    "",
    "OUTPUT — use these ## sections in this exact order:",
    "",
    "## Deal Summary",
    "VERDICT: [GO|CAUTION|COMPLEX] | [one sentence, facts only]",
    "ZONING: [exact code] | [permitted uses, 6 words max]",
    "UNITS: [N] by-right ([lot sf] / 800 = [N]) | TOC: [eligibility]",
    "  If lot unknown: UNITS: [N-N] estimated range (typical [area] lots: [X,000]-[Y,000] sf = [N]-[N] units)",
    "PERMITS: $[low]-$[high] estimated fees | [N]-[N] week critical path",
    "ALERTS: [N] critical | [N] caution | [N] informational",
    "DATA: [Verified — LA County Assessor | Estimated — ZIP/neighborhood knowledge]",
    "",
    "## Zone Alerts",
    "[CRITICAL|CAUTION|INFO] | [Alert Name] | [Dollar impact] | [Time impact]",
    "[One sentence: what must be done]",
    "If none: CLEAR | No special zone restrictions detected",
    "",
    "## Zoning & Density",
    "ZONING: [designation] — [full name]",
    "Development standards table (setbacks, height, coverage, FAR, parking, open space)",
    "DENSITY MATH: [lot sf] sf / 800 = [N] units by-right",
    "TOC BONUS: [result with tier]",
    "ADU: [N] ADUs + [N] JADUs above base under state law",
    "MAX BUILDOUT: [N] total units",
    "EXISTING STRUCTURE: [year built, units, sq ft — if known]",
    "",
    "## Permit Roadmap",
    "### Phase 1 - Pre-Application",
    "### Phase 2 - Primary Permits",
    "### Phase 3 - Trade & Ancillary",
    "[PERMIT NAME] | [OTC|PLAN CHECK|SPECIAL] | [Agency] | [X-Y weeks] | $[low]-$[high]",
    "CRITICAL PATH: [N]-[N] weeks",
    "",
    "## Documents",
    "DEMO | BUILDING | TECHNICAL REPORTS",
    "[Doc name] | [Who prepares] | [Stamp: YES/NO]",
    "",
    "## Fee Summary",
    "[Permit] | [Basis] | $[low]-$[high]",
    "TOTAL FEES: $[low]-$[high]",
    "EXCLUDES: [construction costs, relocation if applicable, utility connection fees]",
    "",
    "## Timeline",
    "Weeks [N]-[N]: [activity]",
    "BEST CASE: [N] weeks | WORST CASE: [N] weeks",
    "",
    "## Next Steps",
    "Max 7 items. First 3 actionable THIS WEEK.",
    "[N]. [Action] | [Who] | [Cost if any]",
    "",
    "## Legal Notice",
    "AI-generated guidance based on publicly available LA permit data. Always verify with your jurisdiction before submitting. This is not legal advice. Listo makes no warranties regarding accuracy or completeness.",
  ].join("\n");
}

// ── User message ──────────────────────────────────────────────────────────
function buildMessage(rawAddress, geocode, parcel, projectType, projectDetails) {
  const lines = ["PROPERTY:"];

  if (geocode) {
    lines.push(`Verified Address: ${geocode.address}`);
    lines.push(`City: ${geocode.city}, ZIP: ${geocode.zip}`);
    lines.push(`Coordinates: ${geocode.lat?.toFixed(5)}, ${geocode.lng?.toFixed(5)}`);
  } else {
    lines.push(`Address (unverified): ${rawAddress}`);
  }

  if (parcel) {
    lines.push("", "PARCEL DATA (LA County Assessor + LA City Planning — use as ground truth):");
    if (parcel.apn)              lines.push(`APN: ${parcel.apn}`);
    if (parcel.lotSizeSf)        lines.push(`Lot Size: ${parcel.lotSizeSf.toLocaleString()} sf (verified)`);
    if (parcel.zoning)           lines.push(`Zoning: ${parcel.zoning} (verified)`);
    if (parcel.existingUnits)    lines.push(`Existing Units: ${parcel.existingUnits}`);
    if (parcel.yearBuilt)        lines.push(`Year Built: ${parcel.yearBuilt}`);
    if (parcel.existingBuildingSqft) lines.push(`Existing Building: ${parcel.existingBuildingSqft} sf`);
    if (parcel.likelyRSO !== null) lines.push(`RSO: ${parcel.likelyRSO ? "Yes — pre-1978 multi-unit, full RSO compliance required" : "Likely No"}`);
    if (parcel.specificPlan)     lines.push(`Specific Plan: ${parcel.specificPlan}`);
    lines.push(`Source: ${parcel.source}`);
  } else {
    lines.push("", "PARCEL DATA: Not available — use ZIP/neighborhood knowledge. Flag all estimates as unverified.");
  }

  lines.push("", `Project Type: ${projectType}`);
  if (projectDetails) lines.push(`Details: ${projectDetails}`);
  lines.push("", "Produce a complete Listo permit analysis. This is a discovery analysis — the user does not know how many units are possible. Show them.");

  return lines.join("\n");
}
