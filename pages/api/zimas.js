// /api/zimas.js — ZIMAS internal API proxy
// Fetches parcel data from zimas.lacity.org server-side (avoids CORS)
// Two-step: address search → full parcel profile
// Returns structured JSON with all parcel fields

const ALLOWED_ORIGINS = ["https://listo.zone", "https://www.listo.zone", "http://localhost:3000"];

// Simple in-memory rate limit (10 req/IP/min)
const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  const window = 60000;
  const max = 10;
  const hits = rateMap.get(ip) || [];
  const recent = hits.filter(t => now - t < window);
  if (recent.length >= max) return false;
  recent.push(now);
  rateMap.set(ip, recent);
  return true;
}

// Parse HTML table cells from ZIMAS response
function extractField(html, label) {
  if (!html) return null;
  // Match: label text → next DataCellsRight cell content
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped + "[^<]*<\\/(?:a|td)>\\s*<\\/td>\\s*<td[^>]*class=\"DataCellsRight\"[^>]*>([^<]*(?:<[^>]+>[^<]*)*)", "i");
  const m = html.match(re);
  if (!m) return null;
  // Strip HTML tags and clean up
  return m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() || null;
}

// Extract all ZI codes from divTab3 (Planning & Zoning)
function extractZICodes(html) {
  if (!html) return [];
  const codes = [];
  const re = /ZimasData\.openDataLink\('ZONEINFO',\s*'([^']+)'\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    codes.push(m[1]);
  }
  return codes;
}

