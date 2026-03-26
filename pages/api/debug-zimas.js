/**
 * Listo ZIMAS Diagnostic — /api/debug-zimas
 *
 * Deploy alongside analyze.js. Hit it with:
 *   POST /api/debug-zimas { "address": "622 Woodlawn Ave, Venice" }
 *
 * Returns step-by-step results for every query in the pipeline,
 * including raw response bodies so you can see exactly what ZIMAS returns.
 *
 * DELETE THIS FILE before going to production.
 */

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "address required" });

  const log = [];
  const step = (name, data) => { log.push({ step: name, ...data }); };

  // ── 1. Census Geocoder ─────────────────────────────────────────────────
  let lat = null, lng = null, matchedAddr = null;
  try {
    const normalized = address.replace(/,?\s*Venice\b/i, "") + ", Los Angeles, CA";
    const params = new URLSearchParams({
      address: normalized,
      benchmark: "Public_AR_Current",
      format: "json",
    });
    const url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" + params;
    step("census_url", { url });
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    const m = d?.result?.addressMatches?.[0];
    if (m) {
      lat = m.coordinates?.y;
      lng = m.coordinates?.x;
      matchedAddr = m.matchedAddress;
      step("census_result", { status: "HIT", matchedAddr, lat, lng });
    } else {
      step("census_result", { status: "NO MATCH", input: normalized, matchCount: d?.result?.addressMatches?.length || 0 });
    }
  } catch (e) {
    step("census_result", { status: "ERROR", message: e.message });
  }

  // ── 2. Nominatim fallback ──────────────────────────────────────────────
  if (!lat) {
    try {
      const q = encodeURIComponent(address + ", Los Angeles, CA");
      const url = "https://nominatim.openstreetmap.org/search?q=" + q + "&format=json&limit=1&countrycodes=us";
      step("nominatim_url", { url });
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      if (d?.[0]) {
        lat = parseFloat(d[0].lat);
        lng = parseFloat(d[0].lon);
        step("nominatim_result", { status: "HIT", lat, lng, display: d[0].display_name });
      } else {
        step("nominatim_result", { status: "NO MATCH" });
      }
    } catch (e) {
      step("nominatim_result", { status: "ERROR", message: e.message });
    }
  }

  if (!lat || !lng) {
    step("FATAL", { message: "No geocode coordinates — cannot test spatial queries" });
    return res.status(200).json({ log });
  }

  const BASE = "https://zimas.lacity.org/ArcGIS/rest/services";
  const geoJSON = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
  const geoSimple = lng + "," + lat;
  const extent = [lng - 0.001, lat - 0.001, lng + 0.001, lat + 0.001].join(",");

  // ── 3. B_ZONING identify ──────────────────────────────────────────────
  try {
    const params = new URLSearchParams({
      geometry: geoJSON,
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: "all",
      tolerance: "3",
      mapExtent: extent,
      imageDisplay: "400,300,96",
      returnGeometry: "false",
      f: "json",
    });
    const url = BASE + "/B_ZONING/MapServer/identify?" + params;
    step("b_zoning_identify_url", { url: url.substring(0, 300) });
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const d = await r.json();
    step("b_zoning_identify", {
      status: r.ok ? "OK" : "HTTP " + r.status,
      resultCount: d?.results?.length || 0,
      error: d?.error || null,
      results: (d?.results || []).map(r => ({
        layerId: r.layerId,
        layerName: r.layerName,
        attributes: r.attributes
      })).slice(0, 5),
    });
  } catch (e) {
    step("b_zoning_identify", { status: "ERROR", message: e.message });
  }

  // ── 4. B_ZONING query (layers 0, 1, 2, 9) ────────────────────────────
  for (const layerNum of [0, 1, 2, 9]) {
    for (const geo of [geoJSON, geoSimple]) {
      try {
        const params = new URLSearchParams({
          geometry: geo,
          geometryType: "esriGeometryPoint",
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          outFields: "*",
          returnGeometry: "false",
          f: "json",
        });
        const url = BASE + "/B_ZONING/MapServer/" + layerNum + "/query?" + params;
        const geoLabel = geo.startsWith("{") ? "JSON" : "simple";
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const d = await r.json();
        const featureCount = d?.features?.length || 0;
        step("b_zoning_query_" + layerNum + "_" + geoLabel, {
          status: r.ok ? "OK" : "HTTP " + r.status,
          featureCount,
          error: d?.error || null,
          fields: featureCount > 0 ? Object.keys(d.features[0].attributes) : [],
          sample: featureCount > 0 ? d.features[0].attributes : null,
        });
        if (featureCount > 0) break; // Found data with this layer, skip other geo format
      } catch (e) {
        step("b_zoning_query_" + layerNum, { status: "ERROR", message: e.message });
      }
    }
  }

  // ── 5. D_QUERYLAYERS identify ─────────────────────────────────────────
  try {
    const params = new URLSearchParams({
      geometry: geoJSON,
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: "all:0",
      tolerance: "3",
      mapExtent: extent,
      imageDisplay: "400,300,96",
      returnGeometry: "false",
      f: "json",
    });
    const url = BASE + "/D_QUERYLAYERS/MapServer/identify?" + params;
    step("d_query_identify_url", { url: url.substring(0, 300) });
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const d = await r.json();
    step("d_query_identify", {
      status: r.ok ? "OK" : "HTTP " + r.status,
      resultCount: d?.results?.length || 0,
      error: d?.error || null,
      results: (d?.results || []).map(r => ({
        layerId: r.layerId,
        layerName: r.layerName,
        fields: r.attributes ? Object.keys(r.attributes) : [],
        attributes: r.attributes,
      })).slice(0, 3),
    });
  } catch (e) {
    step("d_query_identify", { status: "ERROR", message: e.message });
  }

  // ── 6. D_QUERYLAYERS spatial query (layer 0) ──────────────────────────
  for (const geo of [geoJSON, geoSimple]) {
    try {
      const geoLabel = geo.startsWith("{") ? "JSON" : "simple";
      const params = new URLSearchParams({
        geometry: geo,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "*",
        returnGeometry: "false",
        f: "json",
      });
      const url = BASE + "/D_QUERYLAYERS/MapServer/0/query?" + params;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const featureCount = d?.features?.length || 0;
      step("d_query_layer0_" + geoLabel, {
        status: r.ok ? "OK" : "HTTP " + r.status,
        featureCount,
        error: d?.error || null,
        fields: featureCount > 0 ? Object.keys(d.features[0].attributes) : [],
        sample: featureCount > 0 ? d.features[0].attributes : null,
      });
    } catch (e) {
      step("d_query_layer0_" + (geo.startsWith("{") ? "JSON" : "simple"), { status: "ERROR", message: e.message });
    }
  }

  // ── 7. D_QUERYLAYERS APN query (known good APN) ───────────────────────
  try {
    const params = new URLSearchParams({
      where: "APN='4237012009'",
      outFields: "*",
      returnGeometry: "false",
      f: "json",
    });
    const url = BASE + "/D_QUERYLAYERS/MapServer/0/query?" + params;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    const featureCount = d?.features?.length || 0;
    step("d_query_apn_lookup", {
      status: r.ok ? "OK" : "HTTP " + r.status,
      apn: "4237012009",
      featureCount,
      error: d?.error || null,
      fields: featureCount > 0 ? Object.keys(d.features[0].attributes) : [],
      sample: featureCount > 0 ? d.features[0].attributes : null,
    });
  } catch (e) {
    step("d_query_apn_lookup", { status: "ERROR", message: e.message });
  }

  // ── 8. Address query with variants ────────────────────────────────────
  for (const variant of ["622 WOODLAWN AVE", "622 W WOODLAWN AVE"]) {
    try {
      const params = new URLSearchParams({
        where: "SITUS_ADDR LIKE '" + variant + "%'",
        outFields: "*",
        returnGeometry: "false",
        f: "json",
      });
      const url = BASE + "/D_QUERYLAYERS/MapServer/0/query?" + params;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const featureCount = d?.features?.length || 0;
      step("address_query_" + variant.replace(/\s+/g, "_"), {
        status: r.ok ? "OK" : "HTTP " + r.status,
        featureCount,
        error: d?.error || null,
        fields: featureCount > 0 ? Object.keys(d.features[0].attributes) : [],
        sample: featureCount > 0 ? d.features[0].attributes : null,
      });
    } catch (e) {
      step("address_query_" + variant, { status: "ERROR", message: e.message });
    }
  }

  // ── 9. D_LEGENDLAYERS identify ────────────────────────────────────────
  try {
    const params = new URLSearchParams({
      geometry: geoJSON,
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: "all",
      tolerance: "3",
      mapExtent: extent,
      imageDisplay: "400,300,96",
      returnGeometry: "false",
      f: "json",
    });
    const url = BASE + "/D_LEGENDLAYERS/MapServer/identify?" + params;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    step("d_legend_identify", {
      status: r.ok ? "OK" : "HTTP " + r.status,
      resultCount: d?.results?.length || 0,
      error: d?.error || null,
      results: (d?.results || []).map(r => ({
        layerId: r.layerId,
        layerName: r.layerName,
        attributes: r.attributes,
      })).slice(0, 15),
    });
  } catch (e) {
    step("d_legend_identify", { status: "ERROR", message: e.message });
  }

  // ── 10. Service directory check ───────────────────────────────────────
  for (const svc of ["B_ZONING", "D_QUERYLAYERS", "D_LEGENDLAYERS"]) {
    try {
      const url = BASE + "/" + svc + "/MapServer?f=json";
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      step("service_" + svc, {
        status: r.ok ? "OK" : "HTTP " + r.status,
        serviceName: d?.mapName || d?.serviceDescription || "?",
        layerCount: d?.layers?.length || 0,
        layers: (d?.layers || []).map(l => ({
          id: l.id,
          name: l.name,
          type: l.type,
        })).slice(0, 20),
      });
    } catch (e) {
      step("service_" + svc, { status: "ERROR", message: e.message });
    }
  }

  // ── 11. RSO layer check ───────────────────────────────────────────────
  try {
    const params = new URLSearchParams({
      where: "Property_Address LIKE '622 W WOODLAWN%'",
      outFields: "*",
      returnGeometry: "false",
      f: "json",
    });
    const url = BASE + "/D_QUERYLAYERS/MapServer/12/query?" + params;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    step("rso_query", {
      status: r.ok ? "OK" : "HTTP " + r.status,
      featureCount: d?.features?.length || 0,
      error: d?.error || null,
      sample: d?.features?.[0]?.attributes || null,
    });
  } catch (e) {
    step("rso_query", { status: "ERROR", message: e.message });
  }

  return res.status(200).json({
    address,
    geocode: { lat, lng, matchedAddr },
    testCount: log.length,
    log,
  });
}
