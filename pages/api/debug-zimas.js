/**
 * Listo ZIMAS Debug v4 — ONE test per call, full timeout budget
 *
 * step 1: geocode
 * step 2: zma/zimas identify (zoning)
 * step 3: zma/zimas layer 1902 query
 * step 4: zma/coastal_zones identify
 * step 5: zma/legend identify (TOC, liquefaction)
 * step 6: zma/lotlines identify
 * step 7: zm4/landbase__FGDB identify
 * step 8: old D_QUERYLAYERS status check (is it really dead?)
 *
 * DELETE before production.
 */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { address, step, lat, lng } = req.body;
  if (!step) return res.status(400).json({ usage: "step 1=geocode, 2-7=ZIMAS tests (need lat/lng), 8=old service check" });

  const BASE = "https://zimas.lacity.org/arcgis/rest/services";

  // ── Step 1: Geocode ────────────────────────────────────────────────────
  if (step === 1) {
    if (!address) return res.status(400).json({ error: "address required" });
    const normalized = address
      .replace(/,?\s*(Venice|Westchester|Playa Del Rey|Mar Vista|Pacific Palisades|Silver Lake|Echo Park|Los Feliz|Hollywood Hills|Brentwood|Bel Air)\b/i, "")
      .trim().replace(/,\s*$/, "") + ", Los Angeles, CA";

    // Try Nominatim first (faster, works for Venice addresses)
    try {
      const q = encodeURIComponent(address + ", Los Angeles, CA");
      const r = await fetch(
        "https://nominatim.openstreetmap.org/search?q=" + q + "&format=json&limit=1&countrycodes=us",
        { headers: { "User-Agent": "Listo/1.0 (listo.zone)" }, signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const d = await r.json();
        if (d?.[0]) {
          return res.status(200).json({
            result: "GEOCODE OK",
            lat: parseFloat(d[0].lat),
            lng: parseFloat(d[0].lon),
            display: d[0].display_name,
          });
        }
      }
    } catch (e) {}
    return res.status(200).json({ result: "GEOCODE FAILED" });
  }

  // ── Shared setup for ZIMAS tests ───────────────────────────────────────
  if (!lat || !lng) return res.status(400).json({ error: "lat and lng required. Run step 1 first." });

  const geoJSON = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
  const geoSimple = lng + "," + lat;
  const extent = [lng - 0.0005, lat - 0.0005, lng + 0.0005, lat + 0.0005].join(",");

  async function doIdentify(service, layers) {
    const p = new URLSearchParams({
      geometry: geoJSON,
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: layers || "all",
      tolerance: "10",
      mapExtent: extent,
      imageDisplay: "600,400,96",
      returnGeometry: "false",
      f: "json",
    });
    const r = await fetch(BASE + "/" + service + "/MapServer/identify?" + p, { signal: AbortSignal.timeout(9000) });
    return r.json();
  }

  async function doQuery(service, layerId, geo) {
    const p = new URLSearchParams({
      geometry: geo,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "false",
      f: "json",
    });
    const r = await fetch(BASE + "/" + service + "/MapServer/" + layerId + "/query?" + p, { signal: AbortSignal.timeout(9000) });
    return r.json();
  }

  // ── Step 2: zma/zimas identify ─────────────────────────────────────────
  if (step === 2) {
    try {
      const d = await doIdentify("zma/zimas", "all");
      return res.status(200).json({
        test: "zma/zimas identify",
        ok: !d?.error,
        resultCount: d?.results?.length || 0,
        error: d?.error || null,
        results: (d?.results || []).map(x => ({
          layerId: x.layerId, layerName: x.layerName, attrs: x.attributes,
        })).slice(0, 15),
      });
    } catch (e) {
      return res.status(200).json({ test: "zma/zimas identify", error: e.message });
    }
  }

  // ── Step 3: zma/zimas/1902 query (Zoning layer) ────────────────────────
  if (step === 3) {
    try {
      const d = await doQuery("zma/zimas", 1902, geoJSON);
      return res.status(200).json({
        test: "zma/zimas/1902 query (JSON geo)",
        ok: !d?.error,
        featureCount: d?.features?.length || 0,
        error: d?.error || null,
        fields: d?.features?.[0]?.attributes ? Object.keys(d.features[0].attributes) : [],
        sample: d?.features?.[0]?.attributes || null,
      });
    } catch (e) {
      return res.status(200).json({ test: "zma/zimas/1902 query", error: e.message });
    }
  }

  // ── Step 4: zma/coastal_zones identify ─────────────────────────────────
  if (step === 4) {
    try {
      const d = await doIdentify("zma/coastal_zones", "all");
      return res.status(200).json({
        test: "zma/coastal_zones identify",
        ok: !d?.error,
        resultCount: d?.results?.length || 0,
        error: d?.error || null,
        results: (d?.results || []).map(x => ({
          layerId: x.layerId, layerName: x.layerName, attrs: x.attributes,
        })).slice(0, 10),
      });
    } catch (e) {
      return res.status(200).json({ test: "zma/coastal_zones identify", error: e.message });
    }
  }

  // ── Step 5: zma/legend identify (TOC, liquefaction, overlays) ──────────
  if (step === 5) {
    try {
      const d = await doIdentify("zma/legend", "all");
      return res.status(200).json({
        test: "zma/legend identify",
        ok: !d?.error,
        resultCount: d?.results?.length || 0,
        error: d?.error || null,
        results: (d?.results || []).map(x => ({
          layerId: x.layerId, layerName: x.layerName, attrs: x.attributes,
        })).slice(0, 20),
      });
    } catch (e) {
      return res.status(200).json({ test: "zma/legend identify", error: e.message });
    }
  }

  // ── Step 6: zma/lotlines identify ──────────────────────────────────────
  if (step === 6) {
    try {
      const d = await doIdentify("zma/lotlines", "all");
      return res.status(200).json({
        test: "zma/lotlines identify",
        ok: !d?.error,
        resultCount: d?.results?.length || 0,
        error: d?.error || null,
        results: (d?.results || []).map(x => ({
          layerId: x.layerId, layerName: x.layerName,
          fields: x.attributes ? Object.keys(x.attributes) : [],
          attrs: x.attributes,
        })).slice(0, 5),
      });
    } catch (e) {
      return res.status(200).json({ test: "zma/lotlines identify", error: e.message });
    }
  }

  // ── Step 7: zm4/landbase__FGDB identify ────────────────────────────────
  if (step === 7) {
    try {
      const d = await doIdentify("zm4/landbase__FGDB", "all");
      return res.status(200).json({
        test: "zm4/landbase__FGDB identify",
        ok: !d?.error,
        resultCount: d?.results?.length || 0,
        error: d?.error || null,
        results: (d?.results || []).map(x => ({
          layerId: x.layerId, layerName: x.layerName,
          fields: x.attributes ? Object.keys(x.attributes) : [],
          attrs: x.attributes,
        })).slice(0, 10),
      });
    } catch (e) {
      return res.status(200).json({ test: "zm4/landbase__FGDB identify", error: e.message });
    }
  }

  // ── Step 8: check if old services are truly dead ───────────────────────
  if (step === 8) {
    const results = {};
    for (const svc of ["B_ZONING", "D_QUERYLAYERS", "D_LEGENDLAYERS"]) {
      try {
        const r = await fetch(BASE + "/" + svc + "/MapServer?f=json", { signal: AbortSignal.timeout(3000) });
        const d = await r.json();
        results[svc] = d?.error ? "DEAD: " + d.error.message : "ALIVE (" + (d?.layers?.length || 0) + " layers)";
      } catch (e) {
        results[svc] = "TIMEOUT/ERROR: " + e.message;
      }
    }
    return res.status(200).json({ test: "old service status", results });
  }

  return res.status(400).json({ error: "step must be 1-8" });
}
