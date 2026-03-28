// /api/zimas.js — ZIMAS internal API proxy (Edge Runtime)
// Edge Runtime gets 25s timeout on Vercel Hobby (vs 10s for serverless)
// Two-step: address search → full parcel profile → parsed JSON

export const config = { runtime: "edge" };

const ALLOWED_ORIGINS = ["https://listo.zone", "https://www.listo.zone", "http://localhost:3000"];

function corsHeaders(origin) {
  const h = { "Content-Type": "application/json", "Access-Control-Allow-Methods": "GET,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (ALLOWED_ORIGINS.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function extractZICodes(html) {
  const codes = [];
  const re = /ZimasData\.openDataLink\('ZONEINFO',\s*'([^']+)'\)/g;
  let m; while ((m = re.exec(html)) !== null) codes.push(m[1]);
  return codes;
}

function extractBuildings(html) {
  const buildings = [];
  for (let i = 1; i <= 5; i++) {
    const section = html.match(new RegExp(`Building ${i}[^<]*<\\/td>([\\s\\S]*?)(?=Building ${i+1}|<\\/tbody>)`, "i"));
    if (!section || section[1].includes("No data for building")) continue;
    const s = section[1];
    const yr = s.match(/Year Built[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>(\d{4})/i);
    const un = s.match(/Number of Units[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>(\d+)/i);
    const bd = s.match(/Number of Bedrooms[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>(\d+)/i);
    const ba = s.match(/Number of Bathrooms[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>(\d+)/i);
    const sf = s.match(/Building Square Footage[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([\d.,]+)/i);
    buildings.push({
      yearBuilt: yr ? parseInt(yr[1]) : null,
      units: un ? parseInt(un[1]) : null,
      bedrooms: bd ? parseInt(bd[1]) : null,
      bathrooms: ba ? parseInt(ba[1]) : null,
      sqft: sf ? parseFloat(sf[1].replace(",", "")) : null,
    });
  }
  return buildings;
}

function extractTOC(html) {
  const m = html.match(/JJJ_TOC',\s*'([^']+)'/);
  return m ? m[1] : null;
}

function extractSpecificPlans(html) {
  const plans = [];
  const re = /ZimasData\.openDataLink\('SPA',\s*'([^']+)'\)/g;
  let m; while ((m = re.exec(html)) !== null) plans.push(m[1]);
  return plans;
}

export default async function handler(req) {
  const origin = req.headers.get("origin") || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers });
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });

  const url = new URL(req.url);
  const houseNumber = url.searchParams.get("houseNumber");
  const streetName = url.searchParams.get("streetName");

  if (!houseNumber || !streetName) {
    return new Response(JSON.stringify({ error: "Missing houseNumber or streetName" }), { status: 400, headers });
  }

  const cleanHouse = String(houseNumber).replace(/[^0-9]/g, "").slice(0, 10);
  const cleanStreet = String(streetName).replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 60);
  if (!cleanHouse || !cleanStreet) {
    return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400, headers });
  }

  try {
    // Step 1: Address search → get PIN
    const searchUrl = `https://zimas.lacity.org/ajaxSearchResults.aspx?search=address&HouseNumber=${cleanHouse}&StreetName=${encodeURIComponent(cleanStreet)}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
    if (!searchRes.ok) {
      return new Response(JSON.stringify({ error: "ZIMAS search failed", status: searchRes.status }), { status: 502, headers });
    }
    const searchText = await searchRes.text();

    const pinMatch = searchText.match(/navigateDataToPin\('([^']+)',\s*'([^']+)'\)/);
    if (!pinMatch) {
      return new Response(JSON.stringify({ error: "Address not found in ZIMAS", raw: searchText.slice(0, 200) }), { status: 404, headers });
    }
    const pin = pinMatch[1];
    const zimasAddress = pinMatch[2];

    // Step 2: Full parcel data
    const dataUrl = `https://zimas.lacity.org/map.aspx?pin=${encodeURIComponent(pin)}&ajax=yes&address=${encodeURIComponent(zimasAddress)}`;
    const dataRes = await fetch(dataUrl, { signal: AbortSignal.timeout(15000) });
    if (!dataRes.ok) {
      return new Response(JSON.stringify({ error: "ZIMAS data fetch failed", status: dataRes.status }), { status: 502, headers });
    }
    const d = await dataRes.text();

    // Parse all fields
    const lotAreaMatch = d.match(/Lot\/Parcel Area \(Calculated\)[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([\d,. ]+)\(sq ft\)/i);
    const apnMatch = d.match(/ZimasData\.openDataLink\('BPP',\s*'(\d+)'\)/);
    const zoningMatch = d.match(/ZimasData\.openDataLink\('ZONING',\s*'([^']+)'\)/);
    const generalPlanMatch = d.match(/ZimasData\.openDataLink\('GENPLAN',\s*'([^']+)'\)/);
    const hillsideMatch = d.match(/Hillside Area \(Zoning Code\)[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const ab2334Match = d.match(/AB 2334.*?<\/td>\s*<td[^>]*>([^<]+)/i);
    const ab2097Match = d.match(/AB 2097.*?openDataLink\('AB2097',\s*'([^']+)'\)/);
    const useCodeMatch = d.match(/Use Code[^<]*<\/td>\s*<td[^>]*class="DataCellsRight"[^>]*>([^<]+)/i);
    const fireMatch = d.match(/Very High Fire Hazard Severity Zone[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const floodMatch = d.match(/Flood Zone[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const liquefactionMatch = d.match(/LIQUEFACTION',\s*'([^']+)'\)/i) || d.match(/Liquefaction[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>[^<]*(?:<a[^>]*>)?([^<]+)/i);
    const landslideMatch = d.match(/Landslide[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const tsunamiMatch = d.match(/Tsunami Hazard Area[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const seaLevelMatch = d.match(/Sea Level Rise Area[^<]*<\/td>\s*<td[^>]*>([^<]+)/i);
    const methaneMatch = d.match(/Methane Hazard Site[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const specialGradingMatch = d.match(/Special Grading Area[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const airportMatch = d.match(/Airport Hazard[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const faultNameMatch = d.match(/Nearest Fault \(Name\)[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const faultDistMatch = d.match(/Nearest Fault \(Distance in km\)[^<]*<\/td>\s*<td[^>]*>([\d.]+)/i);
    const alquistMatch = d.match(/Alquist-Priolo Fault Zone[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);

    // RSO
    const rsoMatch = d.match(/Rent Stabilization Ordinance \(RSO\)[^<]*<\/[^>]*>\s*<\/td>\s*<td[^>]*>[^<]*<a[^>]*>([^<]+)/i);
    const rso = rsoMatch ? (/^No/i.test(rsoMatch[1].trim()) ? false : /^Yes/i.test(rsoMatch[1].trim()) ? true : null) : null;

    // JCO
    const jcoMatch = d.match(/Just Cause.*?Eviction.*?<\/td>\s*<td[^>]*>[^<]*<a[^>]*>([^<]+)/i);
    const jco = jcoMatch ? /^Yes/i.test(jcoMatch[1].trim()) : null;

    // HE Replacement
    const heMatch = d.match(/HE Replacement Required[^<]*<\/[^>]*>\s*<\/td>\s*<td[^>]*>[^<]*(?:<a[^>]*>)?([^<]+)/i);
    const heReplacement = heMatch ? /^Yes/i.test(heMatch[1].trim()) : null;

    // Coastal zones
    const coastalZones = [];
    const coastalRe = /Coastal Zone[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*class="DataCellsRight"[^>]*>([^<]+)/gi;
    let cm; while ((cm = coastalRe.exec(d)) !== null) {
      const v = cm[1].replace(/&nbsp;/g, " ").trim();
      if (v && !/^none$/i.test(v)) coastalZones.push(v);
    }

    const buildings = extractBuildings(d);
    const ziCodes = extractZICodes(d);
    const toc = extractTOC(d);
    const specificPlans = extractSpecificPlans(d);

    const result = {
      source: "ZIMAS",
      address: zimasAddress,
      pin,
      apn: apnMatch ? apnMatch[1] : null,
      lotAreaSf: lotAreaMatch ? parseFloat(lotAreaMatch[1].replace(/,/g, "").trim()) : null,
      zoning: zoningMatch ? zoningMatch[1] : null,
      generalPlan: generalPlanMatch ? generalPlanMatch[1] : null,
      specificPlans,
      ziCodes,
      toc,
      hillside: hillsideMatch ? !/^No/i.test(hillsideMatch[1].trim()) : null,
      ab2334: ab2334Match ? /^Yes/i.test(ab2334Match[1].trim()) : null,
      ab2097: ab2097Match ? /^Yes/i.test(ab2097Match[1]) : null,
      buildings,
      yearBuilt: buildings[0]?.yearBuilt || null,
      existingUnits: buildings[0]?.units || null,
      existingBedrooms: buildings[0]?.bedrooms || null,
      existingBathrooms: buildings[0]?.bathrooms || null,
      existingSqft: buildings[0]?.sqft || null,
      useCode: useCodeMatch ? useCodeMatch[1].replace(/&nbsp;/g, " ").trim() : null,
      rso,
      jco,
      heReplacement,
      coastalZones,
      fireHazard: fireMatch ? !/^No/i.test(fireMatch[1].trim()) : null,
      floodZone: floodMatch ? floodMatch[1].replace(/&nbsp;/g, " ").trim() : null,
      liquefaction: liquefactionMatch ? /^Yes/i.test(liquefactionMatch[1].trim()) : null,
      landslide: landslideMatch ? !/^No/i.test(landslideMatch[1].trim()) : null,
      tsunami: tsunamiMatch ? !/^No/i.test(tsunamiMatch[1].trim()) : null,
      seaLevelRise: seaLevelMatch ? /^Yes/i.test(seaLevelMatch[1].trim()) : null,
      methane: methaneMatch ? (!/^None/i.test(methaneMatch[1].trim()) ? methaneMatch[1].trim() : null) : null,
      specialGrading: specialGradingMatch ? !/^No/i.test(specialGradingMatch[1].trim()) : null,
      airportHazard: airportMatch ? (!/^None/i.test(airportMatch[1].trim()) ? airportMatch[1].trim() : null) : null,
      faultName: faultNameMatch ? faultNameMatch[1].trim() : null,
      faultDistKm: faultDistMatch ? parseFloat(faultDistMatch[1]) : null,
      alquistPriolo: alquistMatch ? !/^No/i.test(alquistMatch[1].trim()) : null,
    };

    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (e) {
    const status = (e.name === "TimeoutError" || e.message?.includes("timeout")) ? 504 : 500;
    return new Response(JSON.stringify({ error: status === 504 ? "ZIMAS timeout" : "Internal error", message: e.message }), { status, headers });
  }
}
