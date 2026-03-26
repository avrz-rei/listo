/**
 * Listo ZIMAS Debug v3 — tests ACTIVE services under zma/ folder
 *
 * The old B_ZONING, D_QUERYLAYERS, D_LEGENDLAYERS services are STOPPED.
 * Active services are all under zma/:
 *   zma/zimas/MapServer     — zoning, parcels
 *   zma/coastal_zones       — coastal zone layers
 *   zma/legend              — TOC, liquefaction, overlays
 *   zma/lotlines            — parcel lot lines
 *   zm4/landbase__FGDB      — landbase parcel data
 *
 * Step 1: Geocoder (Census + Nominatim with directional retries)
 * Step 2: Active ZIMAS services identify + query
 *
 * DELETE before production.
 */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { address, step, lat, lng } = req.body;
  if (!step) return res.status(400).json({
    error: "Pass step: 1 (geocode) or 2 (ZIMAS spatial — needs lat/lng from step 1)"
  });

  const log = [];
  const s = (name, data) => log.push({ step: name, ...data });
  const BASE = "https://zimas.lacity.org/arcgis/rest/services";

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Geocoder
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 1) {
    if (!address) return res.status(400).json({ error: "address required" });
    const normalized = address
      .replace(/,?\s*(Venice|Westchester|Playa Del Rey|Mar Vista|Pacific Palisades|Silver Lake|Echo Park|Los Feliz|Hollywood Hills|Brentwood|Bel Air)\b/i, "")
      .trim().replace(/,\s*$/, "") + ", Los Angeles, CA";

    const variants = [normalized];
    const m = normalized.match(/^(\d+)\s+(?!([NSEW])\s)(.+)/i);
    if (m) {
      for (const dir of ["W", "E", "N", "S"]) {
        variants.push(m[1] + " " + dir + " " + m[3]);
      }
    }

    // Census
    for (const v of variants) {
      try {
        const p = new URLSearchParams({ address: v, benchmark: "Public_AR_Current", format: "json" });
        const r = await fetch("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" + p, { signal: AbortSignal.timeout(6000) });
        const d = await r.json();
        const match = d?.result?.addressMatches?.[0];
        if (match) {
          return res.status(200).json({
            result: "GEOCODE SUCCESS (Census)",
            lat: match.coordinates?.y, lng: match.coordinates?.x,
            matchedAddress: match.matchedAddress,
            variant: v,
            nextStep: "Run step 2 with these lat/lng values",
          });
        }
      } catch (e) {}
    }

    // Nominatim fallback
    try {
      const q = encodeURIComponent(address + ", Los Angeles, CA");
      const r = await fetch(
        "https://nominatim.openstreetmap.org/search?q=" + q + "&format=json&limit=1&countrycodes=us",
        { headers: { "User-Agent": "Listo/1.0 (listo.zone)" }, signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const d = await r.json();
        if (d?.[0]) {
          return res.status(200).json({
            result: "GEOCODE SUCCESS (Nominatim)",
            lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon),
            display: d[0].display_name,
            nextStep: "Run step 2 with these lat/lng values",
          });
        }
      }
    } catch (e) {}

    return res.status(200).json({ result: "GEOCODE FAILED", log });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: ZIMAS active services (needs lat/lng)
  // ═══════════════════════════════════════════════════════════════════════
  if (step === 2) {
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required. Run step 1 first." });

    const geoJSON = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
    const geoSimple = lng + "," + lat;
    const extent = [lng - 0.0005, lat - 0.0005, lng + 0.0005, lat + 0.0005].join(",");

    const identifyParams = (layers) => new URLSearchParams({
      geometry: geoJSON,
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: layers || "all",
      tolerance: "5",
      mapExtent: extent,
      imageDisplay: "600,400,96",
      returnGeometry: "false",
      f: "json",
    });

    const queryParams = (geo) => new URLSearchParams({
      geometry: geo,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "false",
      f: "json",
    });

    // ── Test 1: zma/zimas identify (zoning + everything) ────────────────
    try {
      const r = await fetch(BASE + "/zma/zimas/MapServer/identify?" + identifyParams("all"), { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      s("zma_zimas_identify", {
        ok: !d?.error,
        resultCount: d?.results?.length || 0,
        error: d?.error || null,
        results: (d?.results || []).map(x => ({
          layerId: x.layerId, layerName: x.layerName, attrs: x.attributes,
        })).slice(0, 10),
      });
    } catch (e) { s("zma_zimas_identify", { error: e.message }); }

    // ── Test 2: zma/zimas layer 1902 query (Zoning) ─────────────────────
    try {
      const r = await fetch(BASE + "/zma/zimas/MapServer/1902/query?" + queryParams(geoJSON), { signal: AbortSignal.timeout(6000) });
      const d = await r.json();
      s("zma_zimas_1902_query", {
        ok: !d?.error,
        featureCount: d?.features?.length || 0,
        error: d?.error || null,
        fields: d?.features?.[0]?.attributes ? Object.keys(d.features[0].attributes) : [],
        sample: d?.features?.[0]?.attributes || null,
      });
    } catch (e) { s("zma_zimas_1902_query", { error: e.message }); }

    // ── Test 3: zma/coastal_zones identify ───────────────────────────────
    try {
      const r = await fetch(BASE + "/zma/coastal_zones/MapServer/identify?" + identifyParams("all"), { signal: AbortSignal.timeout(6000) });
      const d = await r.json();
      s("zma_coastal_identify", {
        ok: !d?.error,
        resultCount: d?.results?.length || 0,
        error: d?.error || null,
        results: (d?.results || []).map(x => ({
          layerId: x.layerId, layerName: x.layerName, attrs: x.attributes,
        })).slice(0, 10),
      });
    } catch (e) { s("zma_coastal_identify", { error: e.message }); }

    // ── Test 4: zma/legend identify (TOC, liquefaction, overlays) ────────
    try {
      const r = await fetch(BASE + "/zma/legend/MapServer/identify?" + identifyParams("all"), { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      s("zma_legend_identify", {
        ok: !d?.error,
        resultCount: d?.results?.length || 0,
        error: d?.error || null,
        results: (d?.results || []).map(x => ({
          layerId: x.layerId, layerName: x.layerName, attrs: x.attributes,
        })).slice(0, 15),
      });
    } catch (e) { s("zma_legend_identify", { error: e.message }); }

    // ── Test 5: zma/lotlines identify (parcel boundaries) ────────────────
    try {
      const r = await fetch(BASE + "/zma/lotlines/MapServer/identify?" + identifyParams("all"), { signal: AbortSignal.timeout(6000) });
      const d = await r.json();
      s("zma_lotlines_identify", {
        ok: !d?.error,
        resultCount: d?.results?.length || 0,
        error: d?.error || null,
        results: (d?.results || []).map(x => ({
          layerId: x.layerId, layerName: x.layerName,
          fields: x.attributes ? Object.keys(x.attributes) : [],
          attrs: x.attributes,
        })).slice(0, 5),
      });
    } catch (e) { s("zma_lotlines_identify", { error: e.message }); }

    // ── Test 6: zm4/landbase__FGDB identify (parcel data?) ───────────────
    try {
      const r = await fetch(BASE + "/zm4/landbase__FGDB/MapServer/identify?" + identifyParams("all"), { signal: AbortSignal.timeout(6000) });
      const d = await r.json();
      s("zm4_landbase_identify", {
        ok: !d?.error,
        resultCount: d?.results?.length || 0,
        error: d?.error || null,
        results: (d?.results || []).map(x => ({
          layerId: x.layerId, layerName: x.layerName,
          fields: x.attributes ? Object.keys(x.attributes) : [],
          attrs: x.attributes,
        })).slice(0, 10),
      });
    } catch (e) { s("zm4_landbase_identify", { error: e.message }); }

    // ── Test 7: simple format fallback on zma/zimas/1902 ────────────────
    try {
      const r = await fetch(BASE + "/zma/zimas/MapServer/1902/query?" + queryParams(geoSimple), { signal: AbortSignal.timeout(6000) });
      const d = await r.json();
      s("zma_zimas_1902_simple", {
        ok: !d?.error,
        featureCount: d?.features?.length || 0,
        error: d?.error || null,
        sample: d?.features?.[0]?.attributes || null,
      });
    } catch (e) { s("zma_zimas_1902_simple", { error: e.message }); }

    return res.status(200).json({ result: "ACTIVE SERVICE TESTS DONE", lat, lng, log });
  }

  return res.status(400).json({ error: "Invalid step. Use 1 or 2." });
}
