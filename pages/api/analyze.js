/**
 * Listo API — /api/analyze  (v4 — ZIMAS debug fix)
 *
 * Data pipeline:
 * 1. Census geocoder → verified address + lat/lng (Nominatim fallback)
 * 2. ZIMAS spatial queries via identify + query → zoning, lot, overlays
 * 3. ZIMAS address queries with directional retries → supplementary data
 * 4. Claude analysis with verified parcel data
 *
 * v4 fixes:
 * - JSON geometry format for all spatial queries (ESRI compliance)
 * - identify operation as primary spatial lookup (what ZIMAS website uses)
 * - outFields=* on all queries to auto-detect field names
 * - Full response body logging for Vercel debug
 * - Nominatim geocoder fallback when Census fails
 * - Auto-detection of field names from response attributes
 */

// ── LA neighborhood → city mapping ───────────────────────────────────────
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
  "San Pedro","Wilmington","Harbor City","Harbor Gateway",
  "Playa Vista","El Segundo-adjacent",
];

function normalizeAddressForGeocode(raw) {
  const s = raw.trim();
  const knownCities = /\b(Los Angeles|Santa Monica|Beverly Hills|Malibu|Burbank|Glendale|Pasadena|Long Beach|Torrance|Inglewood|Compton|Carson|Culver City|West Hollywood|El Segundo|Hawthorne|Gardena|Redondo Beach|Hermosa Beach|Manhattan Beach)\b/i;
  if (knownCities.test(s)) return s;
  if (/\b\d{5}\b/.test(s)) return s;
  for (const hood of LA_NEIGHBORHOODS) {
    if (s.toLowerCase().includes(hood.toLowerCase())) {
      const re = new RegExp(",?\\s*" + hood.replace(/[-]/g, "[-]?"), "i");
      const cleaned = s.replace(re, "").trim().replace(/,\s*$/, "");
      console.log("[GEOCODE] Normalize: '" + s + "' → '" + cleaned + ", Los Angeles, CA'");
      return cleaned + ", Los Angeles, CA";
    }
  }
  return /CA|California/i.test(s) ? s : s + ", Los Angeles, CA";
}

// ── Safe fetch with timeout (works on Node 16+) ─────────────────────────
async function safeFetch(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return r;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { address, projectType, projectDetails } = req.body;
  if (!address || !projectType) return res.status(400).json({ error: "Address and project type required" });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured." });

  try {
    // ── Step 1: Geocode ──────────────────────────────────────────────────
    let geocode = null;

    // 1a. Census geocoder (primary)
    try {
      const geocodeAddr = normalizeAddressForGeocode(address);
      const params = new URLSearchParams({
        address: geocodeAddr,
        benchmark: "Public_AR_Current",
        format: "json",
      });
      console.log("[GEOCODE] Census query:", geocodeAddr);
      const r = await safeFetch(
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?" + params,
        10000
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
          console.log("[GEOCODE] Census SUCCESS:", geocode.address, "lat=" + geocode.lat, "lng=" + geocode.lng);
        } else {
          console.log("[GEOCODE] Census: no match. Matches returned:", d?.result?.addressMatches?.length || 0);
        }
      } else {
        console.log("[GEOCODE] Census HTTP error:", r.status);
      }
    } catch (e) { console.log("[GEOCODE] Census error:", e.message); }

    // 1b. Nominatim fallback (if Census returned nothing)
    if (!geocode) {
      try {
        const geocodeAddr = normalizeAddressForGeocode(address);
        const q = encodeURIComponent(geocodeAddr + (geocodeAddr.includes("CA") ? "" : ", CA"));
        console.log("[GEOCODE] Nominatim fallback:", geocodeAddr);
        const r = await safeFetch(
          "https://nominatim.openstreetmap.org/search?q=" + q + "&format=json&limit=1&countrycodes=us",
          8000
        );
        if (r.ok) {
          const d = await r.json();
          if (d?.[0]) {
            geocode = {
              address: d[0].display_name,
              city: "Los Angeles",
              state: "CA",
              zip: "",
              lat: parseFloat(d[0].lat),
              lng: parseFloat(d[0].lon),
            };
            console.log("[GEOCODE] Nominatim SUCCESS:", geocode.lat, geocode.lng);
          } else {
            console.log("[GEOCODE] Nominatim: no match");
          }
        }
      } catch (e) { console.log("[GEOCODE] Nominatim error:", e.message); }
    }

    // ── Step 2: ZIMAS parcel data ────────────────────────────────────────
    let parcel = null;
    try {
      parcel = await queryZIMAS(geocode?.address || address, geocode);
    } catch (e) {
      console.log("[ZIMAS] Top-level failure:", e.message);
    }

    // ── Step 3: Claude ───────────────────────────────────────────────────
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
    console.error("[HANDLER] Fatal error:", err);
    return res.status(500).json({ error: err.message });
  }
}