// Extract building data from divTab4 (Assessor)
function extractBuildings(html) {
  if (!html) return [];
  const buildings = [];
  // Find Building 1 through Building 5
  for (let i = 1; i <= 5; i++) {
    const buildingSection = html.match(new RegExp(`Building ${i}[^<]*<\\/td>([\\s\\S]*?)(?=Building ${i+1}|<\\/tbody>)`, "i"));
    if (!buildingSection) continue;
    const section = buildingSection[1];
    if (section.includes("No data for building")) continue;
    const yearMatch = section.match(/Year Built[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>(\d{4})/i);
    const unitsMatch = section.match(/Number of Units[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>(\d+)/i);
    const bedsMatch = section.match(/Number of Bedrooms[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>(\d+)/i);
    const bathsMatch = section.match(/Number of Bathrooms[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>(\d+)/i);
    const sqftMatch = section.match(/Building Square Footage[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([\d.,]+)/i);
    buildings.push({
      yearBuilt: yearMatch ? parseInt(yearMatch[1]) : null,
      units: unitsMatch ? parseInt(unitsMatch[1]) : null,
      bedrooms: bedsMatch ? parseInt(bedsMatch[1]) : null,
      bathrooms: bathsMatch ? parseInt(bathsMatch[1]) : null,
      sqft: sqftMatch ? parseFloat(sqftMatch[1].replace(",", "")) : null,
    });
  }
  return buildings;
}

// Extract a simple Yes/No/value from a tab's HTML
function extractYesNo(html, label) {
  if (!html) return null;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Try to find the label, then get the value in the next DataCellsRight cell
  const re = new RegExp(escaped + "[\\s\\S]*?DataCellsRight[^>]*>([\\s\\S]*?)<\\/td>", "i");
  const m = html.match(re);
  if (!m) return null;
  const val = m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!val) return null;
  if (/^yes/i.test(val)) return "Yes";
  if (/^no/i.test(val)) return "No";
  if (/^none/i.test(val)) return "None";
  return val;
}

// Extract TOC tier
function extractTOC(html) {
  if (!html) return null;
  const m = html.match(/JJJ_TOC',\s*'([^']+)'/);
  return m ? m[1] : null;
}

// Extract RSO from divTab4 or divTab10
function extractRSO(html) {
  if (!html) return null;
  const m = html.match(/Rent Stabilization Ordinance \(RSO\)[^<]*<\/[^>]*>\s*<\/td>\s*<td[^>]*>[^<]*<a[^>]*>([^<]+)/i);
  if (!m) return null;
  const val = m[1].trim();
  if (/^No/i.test(val)) return "No";
  if (/^Yes/i.test(val)) return "Yes";
  return val;
}

// Extract JCO
function extractJCO(html) {
  if (!html) return null;
  const m = html.match(/Just Cause.*?Eviction.*?<\/td>\s*<td[^>]*>[^<]*<a[^>]*>([^<]+)/i);
  if (!m) return null;
  return /^Yes/i.test(m[1].trim()) ? "Yes" : "No";
}

// Extract HE Replacement
function extractHEReplacement(html) {
  if (!html) return null;
  const m = html.match(/HE Replacement Required[^<]*<\/[^>]*>\s*<\/td>\s*<td[^>]*>[^<]*(?:<a[^>]*>)?([^<]+)/i);
  if (!m) return null;
  return /^Yes/i.test(m[1].trim()) ? "Yes" : "No";
}

// Extract coastal zone info from divTab7
function extractCoastalZone(html) {
  if (!html) return null;
  const m = html.match(/Coastal Zone[^<]*<\/[^>]*>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
  if (!m) return null;
  const val = m[1].replace(/&nbsp;/g, " ").trim();
  if (!val || /^none$/i.test(val)) return null;
  return val;
}

// Extract specific plans from divTab3
function extractSpecificPlans(html) {
  if (!html) return [];
  const plans = [];
  const re = /ZimasData\.openDataLink\('SPA',\s*'([^']+)'\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    plans.push(m[1]);
  }
  return plans;
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Rate limit
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "unknown";
  if (!checkRate(ip)) return res.status(429).json({ error: "Rate limited" });

  const { houseNumber, streetName } = req.query;
  if (!houseNumber || !streetName) {
    return res.status(400).json({ error: "Missing houseNumber or streetName" });
  }

  // Sanitize inputs
  const cleanHouse = String(houseNumber).replace(/[^0-9]/g, "").slice(0, 10);
  const cleanStreet = String(streetName).replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 60);
  if (!cleanHouse || !cleanStreet) {
    return res.status(400).json({ error: "Invalid input" });
  }

  try {
    // Step 1: Address search → get PIN
    const searchUrl = `https://zimas.lacity.org/ajaxSearchResults.aspx?search=address&HouseNumber=${cleanHouse}&StreetName=${encodeURIComponent(cleanStreet)}`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": "Listo/1.0 (listo.zone; permit analysis tool)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) return res.status(502).json({ error: "ZIMAS search failed", status: searchRes.status });
    const searchText = await searchRes.text();

    // Parse the response — it's a JS-like object with an action string
    // e.g. {action: "ZimasData.navigateDataToPin('108B149  1481', '622 W WOODLAWN AVE');"}
    const pinMatch = searchText.match(/navigateDataToPin\('([^']+)',\s*'([^']+)'\)/);
    if (!pinMatch) {
      return res.status(404).json({ error: "Address not found in ZIMAS", raw: searchText.slice(0, 200) });
    }
    const pin = pinMatch[1];
    const zimasAddress = pinMatch[2];

    // Step 2: Full parcel data
    const dataUrl = `https://zimas.lacity.org/map.aspx?pin=${encodeURIComponent(pin)}&ajax=yes&address=${encodeURIComponent(zimasAddress)}`;
    const dataRes = await fetch(dataUrl, {
      headers: { "User-Agent": "Listo/1.0 (listo.zone; permit analysis tool)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!dataRes.ok) return res.status(502).json({ error: "ZIMAS data fetch failed", status: dataRes.status });
    const dataText = await dataRes.text();

    // The response is a pseudo-JSON object with HTML table strings
    // Parse key fields from each divTab

    // Parcel identification (divTab1)
    const lotAreaMatch = dataText.match(/Lot\/Parcel Area \(Calculated\)[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([\d,. ]+)\(sq ft\)/i);
    const apnMatch = dataText.match(/ZimasData\.openDataLink\('BPP',\s*'(\d+)'\)/);
    const tractMatch = dataText.match(/Tract[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*class="DataCellsRight"[^>]*>([^<]+)/i);

    // Planning & Zoning (divTab3)
    const zoningMatch = dataText.match(/ZimasData\.openDataLink\('ZONING',\s*'([^']+)'\)/);
    const generalPlanMatch = dataText.match(/ZimasData\.openDataLink\('GENPLAN',\s*'([^']+)'\)/);
    const ziCodes = extractZICodes(dataText);
    const toc = extractTOC(dataText);
    const specificPlans = extractSpecificPlans(dataText);
    const hillsideMatch = dataText.match(/Hillside Area \(Zoning Code\)[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const ab2334Match = dataText.match(/AB 2334.*?<\/td>\s*<td[^>]*>([^<]+)/i);
    const ab2097Match = dataText.match(/AB 2097.*?openDataLink\('AB2097',\s*'([^']+)'\)/);

    // Assessor (divTab4)
    const buildings = extractBuildings(dataText);
    const rso = extractRSO(dataText);
    const useCodeMatch = dataText.match(/Use Code[^<]*<\/td>\s*<td[^>]*class="DataCellsRight"[^>]*>([^<]+)/i);

    // Housing (divTab10)
    const jco = extractJCO(dataText);
    const heReplacement = extractHEReplacement(dataText);

    // Hazards (divTab7)
    const coastalZones = [];
    const coastalRe = /Coastal Zone[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*class="DataCellsRight"[^>]*>([^<]+)/gi;
    let cm;
    while ((cm = coastalRe.exec(dataText)) !== null) {
      const v = cm[1].replace(/&nbsp;/g, " ").trim();
      if (v && !/^none$/i.test(v)) coastalZones.push(v);
    }
    const fireMatch = dataText.match(/Very High Fire Hazard Severity Zone[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const floodMatch = dataText.match(/Flood Zone[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const liquefactionMatch = dataText.match(/LIQUEFACTION',\s*'([^']+)'\)/i) || dataText.match(/Liquefaction[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>[^<]*(?:<a[^>]*>)?([^<]+)/i);
    const landslideMatch = dataText.match(/Landslide[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const tsunamiMatch = dataText.match(/Tsunami Hazard Area[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const seaLevelMatch = dataText.match(/Sea Level Rise Area[^<]*<\/td>\s*<td[^>]*>([^<]+)/i);
    const methaneMatch = dataText.match(/Methane Hazard Site[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const specialGradingMatch = dataText.match(/Special Grading Area[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const airportMatch = dataText.match(/Airport Hazard[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);

    // Fault info (divTab8)
    const faultNameMatch = dataText.match(/Nearest Fault \(Name\)[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const faultDistMatch = dataText.match(/Nearest Fault \(Distance in km\)[^<]*<\/td>\s*<td[^>]*>([\d.]+)/i);
    const alquistMatch = dataText.match(/Alquist-Priolo Fault Zone[^<]*<\/[^>]+>\s*<\/td>\s*<td[^>]*>([^<]+)/i);

    // Build clean response
    const result = {
      source: "ZIMAS",
      address: zimasAddress,
      pin: pin,
      apn: apnMatch ? apnMatch[1] : null,
      lotAreaSf: lotAreaMatch ? parseFloat(lotAreaMatch[1].replace(/,/g, "").trim()) : null,
      tract: tractMatch ? tractMatch[1].replace(/&nbsp;/g, " ").trim() : null,
      zoning: zoningMatch ? zoningMatch[1] : null,
      generalPlan: generalPlanMatch ? generalPlanMatch[1] : null,
      specificPlans,
      ziCodes,
      toc,
      hillside: hillsideMatch ? (/^No/i.test(hillsideMatch[1].trim()) ? false : true) : null,
      ab2334: ab2334Match ? /^Yes/i.test(ab2334Match[1].trim()) : null,
      ab2097: ab2097Match ? /^Yes/i.test(ab2097Match[1]) : null,
      buildings,
      yearBuilt: buildings[0]?.yearBuilt || null,
      existingUnits: buildings[0]?.units || null,
      existingBedrooms: buildings[0]?.bedrooms || null,
      existingBathrooms: buildings[0]?.bathrooms || null,
      existingSqft: buildings[0]?.sqft || null,
      useCode: useCodeMatch ? useCodeMatch[1].replace(/&nbsp;/g, " ").trim() : null,
      rso: rso === "Yes" ? true : rso === "No" ? false : null,
      jco: jco === "Yes" ? true : jco === "No" ? false : null,
      heReplacement: heReplacement === "Yes" ? true : heReplacement === "No" ? false : null,
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

    return res.status(200).json(result);
  } catch (e) {
    console.error("[ZIMAS proxy error]", e.message);
    if (e.name === "TimeoutError" || e.message?.includes("timeout")) {
      return res.status(504).json({ error: "ZIMAS request timed out" });
    }
    return res.status(500).json({ error: "Internal error", message: e.message });
  }
}