// ══════════════════════════════════════════════════════════════════════════
// ZIMAS QUERY ENGINE
// ══════════════════════════════════════════════════════════════════════════

async function queryZIMAS(address, geocode) {
  const BASE = "https://zimas.lacity.org/ArcGIS/rest/services";
  const result = { source: "ZIMAS", hasData: false };

  // ── SPATIAL QUERIES — use lat/lng (PRIMARY path) ───────────────────────
  if (geocode?.lat && geocode?.lng) {
    const lng = geocode.lng;
    const lat = geocode.lat;

    // Build JSON geometry (ESRI-compliant format — more reliable than x,y string)
    const geoJSON = JSON.stringify({
      x: lng, y: lat,
      spatialReference: { wkid: 4326 }
    });

    // Simple comma format as fallback
    const geoSimple = lng + "," + lat;

    // Build a mapExtent around the point for identify operations
    const extent = [lng - 0.001, lat - 0.001, lng + 0.001, lat + 0.001].join(",");

    console.log("[ZIMAS] Starting spatial queries at lat=" + lat + " lng=" + lng);

    // ── 1. B_ZONING — authoritative zoning via identify ──────────────────
    // The identify operation is what ESRI web apps use for point-click lookups.
    // It's more reliable than query for point-in-polygon on map services.
    try {
      const identifyParams = new URLSearchParams({
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
      const url = BASE + "/B_ZONING/MapServer/identify?" + identifyParams;
      console.log("[ZIMAS] B_ZONING identify...");
      const r = await safeFetch(url, 12000);
      if (r.ok) {
        const d = await r.json();
        console.log("[ZIMAS] B_ZONING identify response: " + JSON.stringify(d).substring(0, 500));
        if (d?.results?.length > 0) {
          for (const item of d.results) {
            const a = item.attributes;
            if (!a) continue;
            const zoning = findField(a, ["ZONE_CMPLT", "ZONE_CLASS", "ZONING", "Zone"]);
            if (zoning && !result.zoning) {
              result.zoning = zoning;
              result.zoningSource = "ZIMAS B_ZONING identify (verified)";
              result.hasData = true;
              console.log("[ZIMAS] B_ZONING identify HIT — zoning:", zoning, "layer:", item.layerId);
            }
            const hd = findField(a, ["HEIGHT_DIST", "HT_DIST", "HEIGHT"]);
            if (hd && !result.heightDistrict) result.heightDistrict = hd;
            const sp = findField(a, ["SPECIFIC_PLAN", "SP_NAME"]);
            if (sp && !result.specificPlan) result.specificPlan = sp;
          }
        } else {
          console.log("[ZIMAS] B_ZONING identify: 0 results");
          if (d?.error) console.log("[ZIMAS] B_ZONING identify error:", JSON.stringify(d.error));
        }
      } else {
        console.log("[ZIMAS] B_ZONING identify HTTP:", r.status);
      }
    } catch (e) { console.log("[ZIMAS] B_ZONING identify error:", e.message); }

    // ── 1b. B_ZONING query fallback ──────────────────────────────────────
    if (!result.zoning) {
      for (const geo of [geoJSON, geoSimple]) {
        try {
          const qp = new URLSearchParams({
            geometry: geo,
            geometryType: "esriGeometryPoint",
            inSR: "4326",
            spatialRel: "esriSpatialRelIntersects",
            outFields: "*",
            returnGeometry: "false",
            f: "json",
          });
          // Try multiple layer numbers — the zoning layer may not be 9
          for (const layerNum of [9, 0, 1, 2]) {
            const url = BASE + "/B_ZONING/MapServer/" + layerNum + "/query?" + qp;
            console.log("[ZIMAS] B_ZONING query layer/" + layerNum + " geo=" + geo.substring(0, 20));
            const r = await safeFetch(url, 10000);
            if (r.ok) {
              const d = await r.json();
              if (d?.error) {
                console.log("[ZIMAS] B_ZONING/" + layerNum + " ESRI error:", d.error.message || d.error.code);
                continue;
              }
              const f = d?.features?.[0]?.attributes;
              if (f) {
                result.zoning = findField(f, ["ZONE_CMPLT", "ZONE_CLASS", "ZONING"]);
                result.heightDistrict = findField(f, ["HEIGHT_DIST", "HT_DIST"]);
                result.specificPlan = findField(f, ["SPECIFIC_PLAN"]);
                result.hasData = true;
                result.zoningSource = "ZIMAS B_ZONING/" + layerNum + " query (verified)";
                console.log("[ZIMAS] B_ZONING/" + layerNum + " query HIT:", result.zoning, "fields:", Object.keys(f).join(","));
                break;
              }
            }
          }
          if (result.zoning) break; // Got zoning, stop trying geo formats
        } catch (e) { console.log("[ZIMAS] B_ZONING query error:", e.message); }
      }
    }

    // ── 2. D_QUERYLAYERS — parcel data via identify ──────────────────────
    try {
      const identifyParams = new URLSearchParams({
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
      const url = BASE + "/D_QUERYLAYERS/MapServer/identify?" + identifyParams;
      console.log("[ZIMAS] D_QUERYLAYERS identify...");
      const r = await safeFetch(url, 12000);
      if (r.ok) {
        const d = await r.json();
        console.log("[ZIMAS] D_QUERYLAYERS identify response: " + JSON.stringify(d).substring(0, 800));
        if (d?.results?.length > 0) {
          const a = d.results[0].attributes;
          if (a) {
            extractParcelFields(a, result);
            result.spatialParcelHit = true;
            console.log("[ZIMAS] D_QUERYLAYERS identify HIT — APN:", result.apn, "lot:", result.lotSizeSf);
          }
        } else {
          console.log("[ZIMAS] D_QUERYLAYERS identify: 0 results");
          if (d?.error) console.log("[ZIMAS] D_QUERYLAYERS identify error:", JSON.stringify(d.error));
        }
      } else {
        console.log("[ZIMAS] D_QUERYLAYERS identify HTTP:", r.status);
      }
    } catch (e) { console.log("[ZIMAS] D_QUERYLAYERS identify error:", e.message); }

    // ── 2b. D_QUERYLAYERS spatial query fallback ─────────────────────────
    if (!result.spatialParcelHit) {
      for (const geo of [geoJSON, geoSimple]) {
        try {
          const qp = new URLSearchParams({
            geometry: geo,
            geometryType: "esriGeometryPoint",
            inSR: "4326",
            spatialRel: "esriSpatialRelIntersects",
            outFields: "*",
            returnGeometry: "false",
            f: "json",
          });
          const url = BASE + "/D_QUERYLAYERS/MapServer/0/query?" + qp;
          console.log("[ZIMAS] D_QUERYLAYERS/0 query geo=" + geo.substring(0, 20));
          const r = await safeFetch(url, 10000);
          if (r.ok) {
            const d = await r.json();
            console.log("[ZIMAS] D_QUERYLAYERS/0 query response: " + JSON.stringify(d).substring(0, 500));
            if (d?.error) {
              console.log("[ZIMAS] D_QUERYLAYERS/0 ESRI error:", d.error.message || d.error.code);
              continue;
            }
            const f = d?.features?.[0]?.attributes;
            if (f) {
              extractParcelFields(f, result);
              result.spatialParcelHit = true;
              console.log("[ZIMAS] D_QUERYLAYERS/0 query HIT — APN:", result.apn);
              break;
            }
          }
        } catch (e) { console.log("[ZIMAS] D_QUERYLAYERS query error:", e.message); }
      }
    }

    // ── 3. D_LEGENDLAYERS — Coastal Zone + TOC + Liquefaction (spatial) ──
    try {
      const identifyParams = new URLSearchParams({
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
      const url = BASE + "/D_LEGENDLAYERS/MapServer/identify?" + identifyParams;
      console.log("[ZIMAS] D_LEGENDLAYERS identify...");
      const r = await safeFetch(url, 15000);
      if (r.ok) {
        const d = await r.json();
        console.log("[ZIMAS] D_LEGENDLAYERS identify: " + (d?.results?.length || 0) + " results");
        if (d?.results?.length > 0) {
          for (const item of d.results) {
            const a = item.attributes;
            if (!a) continue;
            const layerName = (item.layerName || "").toUpperCase();

            // Coastal Zone
            if (layerName.includes("COASTAL") || findField(a, ["CST_TYPE", "CST_ZONE"])) {
              result.coastalZone = "Yes";
              result.coastalZoneType = findField(a, ["CST_TYPE", "CST_ZONE", "SUBTYPE", "TYPE", "LABEL"]) || "Coastal Zone";
              result.hasData = true;
              console.log("[ZIMAS] Coastal zone HIT:", result.coastalZoneType, "layer:", item.layerId);
            }

            // TOC
            if (layerName.includes("TOC") || layerName.includes("TRANSIT ORIENTED")) {
              const tier = findField(a, ["TIER", "TOC_TIER", "TOC", "LABEL"]);
              if (tier) {
                result.toc = String(tier).match(/\d/) ? "Tier " + tier.toString().replace(/\D/g, "") : tier;
                result.hasData = true;
                console.log("[ZIMAS] TOC HIT:", result.toc, "layer:", item.layerId);
              }
            }

            // Liquefaction
            if (layerName.includes("LIQUEFACTION")) {
              result.liquefaction = true;
              result.hasData = true;
              console.log("[ZIMAS] Liquefaction HIT from legend layer:", item.layerId);
            }
          }
        }
      }
    } catch (e) { console.log("[ZIMAS] D_LEGENDLAYERS identify error:", e.message); }

    // ── 3b. Coastal Zone query fallback (layer 112) ──────────────────────
    if (!result.coastalZone) {
      try {
        const qp = new URLSearchParams({
          geometry: geoJSON,
          geometryType: "esriGeometryPoint",
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          outFields: "*",
          returnGeometry: "false",
          f: "json",
        });
        const r = await safeFetch(BASE + "/D_LEGENDLAYERS/MapServer/112/query?" + qp, 8000);
        if (r.ok) {
          const d = await r.json();
          if (d?.features?.length > 0) {
            const a = d.features[0].attributes;
            result.coastalZone = "Yes";
            result.coastalZoneType = findField(a, ["CST_TYPE", "CST_ZONE", "SUBTYPE", "TYPE"]) || "Coastal Zone";
            result.hasData = true;
            console.log("[ZIMAS] Coastal query HIT (layer 112):", result.coastalZoneType);
          } else if (!result.coastalZone) {
            result.coastalZone = "No";
          }
        }
      } catch (e) { console.log("[ZIMAS] Coastal query error:", e.message); }
    }

    // ── 3c. TOC query fallback (layer 101) ───────────────────────────────
    if (!result.toc) {
      try {
        const qp = new URLSearchParams({
          geometry: geoJSON,
          geometryType: "esriGeometryPoint",
          inSR: "4326",
          spatialRel: "esriSpatialRelIntersects",
          outFields: "*",
          returnGeometry: "false",
          f: "json",
        });
        const r = await safeFetch(BASE + "/D_LEGENDLAYERS/MapServer/101/query?" + qp, 8000);
        if (r.ok) {
          const d = await r.json();
          const f = d?.features?.[0]?.attributes;
          if (f) {
            const tier = findField(f, ["TIER", "TOC_TIER", "TOC", "LABEL"]);
            if (tier) {
              result.toc = "Tier " + tier.toString().replace(/\D/g, "");
              result.hasData = true;
              console.log("[ZIMAS] TOC query HIT (layer 101):", result.toc);
            }
          }
        }
      } catch (e) { console.log("[ZIMAS] TOC query error:", e.message); }
    }
  } else {
    console.log("[ZIMAS] No geocode coordinates — skipping ALL spatial queries");
  }

  // ── ADDRESS QUERIES — supplementary, fills gaps ────────────────────────
  const baseAddr = result.situsAddr || geocode?.address || address;
  const streetOnly = baseAddr
    .replace(/,?\s*(Los Angeles|Venice|Westchester|Playa Del Rey|Marina del Rey|Pacific Palisades|Santa Monica|Beverly Hills|Malibu)\b.*$/i, "")
    .replace(/,?\s*CA\b.*$/i, "")
    .replace(/,?\s*\d{5}.*$/, "")
    .trim()
    .toUpperCase();

  // Run address queries if spatial queries missed key fields
  if (!result.spatialParcelHit || !result.lotSizeSf || !result.apn) {
    const addressVariants = buildAddressVariants(streetOnly);
    console.log("[ZIMAS] Address variants to try:", addressVariants);
    for (const variant of addressVariants) {
      try {
        const q = new URLSearchParams({
          where: "SITUS_ADDR LIKE '" + variant.replace(/'/g, "''") + "%'",
          outFields: "*",
          returnGeometry: "false",
          f: "json",
        });
        const url = BASE + "/D_QUERYLAYERS/MapServer/0/query?" + q;
        console.log("[ZIMAS] Address query:", variant);
        const r = await safeFetch(url, 8000);
        if (r.ok) {
          const d = await r.json();
          if (d?.error) {
            console.log("[ZIMAS] Address query ESRI error:", d.error.message);
            continue;
          }
          console.log("[ZIMAS] Address query '" + variant + "': " + (d?.features?.length || 0) + " features");
          const f = d?.features?.[0]?.attributes;
          if (f) {
            extractParcelFields(f, result);
            result.rawFields = Object.keys(f);
            console.log("[ZIMAS] Address query HIT:", result.apn, "lot:", result.lotSizeSf, "fields:", Object.keys(f).slice(0, 10).join(","));
            break;
          }
        }
      } catch (e) { console.log("[ZIMAS] Address query error:", e.message); }
    }
  }

  // ── RSO — layer 12, address-based ──────────────────────────────────────
  const rsoVariants = buildAddressVariants(streetOnly);
  for (const variant of rsoVariants) {
    try {
      const q = new URLSearchParams({
        where: "Property_Address LIKE '" + variant.replace(/'/g, "''") + "%'",
        outFields: "*",
        returnGeometry: "false",
        f: "json",
      });
      const r = await safeFetch(BASE + "/D_QUERYLAYERS/MapServer/12/query?" + q, 8000);
      if (r.ok) {
        const d = await r.json();
        if (d?.error) continue;
        if (d?.features?.length > 0) {
          const f = d.features[0].attributes;
          const rsoUnitsField = findField(f, ["RSO_Units", "RSO_UNITS", "UNITS"]);
          result.rsoUnits = parseInt(rsoUnitsField) || 0;
          result.rso = result.rsoUnits > 0;
          result.rsoSource = "ZIMAS RSO Registry (verified)";
          result.hasData = true;
          console.log("[ZIMAS] RSO HIT ('" + variant + "'):", result.rso, result.rsoUnits, "units");
          break;
        } else {
          // Address not found in RSO registry — verified non-RSO
          result.rso = false;
          result.rsoSource = "ZIMAS RSO Registry — not listed (verified)";
          result.hasData = true;
          console.log("[ZIMAS] RSO: not in registry ('" + variant + "')");
          break;
        }
      }
    } catch (e) { console.log("[ZIMAS] RSO query error:", e.message); }
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

  console.log("[ZIMAS] === FINAL RESULT ===",
    "hasData=" + result.hasData,
    "zoning=" + result.zoning,
    "lot=" + result.lotSizeSf,
    "APN=" + result.apn,
    "coastal=" + result.coastalZone,
    "TOC=" + result.toc,
    "liq=" + result.liquefaction,
    "RSO=" + result.rso
  );

  return result;
}


// ══════════════════════════════════════════════════════════════════════════
// HELPER: Find field value from attributes (case-insensitive, multi-name)
// ══════════════════════════════════════════════════════════════════════════

function findField(attrs, candidates) {
  if (!attrs) return null;
  // Try exact match first
  for (const name of candidates) {
    if (attrs[name] !== undefined && attrs[name] !== null && attrs[name] !== "") return attrs[name];
  }
  // Try case-insensitive match
  const keys = Object.keys(attrs);
  for (const name of candidates) {
    const lc = name.toLowerCase();
    const match = keys.find(k => k.toLowerCase() === lc);
    if (match && attrs[match] !== undefined && attrs[match] !== null && attrs[match] !== "") return attrs[match];
  }
  return null;
}

function extractParcelFields(a, result) {
  result.hasData = true;

  if (!result.apn) result.apn = findField(a, ["APN", "ASSESSOR_ID", "PARCEL_ID"]);

  if (!result.zoning) {
    const z = findField(a, ["ZONE_CMPLT", "ZONE_CLASS", "ZONING", "ZONE"]);
    if (z) {
      result.zoning = z;
      if (!result.zoningSource) result.zoningSource = "ZIMAS D_QUERYLAYERS (verified)";
    }
  }

  if (!result.lotSizeSf) {
    const lot = findField(a, ["LOT_SIZE", "LOT_AREA", "PARCEL_AREA", "LAND_AREA"]);
    if (lot) result.lotSizeSf = Math.round(parseFloat(lot));
  }

  if (!result.yearBuilt) result.yearBuilt = findField(a, ["YEAR_BUILT", "YR_BUILT", "YEARBUILT"]);
  if (!result.existingUnits) result.existingUnits = findField(a, ["NO_OF_UNITS", "UNITS", "NUM_UNITS", "UNIT_COUNT"]);
  if (!result.existingBuildingSqft) result.existingBuildingSqft = findField(a, ["BUILDING_SQ_FT", "BLDG_SQ_FT", "BLDG_SQFT", "BUILDING_SQFT"]);
  if (!result.useCode) result.useCode = findField(a, ["USE_CODE", "USECODE", "LAND_USE"]);
  if (!result.communityPlan) result.communityPlan = findField(a, ["COMM_PLAN", "COMMUNITY_PLAN_AREA", "COMMUNITY_PLAN"]);
  if (!result.specificPlan) result.specificPlan = findField(a, ["SPECIFIC_PLAN", "SP_NAME"]);
  if (!result.generalPlanLandUse) result.generalPlanLandUse = findField(a, ["GENERAL_PLAN", "GP_LAND_USE", "GENERAL_PLAN_LU"]);

  if (result.hillside === undefined || result.hillside === null) {
    const h = findField(a, ["HILLSIDE", "HCR", "HILLSIDE_AREA"]);
    if (h !== null) result.hillside = (h === "Y" || h === "YES" || h === "Yes" || h === true);
  }

  if (!result.hpoz) result.hpoz = findField(a, ["HPOZ", "HPOZ_NAME"]);

  if (!result.coastalZone) {
    const cz = findField(a, ["COASTAL_ZONE", "CST_ZONE", "COASTAL"]);
    if (cz) result.coastalZone = cz;
  }

  if (result.liquefaction === undefined || result.liquefaction === null) {
    const liq = findField(a, ["LIQUEFACTION", "LIQFACTION"]);
    if (liq !== null) result.liquefaction = (liq === "Y" || liq === "YES" || liq === "Yes" || liq === true);
  }

  if (result.specialGrading === undefined || result.specialGrading === null) {
    const sg = findField(a, ["SPEC_GRADING_AREA", "SPECIAL_GRADING", "GRADING_AREA"]);
    if (sg !== null) result.specialGrading = (sg === "Y" || sg === "YES" || sg === "Yes" || sg === true);
  }

  if (!result.toc) {
    const toc = findField(a, ["TOC_TIER", "TOC", "TIER"]);
    if (toc) result.toc = String(toc).match(/tier/i) ? toc : "Tier " + toc;
  }

  // Capture SITUS address for display
  const situs = findField(a, ["SITUS_ADDR", "PROPERTY_ADDRESS", "ADDRESS"]);
  if (situs && !result.situsAddr) result.situsAddr = situs;
}


// ══════════════════════════════════════════════════════════════════════════
// Address variant builder (directional prefix retries)
// ══════════════════════════════════════════════════════════════════════════

function buildAddressVariants(streetOnly) {
  const variants = [streetOnly];
  const dirMatch = streetOnly.match(/^(\d+)\s+([NSEW])\s+(.+)$/);
  if (dirMatch) {
    variants.push(dirMatch[1] + " " + dirMatch[3]);
  } else {
    const numMatch = streetOnly.match(/^(\d+)\s+(.+)$/);
    if (numMatch) {
      const [, num, rest] = numMatch;
      for (const dir of ["W", "N", "E", "S"]) {
        variants.push(num + " " + dir + " " + rest);
      }
    }
  }
  return variants;
}


// ══════════════════════════════════════════════════════════════════════════
// Claude prompt builders
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
    "Example: Do NOT say 'Liquefaction may be an issue.' DO say: 'Liquefaction Zone: NOT VERIFIED — check at zimas.lacity.org.'",
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
