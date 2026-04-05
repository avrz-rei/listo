import { useState, useEffect } from "react";

// ── PostHog ───────────────────────────────────────────────────────────────
const POSTHOG_KEY = "phc_Gbq7s2JDLrsyaRC2X3jP9PmMEBclWGloKzzL29XZRhv";
const DEBUG = typeof window !== "undefined" && window.location.search.includes("debug=1");
function track(event, props = {}) {
  if (typeof window === "undefined" || !window.posthog) return;
  try { window.posthog.capture(event, props); } catch (_) {}
}

// ── Design tokens — from brand preview PDF ────────────────────────────────
const T = {
  orange:   "#E8620A",
  orangeL:  "#FF7A24",
  black:    "#1A1714",
  cream:    "#FAF7F2",
  warmGray: "#F0EBE3",
  gold:     "#F5C563",
  goldTint: "#FAECC8",
  text:     "#44403C",
  textHead: "#1A1714",
  secondary:"#78716C",
  muted:    "#A8A29E",
  border:   "#E2D9D0",
  green:    "#15803D",
  yellow:   "#B45309",
  red:      "#B91C1C",
  white:    "#FFFFFF",
};

// ── Jurisdiction map — City of LA, Santa Monica, Beverly Hills ────────────
const JURISDICTIONS = {
  "city-of-la": {
    name: "City of Los Angeles", short: "City of LA",
    agency: "LADBS", agencyUrl: "https://ladbs.org",
    applyUrl: "https://www.ladbs.org/permits-inspections/apply-for-a-permit",
    covered: true, color: T.orange,
    zips: [
      "90001","90002","90003","90004","90005","90006","90007","90008","90010","90011",
      "90012","90013","90014","90015","90016","90017","90018","90019","90020","90021",
      "90022","90023","90024","90025","90026","90027","90028","90029","90031","90032",
      "90033","90034","90035","90036","90037","90038","90039","90041","90042","90043",
      "90044","90045","90046","90047","90048","90049","90056","90057","90058","90059",
      "90061","90062","90063","90064","90065","90066","90067","90068","90069","90071",
      "90073","90077","90089","90094","90095","90230","90247","90272","90291","90292",
      "90293","90402","91040","91042","91303","91304","91306","91307","91311","91316",
      "91324","91325","91326","91330","91331","91335","91340","91342","91343","91344",
      "91345","91352","91356","91364","91367","91371","91401","91402","91403","91404",
      "91405","91406","91411","91423","91436","91601","91602","91604","91605","91606",
      "91607","91608",
    ],
  },
  "santa-monica": {
    name: "Santa Monica", short: "Santa Monica",
    agency: "Santa Monica Building & Safety", agencyUrl: "https://www.santamonica.gov/services/building-and-safety/permits",
    applyUrl: "https://www.santamonica.gov/services/building-and-safety/permits",
    covered: true, color: "#2563eb",
    note: "Santa Monica has its own Rent Control Board (stricter than LA RSO) and is fully within the CA Coastal Zone.",
    zips: ["90401","90402","90403","90404","90405"],
  },
  "beverly-hills": {
    name: "Beverly Hills", short: "Beverly Hills",
    agency: "Beverly Hills Building & Safety", agencyUrl: "https://www.beverlyhills.org/departments/communitydevelopment/buildingdivision/",
    applyUrl: "https://www.beverlyhills.org/departments/communitydevelopment/buildingdivision/permitapplication/",
    covered: true, color: "#E8620A",
    note: "Beverly Hills has its own building department and zoning code, separate from City of LA.",
    zips: ["90210","90211","90212"],
  },
  "malibu": {
    name: "City of Malibu", short: "Malibu",
    agency: "Malibu Building & Safety", agencyUrl: "https://www.malibucity.org/208/Building-Safety",
    applyUrl: "https://www.malibucity.org/208/Building-Safety",
    covered: true, color: "#0891b2",
    note: "Malibu is entirely within the California Coastal Zone. A Coastal Development Permit (CDP) is required for virtually all development, in addition to City of Malibu building permits.",
    zips: ["90265","90266"],
  },
};

const NOT_COVERED = {
  covered: false,
  nearbyJurisdictions: {
    "90069": "West Hollywood", "90046": "West Hollywood (partially)",
    "90230": "Culver City", "90232": "Culver City",
    "90277": "Redondo Beach", "90278": "Redondo Beach", "90254": "Hermosa Beach",
    "90266": "Manhattan Beach",
    "91011": "La Cañada Flintridge", "91030": "South Pasadena",
    "91101": "Pasadena", "91103": "Pasadena", "91104": "Pasadena",
    "91105": "Pasadena", "91106": "Pasadena", "91107": "Pasadena",
    "90731": "San Pedro/Long Beach", "90732": "San Pedro/Long Beach",
  },
};

function detectJurisdiction(zip) {
  if (!zip) return null;
  for (const [key, j] of Object.entries(JURISDICTIONS)) {
    if (j.zips.includes(zip)) return { key, ...j };
  }
  const nearby = NOT_COVERED.nearbyJurisdictions[zip];
  return { key: "not-covered", covered: false, nearbyCity: nearby || null, zip };
}

// ── Project types ─────────────────────────────────────────────────────────
const QUICK_TYPES = [
  { value: "adu", label: "ADU" },
  { value: "new_construction", label: "New Construction" },
  { value: "addition", label: "Addition" },
  { value: "whole_house_remodel", label: "Remodel" },
  { value: "garage_conversion", label: "Garage Conversion" },
];

const ALL_TYPES = [
  { group: "ADU & Additions", items: [
    { value: "adu",              label: "ADU - Accessory Dwelling Unit" },
    { value: "jadu",             label: "JADU - Junior ADU (within existing)" },
    { value: "addition",         label: "Room Addition / Home Expansion" },
    { value: "new_construction", label: "New Home Construction" },
  ]},
  { group: "Remodels", items: [
    { value: "whole_house_remodel", label: "Whole-House Remodel" },
    { value: "kitchen_remodel",     label: "Kitchen Remodel" },
    { value: "bathroom_remodel",    label: "Bathroom Remodel" },
    { value: "interior_remodel",    label: "Interior Remodel (non-structural)" },
    { value: "garage_conversion",   label: "Garage Conversion / ADU" },
  ]},
  { group: "Structural", items: [
    { value: "structural_modification", label: "Structural / Load-Bearing Wall" },
    { value: "seismic_retrofit",        label: "Seismic Retrofit / Soft-Story" },
    { value: "foundation",              label: "Foundation Work" },
    { value: "demolition",              label: "Demolition" },
  ]},
  { group: "Exterior & Site", items: [
    { value: "deck_patio",     label: "Deck / Patio / Pergola" },
    { value: "pool_spa",       label: "Swimming Pool / Spa" },
    { value: "retaining_wall", label: "Retaining Wall (over 4 ft)" },
    { value: "grading",        label: "Grading / Excavation" },
  ]},
  { group: "Systems", items: [
    { value: "roof",        label: "Roof Replacement" },
    { value: "solar",       label: "Solar / Battery Storage" },
    { value: "electrical",  label: "Electrical / Panel Upgrade" },
    { value: "plumbing",    label: "Plumbing Work" },
    { value: "hvac",        label: "HVAC / AC" },
    { value: "window_door", label: "Window / Door Replacement" },
  ]},
  { group: "Commercial", items: [
    { value: "commercial_tenant", label: "Commercial Tenant Improvement" },
    { value: "sign",              label: "Sign Installation" },
  ]},
];

const allFlat = ALL_TYPES.flatMap(g => g.items);
function getLabel(v) { return allFlat.find(p => p.value === v)?.label || v; }

// ── Address parser ────────────────────────────────────────────────────────
function parseAddress(raw) {
  const s = raw.trim();
  // Extract ZIP: must appear after comma, state, or "CA" — not a house number at the start
  // Try explicit patterns first: "CA 90xxx", ", 9xxxx", trailing 5-digit
  let zip = "";
  const zipAfterState = s.match(/\bCA\s+(\d{5})\b/i);
  const zipAfterComma = s.match(/,\s*(\d{5})\b/);
  const zipStandalone = s.match(/\s(\d{5})$/); // trailing 5 digits at end of string
  if (zipAfterState) zip = zipAfterState[1];
  else if (zipAfterComma) zip = zipAfterComma[1];
  else if (zipStandalone) zip = zipStandalone[1];
  // Validate: LA area ZIPs start with 9 (90xxx-93xxx)
  if (zip && !/^9[0-3]/.test(zip)) zip = "";
  const HOODS = ["Pacific Palisades","Playa Del Rey","Playa del Rey","Marina del Rey","Venice",
    "Westchester","Brentwood","Bel Air","Westwood","Mar Vista","Silver Lake","Echo Park",
    "Hancock Park","Los Feliz","Hollywood Hills","Laurel Canyon","North Hollywood","Sherman Oaks",
    "Studio City","Encino","Woodland Hills","Century City","West Hollywood","Santa Monica",
    "Beverly Hills","Culver City"];
  const CITIES = ["Los Angeles","Santa Monica","Beverly Hills","West Hollywood","Culver City",
    "Burbank","Glendale","Pasadena","Long Beach","Malibu","Calabasas","Inglewood"];
  let city = "", neighborhood = "";
  for (const n of HOODS) { if (s.toLowerCase().includes(n.toLowerCase())) { neighborhood = n; break; } }
  for (const c of CITIES) { if (s.toLowerCase().includes(c.toLowerCase())) { city = c; break; } }
  if (!city) city = "Los Angeles";
  return { displayName: [s.split(",")[0].trim(), neighborhood || city, "CA", zip].filter(Boolean).join(", "), city, zip, neighborhood };
}

// ── Logo component ────────────────────────────────────────────────────────
function Logo({ size = 32, light = false }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ width:size, height:size, background:T.orange, borderRadius:size*0.25,
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <svg width={size*0.55} height={size*0.55} viewBox="0 0 20 20" fill="none">
          <path d="M4 10.5L8.5 15L16 6" stroke={T.cream} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <span style={{ fontSize:size*0.75, fontWeight:700, letterSpacing:"-0.03em",
        color: light ? T.cream : T.black, fontFamily:"'Georgia',serif", lineHeight:1 }}>
        listo<span style={{ color:T.orange }}>.</span>
      </span>
    </div>
  );
}

// ── Flag component (from brand preview) ──────────────────────────────────
function Flag({ level, title, meta, children }) {
  const cfg = {
    red:    { bg:"#FEF2F2", border:"#FECACA", color:T.red,    label:"REQUIRED" },
    yellow: { bg:"#FFFBEB", border:"#FDE68A", color:T.yellow, label:"FACTOR" },
    green:  { bg:"#F0FDF4", border:"#BBF7D0", color:T.green,  label:"CLEAR" },
    blue:   { bg:"#F0FDF4", border:"#BBF7D0", color:T.green,  label:"BENEFIT" },
  }[level] || { bg:"#F9FAFB", border:T.border, color:T.secondary, label:"NOTE" };
  const iconPath = level === "green" || level === "blue"
    ? <path d="M4 8.5L7 11.5L12 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    : <><path d="M8 4v5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><path d="M8 11v1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></>;

  return (
    <div style={{ background:cfg.bg, border:`1px solid ${cfg.border}`,
      borderRadius:8, padding:"12px 14px", display:"flex", gap:12, alignItems:"flex-start" }}>
      <div style={{ width:24, height:24, borderRadius:6, background:cfg.color,
        display:"flex", alignItems:"center", justifyContent:"center",
        flexShrink:0, marginTop:1 }}>
        <svg width={12} height={12} viewBox="0 0 16 16" fill="none">{iconPath}</svg>
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:9, color:cfg.color,
          letterSpacing:"0.1em", marginBottom:3 }}>{cfg.label}</div>
        {title && <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:3 }}>{title}</div>}
        <div style={{ fontSize:13, color:T.text, lineHeight:1.6 }}>{children}</div>
        {meta && <div style={{ fontSize:11, color:T.secondary, marginTop:4 }}>{meta}</div>}
      </div>
    </div>
  );
}

// ── Score card component (from brand preview) ─────────────────────────────
function ScoreCard({ label, value, sub, color }) {
  return (
    <div style={{ background:T.white, padding:"20px 24px", borderRight:`1px solid ${T.border}` }}>
      <div style={{ fontSize:9, color:T.secondary, fontFamily:"monospace",
        letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color: color||T.text,
        fontFamily:"'Georgia',serif", marginBottom:4 }}>{value}</div>
      <div style={{ fontSize:11, color:T.secondary }}>{sub}</div>
    </div>
  );
}

// ── Jurisdiction badge ────────────────────────────────────────────────────
function JurisdictionBadge({ jurisdiction }) {
  if (!jurisdiction) return null;
  if (!jurisdiction.covered) return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:6,
      background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:20,
      padding:"3px 10px", fontSize:11 }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background:T.red }} />
      <span style={{ color:T.red, fontWeight:600 }}>
        {jurisdiction.nearbyCity || "Outside coverage area"}
      </span>
    </div>
  );
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:6,
      background: jurisdiction.color + "15",
      border:`1px solid ${jurisdiction.color}40`,
      borderRadius:20, padding:"3px 10px", fontSize:11 }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background:jurisdiction.color }} />
      <span style={{ color:jurisdiction.color, fontWeight:600 }}>{jurisdiction.short}</span>
      <span style={{ color:T.secondary }}>· {jurisdiction.agency}</span>
    </div>
  );
}

// ── Parcel Survey Cards — visual parcel data display ─────────────────────
function ParcelSurveyCards({ parcel, onManualEntry }) {
  if (!parcel) return null;

  const Badge = ({ yes, value, flagged }) => {
    if (value === undefined || value === null) return (
      <span style={{ fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:4,
        background:"#FEF3C7", color:"#92400E", fontFamily:"monospace" }}>NOT VERIFIED</span>
    );
    if (flagged || yes === true) return (
      <span style={{ fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:4,
        background: flagged ? "#FEE2E2" : "#D1FAE5", color: flagged ? "#991B1B" : "#065F46",
        fontFamily:"monospace" }}>{flagged ? "YES — ACTION" : typeof value === "string" ? value : "YES"}</span>
    );
    return (
      <span style={{ fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:4,
        background:"#F3F4F6", color:"#78716C", fontFamily:"monospace" }}>{typeof value === "string" ? value : "NO"}</span>
    );
  };

  const Row = ({ label, value, flagged, bold }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
      padding:"6px 0", borderBottom:"1px solid #F3F4F6", gap:8 }}>
      <span style={{ fontSize:12, color:"#374151", fontWeight: bold ? 600 : 400 }}>{label}</span>
      {typeof value === "string" || typeof value === "number" ? (
        <div style={{ display:"flex", alignItems:"center", gap:6, flex:"0 0 auto" }}>
          <span style={{ fontSize:12, fontWeight:600, color: bold ? T.black : "#374151" }}>{value}</span>
          <span style={{ fontSize:9, fontWeight:600, padding:"2px 6px", borderRadius:3,
            background:T.green+"18", color:T.green, display:"flex", alignItems:"center", gap:3 }}>
            <svg width={9} height={9} viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ZIMAS</span>
        </div>
      ) : value !== undefined && value !== null ? (
        <Badge yes={value} value={value} flagged={flagged} />
      ) : (
        <Badge />
      )}
    </div>
  );

  const Card = ({ title, color, children }) => (
    <div style={{ background:"white", border:"1px solid #E5E7EB", borderRadius:10,
      borderLeft:`4px solid ${color}`, marginBottom:12, overflow:"hidden" }}>
      <div style={{ padding:"10px 16px", background:"#FAFAFA", borderBottom:"1px solid #F3F4F6" }}>
        <span style={{ fontSize:11, fontWeight:700, color, textTransform:"uppercase",
          letterSpacing:"0.08em", fontFamily:"monospace" }}>{title}</span>
      </div>
      <div style={{ padding:"8px 16px" }}>{children}</div>
    </div>
  );

  const HazardGrid = ({ items }) => (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
      {items.map(([label, val, flag]) => (
        <Row key={label} label={label} value={val} flagged={flag} />
      ))}
    </div>
  );

  return (
    <div style={{ marginTop:4 }}>
      {/* Address mismatch warning */}
      {parcel.addressMismatch && (
        <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10,
          padding:"12px 16px", marginBottom:12, display:"flex", gap:10, alignItems:"flex-start" }}>
          <span style={{ fontSize:16 }}>⚠️</span>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:"#991B1B", marginBottom:2 }}>Address Mismatch</div>
            <div style={{ fontSize:11, color:"#7F1D1D", lineHeight:1.5 }}>{parcel.addressMismatchNote}</div>
          </div>
        </div>
      )}

      {/* Key Identification — hero card */}
      <Card title="Parcel Identification" color={T.orange}>
        <Row label="Address" value={parcel.situsAddr || parcel.address || null} bold />
        <Row label="APN" value={parcel.apn || null} bold />
        <Row label="Zoning" value={parcel.zoning || null} bold />
        <Row label="Lot Size" value={parcel.lotSizeSf ? parcel.lotSizeSf.toLocaleString() + " sf" : null} bold />
        {parcel.lotWidthFt && parcel.lotDepthFt && (
          <Row label="Lot Dimensions" value={"~" + parcel.lotWidthFt + " ft × ~" + parcel.lotDepthFt + " ft (est.)"} />
        )}
        <Row label="Year Built" value={parcel.yearBuilt || null} />
        <Row label="Existing Building" value={parcel.existingBuildingSqft ? parcel.existingBuildingSqft + " sf" : null} />
        <Row label="Units" value={parcel.existingUnits || null} />
        <Row label="Use Code" value={parcel.useDescription || parcel.useCode || null} />
      </Card>

      {/* Density — zone-aware calculation */}
      {parcel.lotSizeSf > 0 && (() => {
        const z = (parcel.zoning || "").toUpperCase();
        let densityText, unitCount;
        if (/^R1|^RS|^RE/.test(z)) {
          unitCount = 1;
          densityText = "1 unit per lot (R1 zone) + ADU/JADU";
        } else if (/^RD/.test(z)) {
          unitCount = 2;
          densityText = "2 units per lot (RD zone)";
        } else if (/^R4/.test(z)) {
          unitCount = Math.floor(parcel.lotSizeSf / 400);
          densityText = parcel.lotSizeSf.toLocaleString() + " sf ÷ 400 = " + unitCount + " units by-right";
        } else if (/^R5/.test(z)) {
          unitCount = null;
          densityText = "No density limit (R5 zone — FAR controls)";
        } else {
          // R2, R3, C zones default to 800 sf
          unitCount = Math.floor(parcel.lotSizeSf / 800);
          densityText = parcel.lotSizeSf.toLocaleString() + " sf ÷ 800 = " + unitCount + " units by-right";
        }
        return (
        <div style={{ background:T.warmGray, borderRadius:10, padding:"14px 18px", marginBottom:12,
          display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8,
          border:`2px solid ${T.orange}30` }}>
          <div>
            <div style={{ fontSize:10, color:T.orange, letterSpacing:"0.1em" }}>DENSITY</div>
            <div style={{ fontSize:16, fontWeight:700, color:T.textHead, fontFamily:"Georgia,serif", marginTop:2 }}>
              {densityText}
            </div>
          </div>
          {parcel.toc && parcel.toc !== "None" && (
            <div style={{ background:T.orange+"20", border:`1px solid ${T.orange}40`, borderRadius:6, padding:"4px 12px" }}>
              <div style={{ fontSize:9, color:T.orange, fontFamily:"monospace" }}>TOC</div>
              <div style={{ fontSize:14, fontWeight:700, color:T.orange }}>{parcel.toc}</div>
            </div>
          )}
        </div>);
      })()}

      {/* Housing */}
      <Card title="Housing" color={T.orange}>
        <Row label="RSO (Rent Stabilization)" value={parcel.rso !== undefined ? (parcel.rso ? "Yes" : "No") : null} />
        <Row label="TOC (Transit Oriented Communities)" value={parcel.toc || null} />
        <Row label="HE Replacement Required" value={parcel.heReplacement !== undefined ? (parcel.heReplacement ? "Yes" : "No") : null} flagged={parcel.heReplacement === true} />
        <Row label="Just Cause Eviction (JCO)" value={parcel.jco !== undefined ? (parcel.jco ? "Yes" : "No") : null} />
      </Card>

      {/* Hazards & Environmental */}
      <Card title="Hazards & Environmental" color="#B91C1C">
        <HazardGrid items={[
          ["Coastal Zone", parcel.coastalZone === "Yes" ? parcel.coastalZoneType || "Yes" : parcel.coastalZone === "No" ? false : null, parcel.coastalZone === "Yes"],
          ["Very High Fire Hazard Zone", parcel.fireHazard, false],
          ["Liquefaction (CGS)", parcel.liquefaction, parcel.liquefaction === true],
          ["Landslide (CGS)", parcel.landslide, parcel.landslide === true],
          ["Alquist-Priolo Fault", parcel.alquistPriolo, parcel.alquistPriolo === true],
          ["Prelim. Fault Rupture Study", parcel.prelimFaultRupture, parcel.prelimFaultRupture === true],
          ["Hillside Area", parcel.hillside, false],
          ["Special Grading", parcel.specialGrading, false],
          ["Sea Level Rise", parcel.seaLevelRise, parcel.seaLevelRise === true],
          ["Tsunami Hazard", parcel.tsunami, parcel.tsunami === true],
          ["Flood Zone", parcel.floodZone ? parcel.floodZone : parcel.floodZone === undefined ? null : false, false],
          ["Methane Hazard", parcel.methane === false ? false : parcel.methane || null, !!parcel.methane && parcel.methane !== false],
          ["Airport Hazard", parcel.airportHazard === false ? false : parcel.airportHazard || null, !!parcel.airportHazard && parcel.airportHazard !== false],
        ]} />
      </Card>

      {/* Planning & Zoning Overlays */}
      <Card title="Planning & Zoning Overlays" color={T.secondary}>
        <Row label="Specific Plan" value={parcel.specificPlan || null} />
        <Row label="HPOZ (Historic Preservation)" value={parcel.hpoz === true ? "Yes" : parcel.hpoz === false ? "No" : null} />
        <Row label="CDO (Community Design Overlay)" value={parcel.cdo === true ? "Yes" : parcel.cdo === false ? "No" : null} />
        <Row label="General Plan Land Use" value={parcel.generalPlanLandUse || null} />
        <Row label="Community Plan" value={parcel.communityPlan || null} />
        {parcel.ziCodes?.length > 0 && (
          <div style={{ marginTop:8 }}>
            <div style={{ fontSize:10, color:T.secondary, fontFamily:"monospace", marginBottom:4,
              letterSpacing:"0.08em" }}>ZONING INFORMATION ({parcel.ziCodes.length})</div>
            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
              {parcel.ziCodes.map((zi,i) => (
                <span key={i} style={{ fontSize:10, background:T.orange+"10", color:T.orange,
                  border:`1px solid ${T.orange}40`, borderRadius:4, padding:"3px 8px" }}>
                  {zi}
                </span>
              ))}
            </div>
          </div>
        )}
        {parcel.overlayLayers?.length > 0 && (
          <div style={{ marginTop:8 }}>
            <div style={{ fontSize:10, color:T.secondary, fontFamily:"monospace", marginBottom:4,
              letterSpacing:"0.08em" }}>ALL DETECTED OVERLAYS ({parcel.overlayLayers.length})</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {parcel.overlayLayers.map((o,i) => (
                <span key={i} style={{ fontSize:10, background:T.orange+"10", color:T.orange,
                  border:`1px solid ${T.orange}40`, borderRadius:4, padding:"2px 6px" }}>
                  {o.layerName}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ZIMAS address mismatch warning — data was discarded for safety */}
      {parcel.zimasAddressMismatch && (
        <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10,
          padding:"14px 18px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#991B1B", marginBottom:4 }}>
            ⚠ ZIMAS returned a different address — data discarded
          </div>
          <div style={{ fontSize:12, color:"#7F1D1D", lineHeight:1.6 }}>
            ZIMAS matched a different property than the one you entered. To protect report accuracy,
            ZIMAS-specific data (year built, TOC, RSO, specific plans) was not included.
            Try running the report again, or verify directly at{" "}
            <a href="https://zimas.lacity.org" target="_blank" style={{ color:"#B91C1C", fontWeight:600 }}>
              zimas.lacity.org
            </a>.
          </div>
        </div>
      )}

      {/* Manual entry prompt — only show if ZIMAS proxy didn't fill in the data */}
      {(!parcel.yearBuilt && !parcel.existingUnits && parcel.toc === undefined) && (
        <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:10,
          padding:"14px 18px", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#92400E", marginBottom:4 }}>
            Some parcel data unavailable — ZIMAS may be slow
          </div>
          <div style={{ fontSize:12, color:"#78350F", lineHeight:1.6 }}>
            Year built, unit count, TOC, RSO, and other fields could not be loaded automatically.
            Visit{" "}
            <a href="https://zimas.lacity.org" target="_blank" style={{ color:"#B45309", fontWeight:600 }}>
              zimas.lacity.org
            </a> to verify missing data. Try running the report again — ZIMAS response times vary.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Project Summary — deterministic overview from parcel data ─────────────
function ProjectSummary({ parcel, projectType, scoreCards }) {
  if (!parcel) return null;
  const label = getLabel(projectType);
  const z = (parcel.zoning || "").toUpperCase();

  // FAR lookup
  const farMap = { "R1":0.50, "RS":0.50, "RE":0.50, "R2":3.00, "RD":3.00, "R3":3.00, "R4":3.00, "R5":6.00, "C1":1.50, "C2":1.50, "C4":1.50, "C5":6.00, "CR":6.00 };
  const zoneBase = z.match(/^(R[1-5]|RD|RS|RE|C[1-5]|CR|CM|M[1-2])/)?.[1] || "";
  const far = farMap[zoneBase] || null;

  // Height lookup
  const htMap = { "R1":"28-33 ft (BMO)", "RS":"28-33 ft", "RE":"28-33 ft", "R2":"45 ft", "RD":"45 ft", "R3":"45 ft", "R4":"No limit (HD1)", "R5":"No limit (HD1)" };
  const maxHeight = htMap[zoneBase] || null;

  // State law eligibility checks
  const hasAB2097 = parcel.ab2097 === true;
  const hasTransitProxy = hasAB2097 || parcel.ziCodes?.some(z => z.includes("2452"));
  const isMultifamily = /^R[2-5]|^RD/.test(z);
  const isSingleFamily = /^R1|^RS|^RE/.test(z);
  const isCommercial = /^C[1-5]|^CR/.test(z);
  const lotAcres = parcel.lotSizeSf ? parcel.lotSizeSf / 43560 : 0;
  const notFireHazard = parcel.fireHazard !== true;
  const sb684Eligible = isMultifamily && lotAcres <= 5;
  const sb1123Eligible = isSingleFamily && lotAcres <= 1.5 && !parcel.yearBuilt;
  const sb79Proxy = hasTransitProxy && /^R[1-5]|^RD|^C[1-5]|^CR/.test(z) && notFireHazard;
  const sb9Eligible = isSingleFamily && parcel.hpoz !== true;
  const sb35Eligible = isMultifamily && parcel.ziCodes?.some(z => z.includes("2512"));
  const ab2011Eligible = isCommercial;
  const sdblEligible = isMultifamily || (parcel.toc && parcel.toc !== "None");
  const isCoastal = parcel.coastalZone === "Yes";
  const hasStateLaws = sb79Proxy || sb684Eligible || sb1123Eligible || hasAB2097 || sb9Eligible || sb35Eligible || ab2011Eligible;

  const SRow = ({ label: l, value: v, highlight, small }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
      padding: small ? "4px 0" : "6px 0", borderBottom:`1px solid ${T.border}`, gap:8 }}>
      <span style={{ fontSize:11, color:T.secondary, fontFamily:"monospace", letterSpacing:"0.04em",
        flexShrink:0, paddingTop:1 }}>{l}</span>
      <span style={{ fontSize:12, color: highlight ? T.orange : T.text, fontWeight: highlight ? 700 : 400,
        textAlign:"right", lineHeight:1.4 }}>{v || "—"}</span>
    </div>
  );

  const StateLawBadge = ({ name, status, color }) => (
    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 0",
      borderBottom:`1px solid ${T.border}` }}>
      <span style={{ fontSize:8, fontWeight:700, color:"#fff", background:color,
        borderRadius:3, padding:"1px 6px", fontFamily:"monospace", whiteSpace:"nowrap" }}>{status}</span>
      <span style={{ fontSize:11, color:T.text }}>{name}</span>
    </div>
  );

  return (
    <div style={{ background:T.white, borderRadius:12, border:`1px solid ${T.border}`,
      overflow:"hidden" }}>
      {/* Header */}
      <div style={{ background:T.orange, padding:"12px 16px", display:"flex",
        justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.white, letterSpacing:"0.06em",
          fontFamily:"monospace" }}>PROJECT SUMMARY</div>
        <span style={{ fontSize:12, fontWeight:700, color:T.white,
          fontFamily:"'Georgia',serif" }}>{label}</span>
      </div>

      <div style={{ padding:"12px 16px" }}>
        {/* Key Metrics */}
        <SRow label="ZONING" value={parcel.zoning || "—"} />
        <SRow label="DENSITY" value={parcel.densityCalc || "—"} highlight />
        {far && <SRow label="FAR" value={far + "× buildable area"} />}
        {maxHeight && <SRow label="MAX HEIGHT" value={maxHeight} />}
        <SRow label="TOC" value={parcel.toc === "None" ? "None" : parcel.toc || "Not verified"} />
        {parcel.lotSizeSf && <SRow label="LOT" value={parcel.lotSizeSf.toLocaleString() + " sf"} />}

        {/* State Law Eligibility */}
        {hasStateLaws && (
          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:9, color:T.orange, fontFamily:"monospace",
              letterSpacing:"0.1em", marginBottom:6 }}>STATE LAW ELIGIBILITY</div>
            {sb79Proxy && <StateLawBadge name="SB 79 — Transit upzoning (eff. July 2026)" status="LIKELY" color={T.yellow} />}
            {sb35Eligible && <StateLawBadge name="SB 35/423 — Streamlined ministerial" status="LIKELY" color={T.yellow} />}
            {sb684Eligible && <StateLawBadge name="SB 684 — Ministerial ≤10 units" status="ELIGIBLE" color="#15803d" />}
            {sb1123Eligible && <StateLawBadge name="SB 1123 — Starter homes (vacant SF lot)" status="LIKELY" color={T.yellow} />}
            {sb9Eligible && <StateLawBadge name="SB 9 — Duplex + lot split" status="ELIGIBLE" color="#15803d" />}
            {ab2011Eligible && <StateLawBadge name="AB 2011 — Housing on commercial" status="CHECK" color="#d97706" />}
            {hasAB2097 && <StateLawBadge name="AB 2097 — No parking minimum" status="YES" color="#15803d" />}
            {isCoastal && <StateLawBadge name="SB 1077 — Coastal ADU streamlining (eff. July 2026)" status="PENDING" color="#6366f1" />}
          </div>
        )}

        {/* Permit Estimates from Score Cards */}
        {scoreCards && (scoreCards.fees || scoreCards.timeline) && (
          <div style={{ marginTop:10 }}>
            <div style={{ fontSize:9, color:T.orange, fontFamily:"monospace",
              letterSpacing:"0.1em", marginBottom:6 }}>PERMIT ESTIMATES</div>
            {scoreCards.fees && <SRow label="EST. FEES" value={scoreCards.fees} small />}
            {scoreCards.timeline && <SRow label="TIMELINE" value={scoreCards.timeline} small />}
          </div>
        )}

        {/* Data Source */}
        <div style={{ marginTop:10, fontSize:10, color:T.secondary, textAlign:"center",
          padding:"6px 0", borderTop:`1px solid ${T.border}` }}>
          {parcel.source === "ZIMAS" ? "✓ ZIMAS verified" : "Estimated from ZIP"}
          {" · "}State law data as of April 2026
        </div>
      </div>
    </div>
  );
}



// ── Split Claude's output into sections by ## headers ─────────────────
function parseReportSections(text) {
  const lines = (text || "").split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("## ")) {
      if (current) sections.push(current);
      const name = t.slice(3);
      current = { name, id: "sec-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
    // Lines before first ## are ignored (shouldn't happen with Listo's output format)
  }
  if (current) sections.push(current);
  return sections;
}

// ── Extract KPIs from Claude's output for the hero card ───────────────
function extractKPIs(text) {
  const r = { verdict: "", verdictDesc: "", fees: "", timeline: "", alerts: "", project: "", zoning: "", units: "", data: "" };
  for (const line of (text || "").split("\n")) {
    const t = line.trim().replace(/\*\*/g, "");
    if (t.startsWith("VERDICT:")) { const p = t.slice(8).trim().split("|").map(s => s.trim()); r.verdict = p[0]; r.verdictDesc = p[1] || ""; }
    if (t.startsWith("PERMITS:")) { const p = t.slice(8).trim().split("|").map(s => s.trim()); r.fees = p[0]; r.timeline = p[1] || ""; }
    if (t.startsWith("ALERTS:")) r.alerts = t.slice(7).trim();
    if (t.startsWith("PROJECT:")) r.project = t.slice(8).trim();
    if (t.startsWith("ZONING:")) r.zoning = t.slice(7).trim();
    if (t.startsWith("UNITS:")) r.units = t.slice(6).trim();
    if (t.startsWith("DATA:")) r.data = t.slice(5).trim();
  }
  return r;
}

// ── Inline markdown renderer ──────────────────────────────────────────
function renderInline(text) {
  return (text || "").split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} style={{ color: T.text }}>{p.slice(2, -2)}</strong> : p
  );
}

// ── Render lines within a section — preserves ALL existing parsing ─────
function SectionLines({ lines, sectionName }) {
  const els = [];
  let i = 0, lk = 0;
  const sec = sectionName.toLowerCase();
  let subsec = "";
  const inSec = (s) => sec.includes(s) || subsec.includes(s);

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t || t === "---") { els.push(<div key={i} style={{ height: 5 }} />); i++; continue; }

    // Subsection headers
    if (t.startsWith("### ")) {
      subsec = t.slice(4).toLowerCase();
      els.push(<h3 key={i} style={{ fontSize: 13, fontWeight: 700, color: T.textHead,
        margin: "14px 0 8px", background: T.warmGray, padding: "4px 10px", borderRadius: 4 }}>
        {renderInline(t.slice(4))}
      </h3>);
      i++; continue;
    }
    if (t.startsWith("#### ")) {
      els.push(<h3 key={i} style={{ fontSize: 12, fontWeight: 700, color: T.orange,
        margin: "10px 0 6px", letterSpacing: "0.05em" }}>
        {t.slice(5)}
      </h3>);
      i++; continue;
    }

    // ── Zone Alerts — flag cards with icon squares ──
    if (sec.includes("alert") && t.includes("|") && t.split("|").length >= 2) {
      const pts = t.split("|").map(p => p.trim());
      const [sev, name, dollar, time] = pts;
      const levelMap = { "REQUIRED": "red", "ACTION REQUIRED": "red", "CRITICAL": "red", "FACTOR": "yellow", "CAUTION": "yellow", "BENEFIT": "green", "NOTE": "green", "INFO": "green", "CLEAR": "green" };
      const level = levelMap[sev] || "green";
      const displayLabel = level === "red" ? "REQUIRED" : level === "yellow" ? "FACTOR" : "BENEFIT";
      const cfg = level === "red"
        ? { bg: "#FEF2F2", border: "#FECACA", color: T.red }
        : level === "yellow"
        ? { bg: "#FFFBEB", border: "#FDE68A", color: T.yellow }
        : { bg: "#F0FDF4", border: "#BBF7D0", color: T.green };
      const iconPath = level === "green"
        ? <path d="M4 8.5L7 11.5L12 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        : <><path d="M8 4v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><path d="M8 11v1" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></>;
      let desc = "";
      if (i + 1 < lines.length && !lines[i + 1].trim().includes("|") && lines[i + 1].trim()) {
        desc = lines[i + 1].trim(); i++;
      }
      els.push(<div key={i} style={{ marginBottom: 8 }}>
        <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: cfg.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none">{iconPath}</svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: cfg.color, letterSpacing: "0.1em", marginBottom: 2 }}>{displayLabel}</div>
                {name && <div style={{ fontSize: 14, fontWeight: 600, color: T.textHead }}>{name}</div>}
              </div>
              {dollar && dollar !== "Variable" && dollar !== "Benefit" && dollar !== "None" && (
                <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color, whiteSpace: "nowrap" }}>{dollar}</span>
              )}
            </div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6, marginTop: 2 }}>{desc}</div>
            {(dollar || time) && <div style={{ fontSize: 11, color: T.secondary, marginTop: 4 }}>
              {dollar && dollar !== "Variable" && dollar !== "Benefit" ? dollar : ""}{time && time !== "—" && time !== "Variable" ? (dollar && dollar !== "Variable" && dollar !== "Benefit" ? " · " : "") + "+" + time : ""}
            </div>}
          </div>
        </div>
      </div>);
      i++; continue;
    }

    // ── Permit roadmap cards ──
    if ((inSec("roadmap") || inSec("road map") || inSec("permit")) && t.includes("|") && t.split("|").length >= 3) {
      const [name2, type, agency, time2, cost] = t.split("|").map(p => p.trim());
      const isOTC = (type || "").toUpperCase() === "OTC";
      const b = isOTC
        ? { bg: T.green + "20", color: T.green, border: T.green + "40", label: "OTC" }
        : { bg: T.warmGray, color: T.secondary, border: T.border, label: "PLAN CHECK" };
      els.push(
        <div key={i} style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 4, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>{name2}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", background: b.bg, color: b.color, border: `1px solid ${b.border}`, borderRadius: 3, padding: "2px 8px" }}>{b.label}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: T.secondary }}>
            {agency && <span>{agency}</span>}
            {time2 && <span>{time2}</span>}
            {cost && <span style={{ color: T.orange, fontWeight: 600 }}>{cost}</span>}
          </div>
        </div>
      );
      i++; continue;
    }

    // ── Development Standards table ──
    if (inSec("standard") || inSec("regulation")) {
      if (t.startsWith("ZONING:") && !t.includes("|")) {
        els.push(<div key={i} style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
          {renderInline(t)}
        </div>);
        i++; continue;
      }
      if (t === "STANDARD | MAX ALLOWED | PROPOSED/TYPICAL | LAMC REF" || t === "STANDARD | MAX ALLOWED | PROPOSED | LAMC REF") {
        els.push(<div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1.8fr 1.5fr 1.2fr", background: T.black, marginBottom: 1, borderRadius: "6px 6px 0 0" }}>
          {["STANDARD", "MAX ALLOWED", "PROPOSED", "LAMC REF"].map((h, hi) => (
            <div key={hi} style={{ padding: "7px 10px", fontSize: 9, fontWeight: 700, color: T.orange, letterSpacing: "0.08em" }}>{h}</div>
          ))}
        </div>);
        i++;
        let rowIdx = 0;
        while (i < lines.length) {
          const rt = lines[i].trim();
          if (!rt || rt.startsWith("##") || rt.startsWith("EXEMPTION:") || rt.startsWith("ENCROACHMENT") || rt.startsWith("GRADING:") || rt.startsWith("BASEMENT:") || rt.startsWith("FIRE SPRINKLERS:") || rt.startsWith("OFFSET PLAN") || rt.startsWith("SWIMMING POOL:") || rt.startsWith("PARKING STALLS:") || rt.startsWith("Analysis as of")) break;
          if (rt.includes("|") && rt.split("|").length >= 2) {
            const cells = rt.split("|").map(p => p.trim());
            const [std, maxA, prop, lamc] = cells;
            els.push(<div key={"dsr" + i} style={{ display: "grid", gridTemplateColumns: "2fr 1.8fr 1.5fr 1.2fr", background: rowIdx % 2 === 0 ? T.white : T.warmGray, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: T.text }}>{renderInline(std)}</div>
              <div style={{ padding: "8px 10px", fontSize: 12, color: T.green, fontWeight: 500 }}>{renderInline(maxA || "")}</div>
              <div style={{ padding: "8px 10px", fontSize: 12, color: T.secondary }}>{renderInline(prop || "")}</div>
              <div style={{ padding: "8px 10px", fontSize: 11, color: T.secondary, fontFamily: "monospace" }}>{lamc || ""}</div>
            </div>);
            rowIdx++;
          }
          i++;
        }
        continue;
      }
      if (t.startsWith("EXEMPTION:")) {
        const rest = t.slice(10).trim();
        const parts = rest.split("|").map(p => p.trim());
        const [desc, amount, lamc] = parts;
        els.push(<div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 10px", background: "#FFF8F0", border: `1px solid ${T.orange}30`, borderRadius: 5, marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.orange, letterSpacing: "0.08em", minWidth: 70, marginTop: 1, flexShrink: 0 }}>EXEMPT</span>
          <span style={{ fontSize: 12, color: T.text, flex: 1, lineHeight: 1.5 }}>{renderInline(desc)}</span>
          {amount && <span style={{ fontSize: 11, color: T.orange, fontWeight: 600, whiteSpace: "nowrap" }}>{amount}</span>}
          {lamc && <span style={{ fontSize: 10, color: T.secondary, fontFamily: "monospace", whiteSpace: "nowrap" }}>{lamc}</span>}
        </div>);
        i++; continue;
      }
      // Technical spec rows
      if (/^(ENCROACHMENT PLANE:|GRADING:|BASEMENT:|FIRE SPRINKLERS:|OFFSET PLAN BREAK:|SWIMMING POOL:|PARKING STALLS:)/i.test(t)) {
        const colonIdx = t.indexOf(":");
        const lbl = t.slice(0, colonIdx);
        const val = t.slice(colonIdx + 1).trim();
        els.push(<div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.border}`, alignItems: "flex-start" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.secondary, fontFamily: "monospace", minWidth: 110, flexShrink: 0, paddingTop: 2 }}>{lbl}</span>
          <span style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{renderInline(val)}</span>
        </div>);
        i++; continue;
      }
      if (t.toLowerCase().startsWith("analysis as of") || t.toLowerCase().startsWith("lamc standards")) {
        els.push(<div key={i} style={{ fontSize: 11, color: T.secondary, fontStyle: "italic", padding: "8px 0", marginTop: 4 }}>{renderInline(t)}</div>);
        i++; continue;
      }
    }

    // ── Development Opportunity metrics ──
    if (sec.includes("opportunity")) {
      if (t.startsWith("USES PERMITTED:")) {
        els.push(<div key={i} style={{ background: T.warmGray, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 14px", marginBottom: 8, marginTop: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.orange, letterSpacing: "0.1em", marginBottom: 4 }}>USES PERMITTED</div>
          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>{renderInline(t.slice(15).trim())}</div>
        </div>);
        i++; continue;
      }
      for (const prefix of ["DENSITY MATH:", "BUILDABLE AREA:", "MAX FLOOR AREA:", "MAX BUILDOUT:", "TOC BONUS:", "ADU:", "EXISTING STRUCTURE:"]) {
        if (t.startsWith(prefix)) {
          const val = t.slice(prefix.length).trim();
          const isHighlight = prefix === "DENSITY MATH:" || prefix === "MAX BUILDOUT:";
          const color = isHighlight ? T.green : T.text;
          els.push(<div key={i} style={{ background: isHighlight ? T.green + "10" : T.warmGray, border: `1px solid ${isHighlight ? T.green + "40" : T.border}`, borderRadius: 6, padding: isHighlight ? "12px 14px" : "8px 12px", marginBottom: 6, display: "flex", gap: 8, alignItems: isHighlight ? "flex-start" : "center", flexDirection: isHighlight ? "column" : "row" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: isHighlight ? T.green : T.secondary, letterSpacing: "0.1em" }}>{prefix.slice(0, -1)}</span>
            <span style={{ fontSize: isHighlight ? 18 : 13, fontWeight: isHighlight ? 700 : 400, color, fontFamily: isHighlight ? "'Georgia',serif" : "inherit" }}>{val}</span>
          </div>);
          i++; break;
        }
      }
      if (i < lines.length && lines[i].trim() === t) { /* didn't match any prefix, fall through */ } else continue;
    }

    // ── Fee summary ──
    if (inSec("fee") && t.includes("|")) {
      const pts = t.split("|").map(p => p.trim());
      const isTotal = (pts[0] || "").toUpperCase().includes("TOTAL");
      if (isTotal) {
        els.push(<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 4px", marginTop: 4, borderTop: `2px solid ${T.orange}` }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: T.textHead }}>TOTAL FEES</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: T.orange, fontFamily: "'Georgia',serif" }}>{pts[1] || ""} {pts[2] || ""}</span>
        </div>);
      } else {
        els.push(<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{pts[0]}</div>
            {pts[1] && <div style={{ fontSize: 11, color: T.secondary }}>{pts[1]}</div>}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.orange, whiteSpace: "nowrap" }}>{pts[2] || pts[1] || ""}</span>
        </div>);
      }
      i++; continue;
    }

    // ── Timeline — Gantt bars ──
    if (inSec("timeline")) {
      const wm = t.match(/^Weeks?\s([\d]+)\s*[-–]\s*([\d]+)\s*:\s*(.+)$/i);
      if (wm) {
        const ganttItems = [];
        let worstWeek = 0;
        while (i < lines.length) {
          const gl = lines[i].trim();
          const gm = gl.match(/^Weeks?\s([\d]+)\s*[-–]\s*([\d]+)\s*:\s*(.+)$/i);
          if (gm) {
            const start = parseInt(gm[1]), end = parseInt(gm[2]);
            ganttItems.push({ start, end, label: gm[3].trim() });
            if (end > worstWeek) worstWeek = end;
            i++; continue;
          }
          const gm2 = gl.match(/^Weeks?\s([\d]+)\+?\s*:\s*(.+)$/i);
          if (gm2) {
            const wk = parseInt(gm2[1]);
            ganttItems.push({ start: wk, end: wk + 1, label: gm2[2].trim() });
            if (wk + 1 > worstWeek) worstWeek = wk + 1;
            i++; continue;
          }
          break;
        }
        if (ganttItems.length > 0) {
          els.push(
            <div key={"gantt" + i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, paddingLeft: 100, fontSize: 10, color: T.secondary, fontFamily: "monospace" }}>
                {[0, Math.round(worstWeek / 4), Math.round(worstWeek / 2), Math.round(worstWeek * 3 / 4), worstWeek].map((w, wi) => <span key={wi}>{w}</span>)}
              </div>
              {ganttItems.map((bar, bi) => (
                <div key={"gb" + bi} style={{ display: "flex", alignItems: "center", marginBottom: 3, height: 24 }}>
                  <div style={{ width: 96, fontSize: 10, color: T.secondary, textAlign: "right", paddingRight: 8, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bar.label.length > 16 ? bar.label.slice(0, 16) + "…" : bar.label}</div>
                  <div style={{ flex: 1, position: "relative", height: 20 }}>
                    <div style={{ position: "absolute", left: `${(bar.start / worstWeek) * 100}%`, width: `${Math.max(((bar.end - bar.start) / worstWeek) * 100, 3)}%`, height: "100%", background: T.orange + "25", borderRadius: 4, border: `1px solid ${T.orange}50`, display: "flex", alignItems: "center", paddingLeft: 6 }}>
                      <span style={{ fontSize: 9, color: T.orange, fontWeight: 600, whiteSpace: "nowrap" }}>{bar.end - bar.start} wks</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        continue;
      }
      if (t.startsWith("BEST CASE:") || t.startsWith("WORST CASE:")) {
        const isB = t.startsWith("BEST");
        els.push(<div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.secondary, letterSpacing: "0.06em", minWidth: 90 }}>{isB ? "BEST CASE" : "WORST CASE"}</span>
          <span style={{ fontSize: 13, color: isB ? T.green : T.red, fontWeight: 700 }}>{t.slice(t.indexOf(":") + 1).trim()}</span>
        </div>);
        i++; continue;
      }
    }

    // ── Documents ──
    if (inSec("document")) {
      if (t.includes("|") && t.split("|").length >= 2) {
        const [dn, dw, ds] = t.split("|").map(p => p.trim());
        const isHeader = /^(DEMO|BUILDING|TECHNICAL)/.test(dn);
        const req = ds && ds.includes("REQ") && !ds.includes("NOT REQ");
        if (isHeader) {
          els.push(<div key={i} style={{ fontSize: 11, fontWeight: 700, color: T.orange, letterSpacing: "0.06em", marginTop: 12, marginBottom: 4 }}>{dn}</div>);
        } else {
          els.push(<div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center", fontSize: 12 }}>
            <span style={{ flex: 1, color: T.text }}>{dn}</span>
            <span style={{ color: T.secondary, minWidth: 120 }}>{dw}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: T.white, background: req ? T.red : T.green, borderRadius: 3, padding: "1px 6px" }}>STAMP: {req ? "REQ" : "NOT REQ"}</span>
          </div>);
        }
        i++; continue;
      }
    }

    // ── Definitions ──
    if (inSec("definition") && t.includes(":")) {
      const ci = t.indexOf(":");
      const term = t.slice(0, ci).trim();
      const def = t.slice(ci + 1).trim();
      els.push(<div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.orange, fontFamily: "monospace", minWidth: 90, flexShrink: 0, paddingTop: 2 }}>{term}</span>
        <span style={{ fontSize: 12, color: T.secondary, lineHeight: 1.5 }}>{renderInline(def)}</span>
      </div>);
      i++; continue;
    }

    // ── Terms & Data Sources ──
    if (inSec("terms") || inSec("data source")) {
      if (t.includes("|")) {
        const items = t.split("|").map(s => s.trim()).filter(Boolean);
        els.push(<div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {items.map((item, idx) => {
            const ci2 = item.indexOf(":");
            if (ci2 > 0) {
              return <span key={idx} style={{ fontSize: 10, padding: "3px 8px", background: T.warmGray, border: `1px solid ${T.border}`, borderRadius: 4 }}>
                <strong style={{ color: T.orange }}>{item.slice(0, ci2).trim()}</strong>
                <span style={{ color: T.secondary }}> {item.slice(ci2 + 1).trim()}</span>
              </span>;
            }
            return <span key={idx} style={{ fontSize: 10, color: T.secondary, padding: "3px 8px", background: T.warmGray, border: `1px solid ${T.border}`, borderRadius: 4 }}>{item}</span>;
          })}
        </div>);
        i++; continue;
      }
    }

    // ── Critical Path ──
    if (t.startsWith("CRITICAL PATH:")) {
      els.push(<div key={i} style={{ padding: "8px 12px", background: T.orange + "10", border: `1px solid ${T.orange}40`, borderRadius: 6, marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.orange, letterSpacing: "0.08em" }}>CRITICAL PATH</span>
        <span style={{ fontSize: 13, color: T.orange, fontWeight: 600 }}>{t.slice(14).trim()}</span>
      </div>);
      i++; continue;
    }

    // ── Markdown table ──
    if (t.startsWith("|")) {
      const tl = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { tl.push(lines[i].trim()); i++; }
      const data = tl.filter(l => !/^\|[\s\-\:]+\|/.test(l));
      if (data.length >= 2) {
        const hdrs = data[0].split("|").filter((_, ci, a) => ci > 0 && ci < a.length - 1).map(c => c.trim());
        const rows = data.slice(1).filter(l => /^\|[^-]/.test(l));
        els.push(<div key={"t" + i} style={{ overflowX: "auto", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{hdrs.map((h, hi) => <th key={hi} style={{ padding: "8px 12px", textAlign: "left", background: T.black, color: T.orange, fontWeight: 700, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `2px solid ${T.orange}40` }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((row, ri) => {
              const cells = row.split("|").filter((_, ci, a) => ci > 0 && ci < a.length - 1).map(c => c.trim());
              return <tr key={ri} style={{ background: ri % 2 === 0 ? T.white : T.warmGray }}>
                {cells.map((c, ci) => <td key={ci} style={{ padding: "8px 12px", color: ci === 0 ? T.secondary : T.text, fontWeight: ci === 0 ? 600 : 400, borderBottom: `1px solid ${T.border}`, lineHeight: 1.5 }}>{renderInline(c)}</td>)}
              </tr>;
            })}</tbody>
          </table>
        </div>);
        continue;
      }
    }

    // ── Standalone bold ──
    if (t.startsWith("**") && t.endsWith("**") && t.length > 4) {
      els.push(<p key={i} style={{ fontSize: 14, fontWeight: 700, color: T.text, marginTop: 10, marginBottom: 4 }}>{t.slice(2, -2)}</p>);
      i++; continue;
    }

    // ── Bullet list ──
    if (t.startsWith("- ") || t.startsWith("* ")) {
      lk++;
      const items = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        items.push(<li key={i} style={{ fontSize: 13, color: T.text, lineHeight: 1.7, marginBottom: 2 }}>{renderInline(lines[i].trim().slice(2))}</li>);
        i++;
      }
      els.push(<ul key={"ul" + lk} style={{ paddingLeft: 18, marginBottom: 8 }}>{items}</ul>);
      continue;
    }

    // ── Numbered list ──
    if (/^\d+\.\s/.test(t)) {
      lk++;
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(<li key={i} style={{ fontSize: 13, color: T.text, lineHeight: 1.7, marginBottom: 2 }}>{renderInline(lines[i].trim().replace(/^\d+\.\s+/, ""))}</li>);
        i++;
      }
      els.push(<ol key={"ol" + lk} start={1} style={{ paddingLeft: 22, marginBottom: 8, listStyleType: "decimal" }}>{items}</ol>);
      continue;
    }

    // ── Catch-all paragraph ──
    els.push(<p key={i} style={{ fontSize: 13, color: T.secondary, lineHeight: 1.8, marginBottom: 3 }}>{renderInline(t)}</p>);
    i++;
  }

  return <>{els}</>;
}

// ── Section Header with accent bar ───────────────────────────────────────
function SectionHeader2({ title, id, count }) {
  return (
    <div id={id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, scrollMarginTop: 70 }}>
      <div style={{ width: 4, height: 20, background: T.orange, borderRadius: 2, flexShrink: 0 }} />
      <h2 style={{ fontSize: 15, fontWeight: 700, color: T.textHead, margin: 0, fontFamily: "'Georgia',serif", textTransform: "uppercase", letterSpacing: "0.04em", flex: 1 }}>
        {title}
      </h2>
      {count !== undefined && (
        <span style={{ fontSize: 11, fontWeight: 600, background: T.warmGray, color: T.secondary, borderRadius: 10, padding: "2px 10px" }}>{count}</span>
      )}
    </div>
  );
}

// ── White card wrapper ───────────────────────────────────────────────────
function SectionCard({ children }) {
  return (
    <div style={{ background: T.white, borderRadius: 12, border: `1px solid ${T.border}`, padding: "20px 24px" }}>
      {children}
    </div>
  );
}

// ── Main Report Body — renders sections with cards ───────────────────────
function ReportBody({ text, parcel, projectType, jurisdiction }) {
  const sections = parseReportSections(text);
  const kpis = extractKPIs(text);

  // Helper: compute density scenarios
  const z = (parcel?.zoning || "").toUpperCase();
  const base = /^R1|^RS|^RE/.test(z) ? 1 : /^RD/.test(z) ? 2 : /^R4/.test(z) ? Math.floor((parcel?.lotSizeSf || 0) / 400) : Math.floor((parcel?.lotSizeSf || 0) / 800);
  const hasToc = parcel?.toc && parcel.toc !== "None";
  const tocMulti = parcel?.toc === "Tier 4" ? 1.80 : parcel?.toc === "Tier 3" ? 1.70 : parcel?.toc === "Tier 2" ? 1.50 : parcel?.toc === "Tier 1" ? 1.35 : 1;
  const tocUnits = hasToc ? Math.floor(base * tocMulti) : base;
  const adus = /^R[2-5]|^RD/.test(z) ? 2 : 1;
  const maxTotal = Math.max(base, tocUnits) + adus + 1;

  // Alert counts
  const reqMatch = (kpis.alerts || "").match(/(\d+)\s*required/i);
  const facMatch = (kpis.alerts || "").match(/(\d+)\s*factor/i);
  const benMatch = (kpis.alerts || "").match(/(\d+)\s*benefit/i);
  // Fallback: count from old format
  const reqCount = reqMatch ? parseInt(reqMatch[1]) : (kpis.alerts.match(/(\d+)\s*action/i) || [0, 0])[1];
  const facCount = facMatch ? parseInt(facMatch[1]) : (kpis.alerts.match(/(\d+)\s*caution/i) || [0, 0])[1];
  const benCount = benMatch ? parseInt(benMatch[1]) : (kpis.alerts.match(/(\d+)\s*(?:info|note|benefit)/i) || [0, 0])[1];

  return (
    <div style={{ padding: "16px 16px 0" }}>
      {/* Reorder sections to match prototype: Overview → Opportunity → Alerts → Standards → Permits → Survey → rest */}
      {(() => {
        const order = ["project overview","development opportunity","zone alert","regulation","development standard","permitting","permit road","parcel survey","hazard","housing","definition","terms","legal"];
        const sorted = [];
        for (const target of order) {
          const found = sections.find(s => s.name.toLowerCase().includes(target) && !sorted.includes(s));
          if (found) sorted.push(found);
        }
        for (const s of sections) { if (!sorted.includes(s)) sorted.push(s); }
        return sorted;
      })().map((section, si) => {
        const sn = section.name.toLowerCase();

        // ── PROJECT OVERVIEW ──
        if (sn.includes("project overview") || sn.includes("deal")) {
          return (
            <div key={si} style={{ marginBottom: 24 }}>
              <SectionHeader2 title={section.name} id={section.id} />
              <SectionCard>
                {/* Stats grid */}
                <div className="overview-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "ZONING", value: parcel?.zoning || "—", sub: (kpis.zoning || "").split("|").pop()?.trim() || "" },
                    { label: "LOT SIZE", value: parcel?.lotSizeSf ? parcel.lotSizeSf.toLocaleString() + " sf" : "—", sub: parcel?.apn ? "APN " + parcel.apn : "" },
                    { label: "EXISTING", value: (parcel?.existingBuildingSqft || "—") + " sf / " + (parcel?.existingUnits || "—") + " unit", sub: parcel?.yearBuilt ? "Built " + parcel.yearBuilt : "" },
                    { label: "JURISDICTION", value: jurisdiction?.short || "City of LA", sub: jurisdiction?.agency || "LADBS" },
                  ].map((s, si2) => (
                    <div key={si2} style={{ background: T.warmGray, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9, color: T.secondary, letterSpacing: "0.1em", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.textHead, fontFamily: "'Georgia',serif" }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: T.secondary }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
                {parcel?.yearBuilt && parcel?.heReplacement && (
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
                    <strong>Existing structure:</strong> {parcel.yearBuilt}, {parcel.existingUnits || "?"} unit{(parcel.existingUnits || 0) > 1 ? "s" : ""}, {parcel.existingBuildingSqft || "?"} sf{parcel.rso ? ", RSO" : ", non-RSO"} — demolition triggers HE Replacement
                  </div>
                )}
              </SectionCard>
            </div>
          );
        }

        // ── DEVELOPMENT OPPORTUNITY ──
        if (sn.includes("opportunity")) {
          return (
            <div key={si} style={{ marginBottom: 24 }}>
              <SectionHeader2 title={section.name} id={section.id} />
              <SectionCard>
                {/* Density scenarios */}
                {parcel?.lotSizeSf > 0 && (
                  <div className="scenario-cards" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                    {[
                      { label: "BASE ZONING", units: base, sub: `${parcel.zoning} zone · by-right` },
                      ...(hasToc ? [{ label: `WITH ${parcel.toc.toUpperCase()}`, units: tocUnits, sub: `${Math.round((tocMulti - 1) * 100)}% density bonus`, badge: "TOC" }] : []),
                      { label: "MAX BUILDOUT", units: maxTotal, sub: `${Math.max(base, tocUnits)} primary + ${adus} ADU + 1 JADU`, highlight: true, badge: "BEST CASE" },
                    ].map((card, ci) => (
                      <div key={ci} style={{ flex: "1 1 200px", background: card.highlight ? T.orange + "08" : T.white, border: `1px solid ${card.highlight ? T.gold + "80" : T.border}`, borderLeft: card.highlight ? `4px solid ${T.gold}` : undefined, borderRadius: card.highlight ? 0 : 10, padding: "16px 18px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: card.highlight ? T.orange : T.secondary, letterSpacing: "0.06em" }}>{card.label}</div>
                          {card.badge && <span style={{ fontSize: 9, fontWeight: 700, background: T.orange, color: T.white, borderRadius: 4, padding: "2px 8px" }}>{card.badge}</span>}
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: T.textHead, fontFamily: "'Georgia',serif", marginBottom: 2 }}>{card.units}</div>
                        <div style={{ fontSize: 12, color: T.secondary, lineHeight: 1.5 }}>{card.sub}</div>
                        <div style={{ marginTop: 10, height: 5, background: T.warmGray, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${(card.units / maxTotal) * 100}%`, height: "100%", background: card.highlight ? T.gold : T.border, borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Claude's analysis for this section */}
                <SectionLines lines={section.lines} sectionName={section.name} />
              </SectionCard>
            </div>
          );
        }

        // ── ZONE ALERTS ──
        if (sn.includes("alert")) {
          return (
            <div key={si} style={{ marginBottom: 24 }}>
              <SectionHeader2 title={section.name} id={section.id} />
              <SectionCard>
                {/* Summary bar */}
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  {[
                    { label: "Required", count: reqCount, color: T.red, bg: "#FEF2F2" },
                    { label: "Factors", count: facCount, color: T.yellow, bg: "#FFFBEB" },
                    { label: "Benefits", count: benCount, color: T.green, bg: "#F0FDF4" },
                  ].map((g, gi) => (
                    <div key={gi} style={{ flex: 1, background: g.bg, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 22, fontWeight: 700, color: g.color, fontFamily: "'Georgia',serif" }}>{g.count}</span>
                      <span style={{ fontSize: 12, color: g.color, fontWeight: 600 }}>{g.label}</span>
                    </div>
                  ))}
                </div>
                <SectionLines lines={section.lines} sectionName={section.name} />
              </SectionCard>
            </div>
          );
        }

        // ── PARCEL SURVEY — uses existing visual cards ──
        if (sn.includes("parcel survey")) {
          return (
            <div key={si} style={{ marginBottom: 24 }}>
              <SectionHeader2 title={section.name} id={section.id} />
              <div className="survey-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "flex-start" }}>
                <div><ParcelSurveyCards parcel={parcel} /></div>
                <div><ProjectSummary parcel={parcel} projectType={projectType} scoreCards={extractKPIs(text)} /></div>
              </div>
            </div>
          );
        }

        // ── ALL OTHER SECTIONS — generic white card ──
        return (
          <div key={si} style={{ marginBottom: 24 }}>
            <SectionHeader2 title={section.name} id={section.id} />
            <SectionCard>
              <SectionLines lines={section.lines} sectionName={section.name} />
            </SectionCard>
          </div>
        );
      })}
    </div>
  );
}

// ── Report Hero — dark card ──────────────────────────────────────────────
function ReportHero({ address, parcel, projectType, jurisdiction, resultText }) {
  const kpis = extractKPIs(resultText);
  const vc = kpis.verdict === "GO" ? T.green : kpis.verdict === "COMPLEX" ? T.red : T.yellow;
  const label = getLabel(projectType);
  const d = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Max buildout from parcel
  const z = (parcel?.zoning || "").toUpperCase();
  let maxBuildout = "—";
  if (parcel?.lotSizeSf > 0) {
    const base = /^R1|^RS|^RE/.test(z) ? 1 : /^RD/.test(z) ? 2 : /^R4/.test(z) ? Math.floor(parcel.lotSizeSf / 400) : Math.floor(parcel.lotSizeSf / 800);
    const tocMulti = parcel.toc === "Tier 4" ? 1.80 : parcel.toc === "Tier 3" ? 1.70 : parcel.toc === "Tier 2" ? 1.50 : parcel.toc === "Tier 1" ? 1.35 : 1;
    const primary = Math.max(base, Math.floor(base * tocMulti));
    const adus = /^R[2-5]|^RD/.test(z) ? 2 : 1;
    maxBuildout = `${primary + adus + 1} units`;
  }

  // Parse alert counts
  const al = kpis.alerts || "";
  const rc = (al.match(/(\d+)\s*(?:required|action)/i) || [0, "0"])[1];
  const fc = (al.match(/(\d+)\s*(?:factor|caution)/i) || [0, "0"])[1];
  const bc = (al.match(/(\d+)\s*(?:benefit|info|note)/i) || [0, "0"])[1];

  return (
    <div style={{ background: T.black, borderRadius: 16, overflow: "hidden", marginBottom: 8 }}>
      {/* Top bar */}
      <div style={{ padding: "16px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Logo size={22} light />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: T.secondary, letterSpacing: "0.1em" }}>PERMIT ANALYSIS REPORT</div>
          <div style={{ fontSize: 11, color: "#D6D3D1" }}>{d}</div>
        </div>
      </div>

      {/* Address */}
      <div style={{ padding: "14px 28px 4px" }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.white, fontFamily: "'Georgia',serif", lineHeight: 1.2, letterSpacing: "-0.02em" }}>{address}</div>
      </div>

      {/* Tags */}
      <div style={{ padding: "8px 28px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 600, background: T.orange, color: T.white, borderRadius: 6, padding: "3px 10px" }}>{label}</span>
        {parcel?.hasData && (
          <span style={{ fontSize: 11, fontWeight: 600, background: T.green + "22", color: T.green, borderRadius: 6, padding: "3px 10px", border: `1px solid ${T.green}44`, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width={10} height={10} viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ZIMAS verified
          </span>
        )}
        <span style={{ fontSize: 11, color: "#D6D3D1", background: "#ffffff12", borderRadius: 6, padding: "3px 10px" }}>
          {jurisdiction?.short || "City of LA"} · {parcel?.zoning || "—"} · {parcel?.lotSizeSf ? parcel.lotSizeSf.toLocaleString() + " sf" : "—"}
        </span>
      </div>

      {/* Verdict bar */}
      {kpis.verdict && (
        <div style={{ background: vc + "18", borderTop: `1px solid ${vc}33`, padding: "12px 28px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.white, background: vc, borderRadius: 5, padding: "3px 12px", letterSpacing: "0.06em" }}>{kpis.verdict}</span>
          <span style={{ fontSize: 13, color: "#E7E5E4", lineHeight: 1.4, flex: 1 }}>{kpis.verdictDesc}</span>
        </div>
      )}
    </div>
  );
}

// ── KPI Strip — light background, below hero ─────────────────────────────
function KPIStrip({ parcel, resultText }) {
  const kpis = extractKPIs(resultText);
  const z = (parcel?.zoning || "").toUpperCase();
  let maxBuildout = "—";
  if (parcel?.lotSizeSf > 0) {
    const base = /^R1|^RS|^RE/.test(z) ? 1 : /^RD/.test(z) ? 2 : /^R4/.test(z) ? Math.floor(parcel.lotSizeSf / 400) : Math.floor(parcel.lotSizeSf / 800);
    const tocMulti = parcel.toc === "Tier 4" ? 1.80 : parcel.toc === "Tier 3" ? 1.70 : parcel.toc === "Tier 2" ? 1.50 : parcel.toc === "Tier 1" ? 1.35 : 1;
    const primary = Math.max(base, Math.floor(base * tocMulti));
    const adus = /^R[2-5]|^RD/.test(z) ? 2 : 1;
    maxBuildout = `${primary + adus + 1} units`;
  }
  const al = kpis.alerts || "";
  const rc = (al.match(/(\d+)\s*(?:required|action)/i) || [0, "0"])[1];
  const fc = (al.match(/(\d+)\s*(?:factor|caution)/i) || [0, "0"])[1];
  const bc = (al.match(/(\d+)\s*(?:benefit|info|note)/i) || [0, "0"])[1];

  return (
    <div className="hero-kpi-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", background: T.warmGray, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", margin: "8px 0" }}>
      {[
        { label: "MAX BUILDOUT", value: maxBuildout, color: T.orange },
        { label: "EST. FEES", value: kpis.fees || "—", color: T.textHead },
        { label: "TIMELINE", value: (kpis.timeline || "—").replace("week critical path", "wks").replace("weeks", "wks"), color: T.textHead },
        { label: "ALERTS", value: `${rc} required`, sub: `${fc} factors · ${bc} benefits`, color: parseInt(rc) > 0 ? T.red : T.green },
      ].map((kpi, ki) => (
        <div key={ki} style={{ padding: "14px 18px", borderRight: ki < 3 ? `1px solid ${T.border}` : "none", background: T.white }}>
          <div style={{ fontSize: 9, color: T.secondary, letterSpacing: "0.1em", marginBottom: 5 }}>{kpi.label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: kpi.color, fontFamily: "'Georgia',serif", marginBottom: 1 }}>{kpi.value}</div>
          {kpi.sub && <div style={{ fontSize: 10, color: T.secondary }}>{kpi.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Sticky Section Nav ───────────────────────────────────────────────────
function SectionNav() {
  const navSections = [
    { id: "sec-project-overview", label: "Overview" },
    { id: "sec-development-opportunity", label: "Opportunity" },
    { id: "sec-zone-alerts", label: "Alerts" },
    { id: "sec-regulations", label: "Standards" },
    { id: "sec-permitting", label: "Permits" },
    { id: "sec-parcel-survey", label: "Survey" },
  ];
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 100, background: T.cream, padding: "8px 0" }} className="no-print">
      <div className="section-nav-bar" style={{ display: "flex", gap: 4, background: T.white, borderRadius: 10, padding: 4, border: `1px solid ${T.border}` }}>
        {navSections.map(s => (
          <a key={s.id} href={"#" + s.id}
            style={{ flex: 1, padding: "8px 4px", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", textDecoration: "none", textAlign: "center", background: "transparent", color: T.secondary, transition: "all 0.2s", fontFamily: "'DM Sans',sans-serif" }}
            onMouseEnter={e => { e.target.style.background = T.orange; e.target.style.color = T.white }}
            onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = T.secondary }}>
            {s.label}
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Acronym Legend ────────────────────────────────────────────────────────
function AcronymLegend({ jurisdiction }) {
  const [open, setOpen] = useState(false);
  const terms = [
    ["APN", "Assessor Parcel Number — unique parcel ID from LA County Assessor"],
    ["OTC", "Over the Counter — permit issued same day, no plan check required"],
    ["FAR", "Floor Area Ratio — max buildable sq ft as a multiple of lot's buildable area"],
    ["FHSZ", "Fire Hazard Severity Zone — fire risk classification affecting materials and clearance requirements"],
    ["RSO", "Rent Stabilization Ordinance — LA city law protecting tenants in pre-1978 multi-unit buildings"],
    ["HPOZ", "Historic Preservation Overlay Zone — requires design review for exterior changes"],
    ["TOC", "Transit Oriented Communities — density bonus program for sites near transit (Tiers 1–4)"],
    ["JADU", "Junior Accessory Dwelling Unit — up to 500 sf ADU created within existing structure"],
    ["LAMC", "Los Angeles Municipal Code — city building and zoning rules"],
    ["CBC", "California Building Code — state-level construction standards"],
    ["LADBS", "LA Department of Building and Safety — main permit agency for City of LA"],
    ["BOE", "Bureau of Engineering — issues grading permits in Special Grading Areas"],
    ["HCR", "Hillside Construction Regulation — stricter rules for lots in hillside areas"],
    ["CCC", "California Coastal Commission — state agency that reviews development in the Coastal Zone"],
    ["CDP", "Coastal Development Permit — required from CCC or local agency for coastal zone projects"],
    ["VMT", "Vehicle Miles Traveled — AB 2334 Very Low VMT areas reduce or eliminate parking minimums"],
  ];
  const sources = [
    ["ZIMAS", "zimas.lacity.org", "https://zimas.lacity.org"],
    ["LAMC", "library.municode.com/ca/los_angeles", "https://library.municode.com/ca/los_angeles"],
    [jurisdiction?.agency || "LADBS", jurisdiction?.agencyUrl || "https://ladbs.org", jurisdiction?.agencyUrl || "https://ladbs.org"],
  ];
  return (
    <div style={{ margin:0 }}>
      <button onClick={() => setOpen(!open)} style={{
        width:"100%", background:"#ffffff10", border:"none", padding:"10px 16px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        cursor:"pointer", fontFamily:"'DM Sans',sans-serif", borderRadius:6 }}>
        <span style={{ fontSize:11, fontWeight:700, color:"#D6D3D1", fontFamily:"monospace",
          letterSpacing:"0.1em" }}>TERMS & DATA SOURCES</span>
        <span style={{ fontSize:11, color:"#A8A29E" }}>{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {open && (
        <div style={{ padding:"16px 0 0" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 24px", marginBottom:16 }}>
            {terms.map(([term, def]) => (
              <div key={term} style={{ display:"flex", gap:8, padding:"5px 0",
                borderBottom:"1px solid #ffffff10", alignItems:"flex-start" }}>
                <span style={{ fontSize:10, fontWeight:700, color:T.orange,
                  fontFamily:"monospace", minWidth:50, flexShrink:0, paddingTop:1 }}>{term}</span>
                <span style={{ fontSize:11, color:"#D6D3D1", lineHeight:1.5 }}>{def}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:"#A8A29E", fontFamily:"monospace",
            letterSpacing:"0.08em", marginBottom:6 }}>DATA SOURCES</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {sources.map(([label, url, href]) => (
              <a key={label} href={href} target="_blank" style={{
                fontSize:11, color:T.gold, textDecoration:"none",
                border:"1px solid #ffffff20", borderRadius:4, padding:"3px 8px",
                fontFamily:"'DM Sans',sans-serif" }}>
                {label} · {url}
              </a>
            ))}
          </div>
          <div style={{ fontSize:10, color:T.secondary, marginTop:12, lineHeight:1.6,
            fontStyle:"italic" }}>
            All data sourced from publicly available LA City and County records.
            Always verify directly with the relevant agency before making project decisions.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function Listo() {
  const [address, setAddress]       = useState("");
  const [projectType, setProjectType] = useState("");
  const [details, setDetails]       = useState("");
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [stage, setStage]           = useState("input");
  const [parsed, setParsed]         = useState(null);
  const [editZip, setEditZip]       = useState("");
  const [zipDetecting, setZipDetecting] = useState(false);
  const [editStreet, setEditStreet] = useState("");
  const [jurisdiction, setJurisdiction] = useState(null);
  const [result, setResult]         = useState(null);
  const [parcel, setParcel]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError]           = useState(null);
  const [fbState, setFbState]       = useState(null);
  const [fbComment, setFbComment]   = useState("");
  const [fbDone, setFbDone]         = useState(false);
  const [fbOpen, setFbOpen]         = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    (function(c,a,r){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    const s=document.createElement("script");s.async=1;s.src=r;
    s.onload = () => console.log("[POSTHOG] Script loaded");
    s.onerror = () => console.log("[POSTHOG] Script blocked — ad blocker or network issue");
    document.head.appendChild(s);
    })(window,"posthog","https://us-assets.i.posthog.com/static/array.js");
    window.posthog("init", POSTHOG_KEY, { api_host:"https://us.i.posthog.com", person_profiles:"always" });
    track("page_view");
  }, []);

  // Update jurisdiction when ZIP changes
  useEffect(() => {
    const zip = editZip || parsed?.zip || "";
    if (zip.length === 5) setJurisdiction(detectJurisdiction(zip));
    else setJurisdiction(null);
  }, [editZip, parsed?.zip]);

  const handleGeocode = async () => {
    if (!address.trim() || !projectType) return;
    const p = parseAddress(address);
    setParsed(p);
    setEditStreet(p.displayName);
    track("address_submitted", { zip:p.zip, project_type:projectType });
    setStage("confirm");

    if (p.zip) {
      setEditZip(p.zip);
    } else {
      setEditZip("");
      setZipDetecting(true);
      try {
        const geo = await geocodeAddress(address);
        if (geo?.zip && geo.zip.length === 5) {
          setEditZip(geo.zip);
        }
      } catch (e) { DEBUG && console.log("[GEOCODE] Background geocode failed:", e.message); }
      setZipDetecting(false);
    }
  };

  const LOADING_STEPS = [
    "Geocoding address...",
    "Querying ZIMAS zoning...",
    "Checking overlay zones...",
    "Scanning coastal & seismic data...",
    "Generating permit analysis...",
  ];

  // Data API — change to "https://api.listo.zone" after setting up Cloudflare custom domain
  const WORKER_URL = "https://zimas-proxy.listo.workers.dev";

  const geocodeAddress = async (addr) => {
    try {
      const r = await fetch(WORKER_URL + "/geocode?address=" + encodeURIComponent(addr),
        { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const d = await r.json();
        if (d && !d.error) return d;
      }
    } catch (_) {}
    return null;
  };

  const queryParcelData = async (lng, lat) => {
    const parcel = { source: "ZIMAS", hasData: false, overlayLayers: [] };
    const userAddr = editStreet || address || "";
    const houseNo = userAddr.match(/^(\d+)/)?.[1] || "";
    const streetPart = userAddr.replace(/^\d+\s*/, "").replace(/,.*/, "")
      .replace(/\b(ave|avenue|st|street|blvd|boulevard|dr|drive|rd|road|ct|court|pl|place|way|ln|lane|cir|circle)\b.*/i, "").trim();

    try {
      const params = new URLSearchParams({ lat, lng, houseNumber: houseNo, streetName: streetPart });
      const r = await fetch(WORKER_URL + "/parcel?" + params, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) { DEBUG && console.log("[DATA] Worker returned", r.status); return parcel; }
      const d = await r.json();
      DEBUG && console.log("[DATA] Worker response:", JSON.stringify(d).slice(0, 300));
      if (d._timing) DEBUG && console.log("[DATA] Timing:", d._timing);

      // ── Map Assessor data ──────────────────────────────────────────
      if (d.parcel) {
        const p = d.parcel;
        parcel.hasData = true;
        if (p.apn) { parcel.apn = p.apn; }
        if (p.address) { parcel.situsAddr = p.address; }
        if (p.city) { parcel.situsCity = p.city; }
        if (p.zip) { parcel.situsZip = p.zip; }
        if (p.useCode) { parcel.useCode = p.useCode; }
        if (p.useDescription) { parcel.useDescription = p.useDescription; }
        if (p.agency) { parcel.agencyName = p.agency; }
        if (p.lotSizeSf) { parcel.lotSizeSf = p.lotSizeSf; parcel.lotSizeSource = "LA County Assessor"; }
        if (p.lotWidthFt) { parcel.lotWidthFt = p.lotWidthFt; parcel.lotDepthFt = p.lotDepthFt; parcel.lotDimsSource = "estimated from parcel geometry"; }
      }

      // ── Map CGS seismic data ───────────────────────────────────────
      if (d.seismic) {
        parcel.liquefaction = d.seismic.liquefaction || false;
        parcel.liquefactionSource = "CGS (verified)";
        parcel.landslide = d.seismic.landslide || false;
        parcel.landslideSource = "CGS (verified)";
        if (d.seismic.faultZone) { parcel.faultZone = true; }
        if (d.seismic.faultName) { parcel.faultName = d.seismic.faultName; parcel.faultSource = "CGS (verified)"; }
      }

      // ── Map ZIMAS internal API data ────────────────────────────────
      const zd = d.zimas;
      if (zd) {
        // Validate address match
        const zimasHouseNo = (zd.address || "").match(/^(\d+)/)?.[1] || "";
        if (zimasHouseNo && houseNo && zimasHouseNo !== houseNo) {
          DEBUG && console.log("[DATA] ZIMAS address mismatch:", zd.address, "vs", houseNo);
          parcel.zimasAddressMismatch = true;
        } else {
          // Merge ZIMAS data — authoritative
          if (zd.apn) { parcel.apn = zd.apn; parcel.apnSource = "ZIMAS (verified)"; }
          if (zd.zoning) { parcel.zoning = zd.zoning; parcel.zoningSource = "ZIMAS (verified)"; }
          if (zd.lotAreaSf) { parcel.lotSizeSf = zd.lotAreaSf; parcel.lotSizeSource = "ZIMAS (verified)"; }
          if (zd.yearBuilt) { parcel.yearBuilt = zd.yearBuilt; }
          if (zd.existingUnits) { parcel.existingUnits = zd.existingUnits; }
          if (zd.existingSqft) { parcel.existingBuildingSqft = zd.existingSqft; }
          if (zd.existingBedrooms) { parcel.existingBedrooms = zd.existingBedrooms; }
          if (zd.existingBathrooms) { parcel.existingBathrooms = zd.existingBathrooms; }
          if (zd.toc) { parcel.toc = zd.toc; } else { parcel.toc = "None"; parcel.tocVerified = true; }
          if (zd.rso !== null) { parcel.rso = zd.rso; }
          if (zd.jco !== null) { parcel.jco = zd.jco; }
          if (zd.heReplacement !== null) { parcel.heReplacement = zd.heReplacement; }
          if (zd.generalPlan) { parcel.generalPlanLandUse = zd.generalPlan; }
          if (zd.communityPlan) { parcel.communityPlan = zd.communityPlan; }
          if (zd.specificPlans?.length) { parcel.specificPlans = zd.specificPlans; parcel.specificPlan = zd.specificPlans.join(", "); }
          else { parcel.specificPlan = "None"; parcel.specificPlanVerified = true; }
          if (zd.ziCodes?.length) { parcel.ziCodes = zd.ziCodes; }
          if (zd.ab2097 !== null) { parcel.ab2097 = zd.ab2097; }
          if (zd.ab2334 !== null) { parcel.ab2334 = zd.ab2334; }
          if (zd.hpoz !== undefined && zd.hpoz !== null) { parcel.hpoz = zd.hpoz; }
          if (zd.cdo !== undefined && zd.cdo !== null) { parcel.cdo = zd.cdo; }
          if (zd.prelimFaultRupture !== undefined && zd.prelimFaultRupture !== null) { parcel.prelimFaultRupture = zd.prelimFaultRupture; }
          if (zd.liquefaction !== null) { parcel.liquefaction = zd.liquefaction; parcel.liquefactionSource = "ZIMAS (verified)"; }
          if (zd.landslide !== null) { parcel.landslide = zd.landslide; parcel.landslideSource = "ZIMAS (verified)"; }
          if (zd.tsunami !== null) { parcel.tsunami = zd.tsunami; }
          if (zd.seaLevelRise !== null) { parcel.seaLevelRise = zd.seaLevelRise; }
          if (zd.fireHazard !== null) { parcel.fireHazard = zd.fireHazard; }
          if (zd.floodZone) { parcel.floodZone = zd.floodZone; }
          parcel.methane = zd.methane || false;
          parcel.airportHazard = zd.airportHazard || false;
          if (zd.specialGrading !== null) { parcel.specialGrading = zd.specialGrading; }
          if (zd.faultName) { parcel.faultName = zd.faultName; parcel.faultDistKm = zd.faultDistKm; }
          if (zd.alquistPriolo !== null) { parcel.alquistPriolo = zd.alquistPriolo; }
          if (zd.coastalZones?.length) { parcel.coastalZone = "Yes"; parcel.coastalZoneType = zd.coastalZones.join(", "); }
          if (zd.hillside !== null) { parcel.hillside = zd.hillside; }
          if (zd.useCode) { parcel.useDescription = zd.useCode; }
          if (zd.address) { parcel.zimasAddress = zd.address; }
          parcel.source = "ZIMAS";
        }
      }

      // Defaults for missing hazard fields
      if (parcel.liquefaction === undefined) parcel.liquefaction = false;
      if (parcel.landslide === undefined) parcel.landslide = false;
      if (parcel.tsunami === undefined) parcel.tsunami = false;
      if (parcel.alquistPriolo === undefined) parcel.alquistPriolo = false;
      if (parcel.hillside === undefined) parcel.hillside = false;
      if (parcel.specialGrading === undefined) parcel.specialGrading = false;
      if (parcel.fireHazard === undefined) parcel.fireHazard = false;
      if (parcel.seaLevelRise === undefined) parcel.seaLevelRise = false;

      // Zone-aware density
      if (parcel.lotSizeSf > 0) {
        const z2 = (parcel.zoning || "").toUpperCase();
        if (/^R1|^RS|^RE/.test(z2)) { parcel.unitsByRight = 1; parcel.densityCalc = "1 unit per lot (R1 zone)"; }
        else if (/^RD/.test(z2)) { parcel.unitsByRight = 2; parcel.densityCalc = "2 units per lot (RD zone)"; }
        else if (/^R4/.test(z2)) { parcel.unitsByRight = Math.floor(parcel.lotSizeSf / 400); parcel.densityCalc = parcel.lotSizeSf.toLocaleString() + " sf / 400 = " + parcel.unitsByRight + " units"; }
        else if (/^R5/.test(z2)) { parcel.unitsByRight = null; parcel.densityCalc = "No density limit (R5 — FAR controls)"; }
        else { parcel.unitsByRight = Math.floor(parcel.lotSizeSf / 800); parcel.densityCalc = parcel.lotSizeSf.toLocaleString() + " sf / 800 = " + parcel.unitsByRight + " units"; }
      }
    } catch (e) {
      DEBUG && console.log("[DATA] Error:", e.message);
    }

    return parcel;
  };


  // ── Main analysis handler ──────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (jurisdiction && !jurisdiction.covered) return;
    setStage("result");
    setLoading(true);
    setLoadingStep(0);
    setError(null);
    setResult(null);
    setFbState(null); setFbDone(false); setFbOpen(false);
    track("analysis_started", { zip:editZip, project_type:projectType, jurisdiction:jurisdiction?.key });

    let step = 0;
    const nextStep = () => { step++; setLoadingStep(Math.min(step, LOADING_STEPS.length - 1)); };

    try {
      // Step 1: Geocode (browser-side)
      const addr = editStreet || parsed?.displayName || address;
      const geo = await geocodeAddress(addr);
      nextStep();

      if (!geo) {
        setError("Could not locate this address. Check the street name spelling and try including the ZIP code (e.g., '1540 W Wildwood Dr 90041').");
        setLoading(false);
        return;
      }

      // Auto-populate ZIP from geocode if user didn't enter one
      if (!editZip && geo.zip) {
        setEditZip(geo.zip);
      }

      // Step 2-4: Query ZIMAS directly from browser (bypasses Vercel timeout)
      let parcelData = null;
      if (geo.lat && geo.lng) {
        parcelData = await queryParcelData(geo.lng, geo.lat);
        nextStep(); nextStep();
        // Auto-populate ZIP from parcel if still missing
        if (!editZip && parcelData?.situsZip) {
          setEditZip(parcelData.situsZip);
        }
      }

      // Step 5: Send to server for Claude analysis
      nextStep();
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          address: addr,
          projectType: getLabel(projectType),
          projectDetails: details,
          jurisdiction: jurisdiction?.key || "city-of-la",
          geocode: geo,
          parcel: parcelData,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Analysis failed."); return; }
      setResult(data.analysis);
      if (parcelData) setParcel(parcelData);
      track("analysis_completed", { zip:editZip, project_type:projectType, parcel_verified:!!parcelData?.hasData, zoning: parcelData?.zoning || "none" });
    } catch (err) {
      setError("Request failed: " + err.message);
      track("analysis_error", { error:err.message });
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (vote, comment="") => {
    setFbDone(true); setFbOpen(false);
    track("feedback_submitted", { vote, zip:editZip, project_type:projectType });
    try {
      await fetch("/api/feedback", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          address: editStreet||address, projectType: getLabel(projectType),
          feedback: comment||(vote==="up"?"Accurate":"Flagged as inaccurate"),
          rating: vote==="up"?5:2,
        }),
      });
    } catch(_) {}
  };

  const handlePrint = () => {
    if (!result) return;
    const label = getLabel(projectType);
    const now = new Date();
    const date = now.toLocaleDateString("en-US", { year:"numeric",month:"long",day:"numeric" });
    const dateSlug = now.toISOString().slice(0,10);
    const addrSlug = (editStreet||address).replace(/[^a-zA-Z0-9]+/g,"-").slice(0,40);

    // Build parcel survey cards HTML
    let parcelHtml = "";
    if (parcel?.hasData) {
      const vBadge = (val) => val !== undefined && val !== null
        ? `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:3px;background:${T.green}18;color:${T.green}">✓ ZIMAS</span>`
        : `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:3px;background:#FEF3C7;color:#92400E;font-family:monospace">NOT VERIFIED</span>`;
      const pRow = (label, val) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #F3F4F6;font-size:11px"><span>${label}</span><span style="font-weight:600">${val !== null && val !== undefined ? val + " " + vBadge(val) : vBadge(null)}</span></div>`;
      const flagBadge = (val, flagged) => val ? `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:3px;background:${flagged?"#FEE2E2;color:#991B1B":"#D1FAE5;color:#065F46"};font-family:monospace">${typeof val === "string" ? val : "YES"}</span>` : `<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:3px;background:#F3F4F6;color:#78716C;font-family:monospace">NO</span>`;
      const hRow = (label, val, flagged) => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #F3F4F6;font-size:11px"><span>${label}</span>${val !== undefined && val !== null ? flagBadge(val, flagged) : vBadge(null)}</div>`;

      parcelHtml = `
        <div style="border:1px solid #E5E7EB;border-left:4px solid ${T.orange};border-radius:8px;margin:8px 0;overflow:hidden">
          <div style="padding:8px 14px;background:#FAFAFA;border-bottom:1px solid #F3F4F6;font-size:10px;font-weight:700;color:${T.orange};text-transform:uppercase;letter-spacing:0.08em;font-family:monospace">PARCEL IDENTIFICATION</div>
          <div style="padding:6px 14px">
            ${pRow("Address", parcel.situsAddr || null)}
            ${pRow("APN", parcel.apn || null)}
            ${pRow("Zoning", parcel.zoning || null)}
            ${pRow("Lot Size", parcel.lotSizeSf ? parcel.lotSizeSf.toLocaleString() + " sf" : null)}
            ${pRow("Year Built", parcel.yearBuilt || null)}
            ${pRow("Existing Building", parcel.existingBuildingSqft ? parcel.existingBuildingSqft + " sf" : null)}
            ${pRow("Units", parcel.existingUnits || null)}
            ${pRow("Use Code", parcel.useDescription || parcel.useCode || null)}
          </div>
        </div>
        ${parcel.lotSizeSf > 0 ? `<div style="background:#1A1714;border-radius:8px;padding:10px 16px;margin:8px 0;display:flex;justify-content:space-between;align-items:center">
          <div><div style="font-size:9px;color:${T.orange};font-family:monospace;letter-spacing:0.1em">DENSITY</div><div style="font-size:14px;font-weight:700;color:white;font-family:Georgia,serif">${parcel.lotSizeSf.toLocaleString()} sf ÷ 800 = ${Math.floor(parcel.lotSizeSf/800)} units by-right</div></div>
          ${parcel.toc ? `<div style="background:${T.orange}20;border:1px solid ${T.orange}40;border-radius:4px;padding:3px 8px"><div style="font-size:8px;color:${T.orange};font-family:monospace">TOC</div><div style="font-size:12px;font-weight:700;color:${T.orange}">${parcel.toc}</div></div>` : ""}
        </div>` : ""}
        <div style="border:1px solid #E5E7EB;border-left:4px solid #B91C1C;border-radius:8px;margin:8px 0;overflow:hidden">
          <div style="padding:8px 14px;background:#FAFAFA;border-bottom:1px solid #F3F4F6;font-size:10px;font-weight:700;color:#B91C1C;text-transform:uppercase;letter-spacing:0.08em;font-family:monospace">HAZARDS & ENVIRONMENTAL</div>
          <div style="padding:6px 14px;display:grid;grid-template-columns:1fr 1fr;gap:0 14px">
            ${hRow("Coastal Zone", parcel.coastalZone === "Yes" ? (parcel.coastalZoneType || "Yes") : parcel.coastalZone === "No" ? false : null, parcel.coastalZone === "Yes")}
            ${hRow("Fire Hazard Zone", parcel.fireHazard, false)}
            ${hRow("Liquefaction", parcel.liquefaction, parcel.liquefaction === true)}
            ${hRow("Landslide", parcel.landslide, parcel.landslide === true)}
            ${hRow("Hillside Area", parcel.hillside, false)}
            ${hRow("Special Grading", parcel.specialGrading, false)}
            ${hRow("Sea Level Rise", parcel.seaLevelRise, parcel.seaLevelRise === true)}
            ${hRow("Tsunami Hazard", parcel.tsunami, parcel.tsunami === true)}
            ${hRow("Flood Zone", parcel.floodZone ? parcel.floodZone : parcel.floodZone === undefined ? null : false, false)}
            ${hRow("Methane Hazard", parcel.methane === false ? false : parcel.methane || null, !!parcel.methane && parcel.methane !== false)}
            ${hRow("Airport Hazard", parcel.airportHazard === false ? false : parcel.airportHazard || null, !!parcel.airportHazard && parcel.airportHazard !== false)}
          </div>
        </div>
        <div style="border:1px solid #E5E7EB;border-left:4px solid #78716C;border-radius:8px;margin:8px 0;overflow:hidden">
          <div style="padding:8px 14px;background:#FAFAFA;border-bottom:1px solid #F3F4F6;font-size:10px;font-weight:700;color:#78716C;text-transform:uppercase;letter-spacing:0.08em;font-family:monospace">PLANNING & ZONING</div>
          <div style="padding:6px 14px">
            ${pRow("Specific Plan", parcel.specificPlan || null)}
            ${pRow("HPOZ", parcel.hpoz === true ? "Yes" : parcel.hpoz === false ? "No" : null)}
            ${pRow("General Plan", parcel.generalPlanLandUse || null)}
            ${pRow("Community Plan", parcel.communityPlan || null)}
            ${parcel.ziCodes?.length ? '<div style="margin-top:6px"><div style="font-size:9px;color:#78716C;font-family:monospace;margin-bottom:3px">ZONING INFORMATION (' + parcel.ziCodes.length + ')</div>' + parcel.ziCodes.map(zi => '<div style="font-size:9px;color:#E8620A;background:#E8620A15;border:1px solid #E8620A40;border-radius:3px;padding:2px 6px;margin:2px 0">' + zi + '</div>').join('') + '</div>' : ''}
          </div>
        </div>
        <div style="border:1px solid #E5E7EB;border-left:4px solid #E8620A;border-radius:8px;margin:8px 0;overflow:hidden">
          <div style="padding:8px 14px;background:#FAFAFA;border-bottom:1px solid #F3F4F6;font-size:10px;font-weight:700;color:#E8620A;text-transform:uppercase;letter-spacing:0.08em;font-family:monospace">HOUSING</div>
          <div style="padding:6px 14px">
            ${hRow("RSO", parcel.rso !== undefined ? (parcel.rso ? "Yes" : "No") : null, false)}
            ${hRow("TOC", parcel.toc || null, false)}
            ${hRow("HE Replacement Required", parcel.heReplacement !== undefined ? (parcel.heReplacement ? "Yes" : "No") : null, parcel.heReplacement === true)}
            ${hRow("Just Cause Eviction (JCO)", parcel.jco !== undefined ? (parcel.jco ? "Yes" : "No") : null, false)}
          </div>
        </div>`;
    }

    // Build report body from Claude's markdown
    const lines = result.split("\n");
    let bodyHtml = "", pdfSec = "", pdfSubsec = "";
    const inPdfSec = (s) => pdfSec.includes(s) || pdfSubsec.includes(s);
    for (const raw of lines) {
      const t = raw.trim().replace(/\*\*/g, ""); // strip bold markers
      if (!t) { bodyHtml += "<br>"; continue; }
      if (t.startsWith("## ")) {
        pdfSec = t.slice(3).toLowerCase();
        pdfSubsec = "";
        bodyHtml += `<h2>${pdfSec.toUpperCase()}</h2>`;
        // Insert parcel cards after Parcel Survey header
        if (pdfSec.includes("parcel survey") && parcelHtml) {
          bodyHtml += parcelHtml;
          continue;
        }
        continue;
      }
      // Skip Claude's parcel survey text (replaced by cards above)
      if (pdfSec.includes("parcel survey")) continue;
      if (t.startsWith("### ")) { pdfSubsec = t.slice(4).toLowerCase(); bodyHtml += `<h3>${t.slice(4)}</h3>`; continue; }
      if (t.startsWith("#### ")) { bodyHtml += `<div style="font-size:10px;font-weight:700;color:${T.orange};text-transform:uppercase;letter-spacing:0.05em;margin:10px 0 4px;font-family:monospace">${t.slice(5)}</div>`; continue; }
      if (t.startsWith("VERDICT:")) {
        const pts = t.slice(8).trim().split("|");
        const w=(pts[0]||"").trim(), d=(pts[1]||"").trim();
        const c=w==="GO"?T.green:w==="COMPLEX"?T.red:T.yellow;
        bodyHtml += `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${c}15;border:2px solid ${c};border-radius:8px;margin:8px 0"><span style="font-size:10px;font-weight:800;color:#fff;background:${c};border-radius:4px;padding:2px 10px">${w}</span><span style="font-size:12px;color:#44403C">${d}</span></div>`;
        continue;
      }
      // Zone Alerts with ACTION REQUIRED/CAUTION/NOTE
      if (t.includes("|") && /^(REQUIRED|ACTION REQUIRED|CRITICAL|FACTOR|CAUTION|BENEFIT|NOTE|INFO|CLEAR)\s*\|/.test(t)) {
        const pts=t.split("|").map(p=>p.trim());
        const [sev,name2,dollar,time]=pts;
        const levelMap2={"REQUIRED":"red","ACTION REQUIRED":"red","CRITICAL":"red","FACTOR":"yellow","CAUTION":"yellow","BENEFIT":"green","NOTE":"green","INFO":"green","CLEAR":"green"};
        const lv=levelMap2[sev]||"green";
        const displayLabel = lv === "red" ? "REQUIRED" : lv === "yellow" ? "FACTOR" : "BENEFIT";
        const cs={"REQUIRED":["#FEF2F2","#b91c1c"],"ACTION REQUIRED":["#FEF2F2","#b91c1c"],CRITICAL:["#FEF2F2","#b91c1c"],"FACTOR":["#FFFBEB","#b45309"],CAUTION:["#FFFBEB","#b45309"],"BENEFIT":["#F0FDF4","#15803d"],NOTE:["#F0FDF4","#15803d"],INFO:["#F0FDF4","#15803d"],CLEAR:["#F0FDF4","#15803d"]};
        const [bg,bc]=cs[sev]||["#F9FAFB","#78716C"];
        bodyHtml += `<div style="padding:8px 12px;margin:6px 0;border-radius:6px;border-left:3px solid ${bc};background:${bg}"><span style="font-size:9px;font-weight:800;color:#fff;background:${bc};border-radius:3px;padding:1px 6px;margin-right:8px">${displayLabel}</span><strong>${name2||""}</strong>${dollar?` <span style="color:#78716C;font-size:11px">· ${dollar}</span>`:""}${time?` <span style="color:#78716C;font-size:11px">· ${time}</span>`:""}</div>`;
        continue;
      }
      // KPI lines
      const KPI = ["ZONING:","UNITS:","PERMITS:","ALERTS:","DATA:"];
      const kpi = KPI.find(k => t.startsWith(k));
      if (kpi && pdfSec.includes("project overview")) {
        const kLabel = kpi.slice(0,-1), val = t.slice(kpi.length).trim();
        bodyHtml += `<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid #E2D9D0;font-size:12px"><span style="font-size:10px;font-weight:700;color:#78716C;text-transform:uppercase;letter-spacing:0.08em;min-width:70px;font-family:monospace">${kLabel}</span><span style="color:#44403C">${val}</span></div>`;
        continue;
      }
      // Development Standards table rows — render as structured table
      if (inPdfSec("development standard") && t.includes("|") && t.split("|").length >= 3) {
        const pts = t.split("|").map(p => p.trim());
        if (/standard|max allowed/i.test(pts[0])) {
          bodyHtml += `<div style="display:flex;gap:4px;padding:6px 0;border-bottom:2px solid ${T.orange}30;font-size:9px;font-weight:700;color:#78716C;font-family:monospace;text-transform:uppercase;letter-spacing:0.05em"><span style="flex:2">${pts[0]}</span><span style="flex:2">${pts[1]||""}</span><span style="flex:1">${pts[2]||""}</span><span style="flex:1;text-align:right">${pts[3]||""}</span></div>`;
        } else {
          bodyHtml += `<div style="display:flex;gap:4px;padding:5px 0;border-bottom:1px solid #E2D9D0;font-size:12px"><span style="flex:2;font-weight:600;color:#1A1714">${pts[0]}</span><span style="flex:2;color:#44403C">${pts[1]||""}</span><span style="flex:1;color:#78716C">${pts[2]||""}</span><span style="flex:1;color:#78716C;text-align:right;font-size:11px">${pts[3]||""}</span></div>`;
        }
        continue;
      }
      // Fee Summary rows — render consistently
      if (inPdfSec("fee") && t.includes("|")) {
        const pts = t.split("|").map(p => p.trim());
        const isTotal = (pts[0]||"").toUpperCase().includes("TOTAL");
        if (isTotal) {
          bodyHtml += `<div style="display:flex;gap:8px;padding:8px 0;border-top:2px solid ${T.orange};margin-top:4px;font-weight:700;font-size:13px"><span style="flex:1;color:${T.orange}">${pts[0]}</span><span style="color:${T.orange}">${pts[1]||""} ${pts[2]||""}</span></div>`;
        } else {
          bodyHtml += `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #E2D9D0;font-size:12px"><span style="flex:1;font-weight:600">${pts[0]}</span><span style="color:#78716C;min-width:100px">${pts[1]||""}</span><span style="color:#1A1714;font-weight:600">${pts[2]||""}</span></div>`;
        }
        continue;
      }
      if (t.includes("|") && t.split("|").length >= 3 && !inPdfSec("terms")) {
        const pts=t.split("|").map(p=>p.trim());
        if (pts.length>=4){
          const [pn,pt2,pa,pti,pc]=pts;
          const tc=pt2==="OTC"?T.green:T.orange;
          bodyHtml+=`<div style="padding:7px 12px;margin:3px 0;background:#F9FAFB;border-radius:5px;display:flex;align-items:center;gap:8px;font-size:12px"><span style="font-weight:600;color:#1A1714;flex:1">${pn}</span><span style="font-size:9px;font-weight:700;color:#fff;background:${tc};border-radius:3px;padding:1px 6px">${pt2}</span><span style="color:#78716C">${pa||""} ${pti||""}</span>${pc?`<span style="color:${T.orange};font-weight:600">${pc}</span>`:""}</div>`;
          continue;
        }
        const [dn,dw,ds]=pts;
        const isT=(dn||"").toUpperCase().includes("TOTAL");
        const req=ds&&ds.toUpperCase().includes("YES");
        if(ds&&(ds.toUpperCase().includes("YES")||ds.toUpperCase().includes("NO")||ds.toUpperCase().includes("REQ"))){
          bodyHtml+=`<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #E2D9D0;font-size:12px"><span style="color:#1A1714;flex:1">${dn}</span><span style="color:#78716C;min-width:120px">${dw}</span><span style="font-size:9px;font-weight:700;color:#fff;background:${req?"#b91c1c":"#15803d"};border-radius:3px;padding:1px 6px">STAMP:${req?" REQ":" NOT REQ"}</span></div>`;
        } else {
          bodyHtml+=`<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid ${isT?T.orange:"#E2D9D0"};font-size:12px${isT?";font-weight:700;color:"+T.orange:""}"><span style="flex:1">${dn}</span>${dw&&!isT?`<span style="color:#78716C;min-width:100px">${dw}</span>`:""}<span>${ds||""}</span></div>`;
        }
        continue;
      }
      if (/^EXEMPTION:/i.test(t)){const rest=t.slice(10).trim();const pts=rest.split("|").map(p=>p.trim());bodyHtml+=`<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #E2D9D0;font-size:12px"><span style="font-size:9px;font-weight:700;color:#fff;background:${T.orange};border-radius:3px;padding:1px 6px;margin-top:1px">EXEMPT</span><span style="flex:1">${pts[0]||""}</span><span style="color:${T.orange};font-weight:600">${pts[1]||""}</span><span style="color:#78716C;font-size:11px">${pts[2]||""}</span></div>`;continue;}
      if (/^(ENCROACHMENT|GRADING:|BASEMENT:|FIRE SPRINKLERS:|OFFSET PLAN|SWIMMING POOL:|PARKING STALLS:)/i.test(t)){const ci=t.indexOf(":");const lbl=t.slice(0,ci).trim();bodyHtml+=`<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #E2D9D0;font-size:12px"><span style="font-size:9px;font-weight:700;color:#78716C;font-family:monospace;min-width:120px;padding-top:1px">${lbl}</span><span style="color:#44403C">${t.slice(ci+1).trim()}</span></div>`;continue;}
      if (/^CRITICAL PATH:/i.test(t)){bodyHtml+=`<div style="padding:8px 12px;background:#E8620A15;border:1px solid #E8620A40;border-radius:6px;margin:8px 0;display:flex;gap:8px;align-items:center"><span style="font-size:10px;font-weight:700;color:#E8620A;font-family:monospace">CRITICAL PATH</span><span style="font-size:13px;color:#E8620A">${t.slice(14).trim()}</span></div>`;continue;}
      if (/^(DENSITY MATH|TOC|MAX BUILDOUT|EXISTING|BEST CASE|WORST CASE)/i.test(t)){const ci=t.indexOf(":")||t.indexOf(" ");const lbl=t.slice(0,ci).trim();const val=t.slice(ci+1).trim();bodyHtml+=`<div style="padding:6px 12px;margin:4px 0;background:#F9FAFB;border-radius:6px;border-left:3px solid ${T.orange}"><span style="font-size:9px;font-weight:700;color:${T.orange};font-family:monospace;margin-right:8px">${lbl}</span><span style="font-size:13px;color:#1A1714;font-weight:600">${val}</span></div>`;continue;}
      if (/^Weeks?\s[\d\-–]+:/i.test(t)){const ci=t.indexOf(":");bodyHtml+=`<div style="display:flex;gap:12px;padding:5px 0;border-bottom:1px solid #E2D9D0;font-size:12px"><span style="font-weight:700;color:${T.orange};min-width:80px;font-size:11px;font-family:monospace">${t.slice(0,ci)}</span><span style="color:#44403C">${t.slice(ci+1).trim()}</span></div>`;continue;}
      if (/^\d+\./.test(t)){const rest2=t.replace(/^\d+\.\s*/,"");const pi=rest2.indexOf("|");const act=pi>0?rest2.slice(0,pi).trim():rest2;const me=pi>0?rest2.slice(pi+1).trim():"";const n2=(t.match(/^\d+/)||[""])[0];bodyHtml+=`<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #E2D9D0;align-items:flex-start"><span style="font-size:10px;font-weight:800;color:#fff;background:${T.orange};border-radius:4px;padding:2px 6px;white-space:nowrap;margin-top:1px">${n2}</span><div><strong style="font-size:12px">${act}</strong>${me?`<span style="display:block;font-size:11px;color:#78716C;margin-top:2px">${me}</span>`:""}</div></div>`;continue;}
      if (t.startsWith("- ")||t.startsWith("* ")){bodyHtml+=`<li style="font-size:12px;color:#44403C;margin:3px 0">${t.slice(2)}</li>`;continue;}
      if (t==="DEMO"||t==="BUILDING"||t.startsWith("TECHNICAL")||t==="**DEMO**"||t==="**BUILDING**"||t.startsWith("**TECHNICAL")){const cleanLabel=t.replace(/^\*\*|\*\*$/g,"");bodyHtml+=`<div style="font-size:9px;font-weight:700;color:${T.orange};text-transform:uppercase;letter-spacing:0.1em;margin-top:12px;margin-bottom:4px;font-family:monospace">${cleanLabel}</div>`;continue;}
      // Terms & Data Sources — render acronyms as compact tags, data sources as links
      if (inPdfSec("terms")) {
        if (t.includes("|") && (t.includes(":") || t.includes("("))) {
          const items = t.split("|").map(s => s.trim()).filter(Boolean);
          const isDataSources = t.toLowerCase().startsWith("data source");
          if (isDataSources) {
            bodyHtml += `<div style="font-size:9px;color:#78716C;font-family:monospace;letter-spacing:0.08em;margin:8px 0 4px">DATA SOURCES</div><div style="display:flex;flex-wrap:wrap;gap:4px">`;
            for (const s of items) {
              const urlMatch = s.match(/\(([^)]+)\)/);
              const label = s.replace(/\([^)]+\)/, "").replace(/^data sources?:?\s*/i, "").trim();
              if (label) bodyHtml += `<span style="font-size:9px;color:${T.orange};border:1px solid ${T.orange}30;border-radius:3px;padding:2px 6px">${label}</span>`;
            }
            bodyHtml += `</div>`;
          } else {
            bodyHtml += `<div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">`;
            for (const item of items) {
              const ci = item.indexOf(":");
              if (ci > 0) {
                const abbr = item.slice(0, ci).trim();
                const full = item.slice(ci + 1).trim();
                bodyHtml += `<span style="font-size:9px;padding:2px 6px;background:#F0EBE3;border:1px solid #E2D9D0;border-radius:3px"><strong style="color:${T.orange}">${abbr}</strong> <span style="color:#78716C">${full}</span></span>`;
              } else {
                bodyHtml += `<span style="font-size:9px;padding:2px 6px;background:#F0EBE3;border:1px solid #E2D9D0;border-radius:3px;color:#78716C">${item}</span>`;
              }
            }
            bodyHtml += `</div>`;
          }
          continue;
        }
      }
      bodyHtml+=`<p style="font-size:12px;color:#44403C;margin:4px 0">${t}</p>`;
    }
    const addrLine = editStreet || address;
    const parcelMeta = [label, date, parcel?.hasData ? "ZIMAS verified" : "ZIP estimates", jurisdiction?.short].filter(Boolean).join(" · ");
    const parcelInfo = [parcel?.zoning, parcel?.lotSizeSf ? parcel.lotSizeSf.toLocaleString() + " sf" : null, parcel?.apn ? "APN " + parcel.apn : null].filter(Boolean).join(" · ");
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Listo_${addrSlug}_${dateSlug}</title>
<style>*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:32px;color:#1A1714;font-size:13px;line-height:1.65;counter-reset:page}.header{border-bottom:3px solid ${T.orange};padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}.brand{font-size:20px;font-weight:700;color:#1A1714;font-family:Georgia,serif}.brand span{color:${T.orange}}.meta{font-size:10px;color:#78716C;text-align:right;font-family:monospace}.address-bar{background:${T.orange};color:white;padding:14px 18px;border-radius:8px;margin:12px 0}.addr-main{font-size:16px;font-weight:700;font-family:Georgia,serif}.addr-sub{font-size:11px;margin-top:3px;opacity:0.8}.addr-info{font-size:11px;margin-top:2px;opacity:0.7}h2{font-size:14px;font-weight:700;color:${T.orange};font-family:Georgia,serif;border-bottom:2px solid ${T.orange}30;padding-bottom:4px;margin:22px 0 10px;text-transform:uppercase;letter-spacing:0.05em}h3{font-size:12px;font-weight:700;color:#44403C;margin:12px 0 6px;background:#F0EBE3;padding:3px 8px;border-radius:4px}ul{padding-left:18px;margin:6px 0}.footer{margin-top:24px;font-size:10px;color:#A8A29C;text-align:center;border-top:1px solid #E2D9D0;padding-top:12px}.data-src{margin-top:12px;padding:8px 12px;background:#FAF7F2;border-radius:6px;font-size:10px;color:#78716C;text-align:center}@media print{body{padding:20px}h2{page-break-before:auto}@page{margin:20mm;@bottom-right{content:"Page " counter(page);font-size:9px;color:#78716C;font-family:Arial,sans-serif}}}</style>
</head><body>
<div class="header"><div class="brand">listo<span>.</span></div><div class="meta">PERMIT ANALYSIS REPORT<br>${date}</div></div>
<div class="address-bar"><div class="addr-main">${addrLine}</div><div class="addr-sub">${parcelMeta}</div>${parcelInfo ? `<div class="addr-info">${parcelInfo}</div>` : ""}</div>
${bodyHtml}
<div class="data-src">Data sourced from City of Los Angeles ZIMAS (ArcGIS), LA County Assessor, and Census/Nominatim geocoding. Data provided "as is" per ZIMAS terms at zimas.lacity.org.</div>
<div class="footer">listo.zone · Not affiliated with the City of Los Angeles, Santa Monica, Beverly Hills, Malibu, or LADBS</div>
</body></html>`;
    const win=window.open("","_blank","width=900,height=700");
    if(!win){alert("Allow pop-ups to export PDF");return;}
    win.document.write(html);win.document.close();
    setTimeout(()=>{win.focus();win.print();},400);
    track("pdf_exported");
  };

  const [shareToast, setShareToast] = useState(false);

  const handleShare = () => {
    if (!result) return;
    const label = getLabel(projectType);
    const addr = editStreet || address;
    const shareText = `Listo Permit Report\n${addr}\n${label}\n\n${result}\n\n---\nGenerated by listo.zone`;
    navigator.clipboard?.writeText(shareText).then(() => {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
      track("report_shared");
    }).catch(() => {
      // Fallback: open print dialog
      handlePrint();
    });
  };

  const reset = () => {
    setStage("input"); setResult(null); setAddress(""); setProjectType(""); setDetails("");
    setError(null); setParsed(null); setEditZip(""); setEditStreet(""); setParcel(null);
    setJurisdiction(null); setFbState(null); setFbDone(false); setFbOpen(false);
    setShowAllTypes(false);
  };

  const ready = address.trim().length > 5 && projectType !== "";
  // Load DM Sans font dynamically (avoids SSR hydration mismatch)
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.querySelector('link[href*="DM+Sans"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const coverageText = "City of LA · Santa Monica · Beverly Hills · Malibu";

  return (
    <div suppressHydrationWarning style={{ fontFamily:"'Georgia',serif", background:T.warmGray, minHeight:"100vh" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'DM Sans',system-ui,sans-serif}
        ::selection{background:${T.orange};color:${T.white}}
        input:focus,select:focus,textarea:focus{outline:none;border-color:${T.orange}!important}
        .btn-primary{background:${T.orange};color:${T.white};border:none;border-radius:8px;padding:14px 28px;font-size:14px;font-weight:700;cursor:pointer;width:100%;transition:background 0.2s,transform 0.15s;font-family:'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px}
        .btn-primary:hover:not(:disabled){background:${T.orangeL};transform:translateY(-1px)}
        .btn-primary:disabled{opacity:0.4;cursor:not-allowed}
        .chip{padding:5px 14px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid ${T.border};transition:all 0.15s;font-family:'DM Sans',sans-serif;font-weight:500;white-space:nowrap}
        .chip:hover{border-color:${T.orange};color:${T.orange}}
        .chip.active{background:${T.orange};color:${T.white};border-color:${T.orange}}
        input,select,textarea{font-family:'DM Sans',sans-serif}
        select option{font-family:'DM Sans',sans-serif}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        .fade-up{animation:fadeUp 0.35s ease forwards}
        .pulse{animation:pulse 1.4s ease-in-out infinite}
        @media print{.no-print{display:none!important}}
        @media(max-width:640px){
          .hero-kpi-grid{grid-template-columns:1fr 1fr!important}
          .overview-stats-grid{grid-template-columns:1fr 1fr!important}
          .scenario-cards{flex-direction:column!important}
          .survey-grid{grid-template-columns:1fr!important}
          .section-nav-bar{overflow-x:auto;-webkit-overflow-scrolling:touch}
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{ background:T.black, borderBottom:`1px solid #ffffff10`,
        position:"sticky", top:0, zIndex:100 }} className="no-print">
        <div style={{ maxWidth:860, margin:"0 auto", padding:"13px 24px",
          display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div onClick={reset} style={{ cursor:"pointer" }}>
            <Logo size={28} light />
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:11, color:"#A8A29E", fontStyle:"italic",
              fontFamily:"'DM Sans',sans-serif" }}>Know before you build.</span>
            <span style={{ fontSize:10, color:"#78716C", border:"1px solid #ffffff15",
              borderRadius:20, padding:"3px 10px", fontFamily:"monospace" }}>
              {coverageText}
            </span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth:860, margin:"0 auto", padding:"48px 24px 80px" }}>

        {/* ── INPUT ─────────────────────────────────────────────────────── */}
        {stage === "input" && (
          <div className="fade-up">
            {/* Hero — dark */}
            <div style={{ background:T.black, borderRadius:16, padding:"64px 48px 56px",
              marginBottom:32, position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", inset:0,
                background:"radial-gradient(ellipse at 70% 50%, #E8620A12 0%, transparent 70%)" }} />
              <div style={{ position:"relative" }}>
                <div style={{ display:"inline-flex", alignItems:"center", gap:8,
                  background:"#ffffff08", border:"1px solid #ffffff15", borderRadius:20,
                  padding:"4px 14px", marginBottom:20 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:T.gold }} />
                  <span style={{ fontSize:11, color:"#ffffff66", fontFamily:"monospace" }}>
                    NOW LIVE · {coverageText}
                  </span>
                </div>
                <h1 style={{ fontSize:"clamp(38px,6vw,62px)", fontFamily:"'Georgia',serif",
                  color:T.cream, lineHeight:1.1, marginBottom:20, fontWeight:700 }}>
                  Know before<br />you <span style={{ color:T.orange }}>build.</span>
                </h1>
                <p style={{ fontSize:16, color:"#A8A29E", maxWidth:480,
                  lineHeight:1.8, marginBottom:0, fontFamily:"'DM Sans',sans-serif",
                  fontWeight:300 }}>
                  Instant permit intelligence for LA area contractors and investors.
                  Know what's possible, what's required, and what it costs — before you hire anyone.
                </p>
              </div>
            </div>

            {/* Form card — light */}
            <div style={{ background:T.white, border:`1px solid ${T.border}`,
              borderRadius:12, overflow:"hidden", marginBottom:24 }}>
              {/* Form header */}
              <div style={{ background:T.black, padding:"14px 24px",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <Logo size={22} light />
                <span style={{ fontSize:10, color:"#78716C", fontFamily:"monospace" }}>
                  FREE · AI-POWERED
                </span>
              </div>

              <div style={{ padding:28 }}>
                <h2 style={{ fontSize:20, fontFamily:"'Georgia',serif", color:T.black,
                  marginBottom:6, fontWeight:700 }}>Permit Intelligence Report</h2>
                <p style={{ fontSize:13, color:T.secondary, marginBottom:28,
                  fontFamily:"'DM Sans',sans-serif" }}>
                  Enter the project address to get started
                </p>

                {/* Address */}
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:10, color:T.secondary, fontFamily:"monospace",
                    letterSpacing:"0.12em", textTransform:"uppercase",
                    display:"block", marginBottom:8 }}>Property Address</label>
                  <div style={{ border:`2px solid ${address.trim().length > 5 ? T.orange : T.border}`,
                    borderRadius:8, padding:"12px 14px", display:"flex",
                    alignItems:"center", gap:10, background:T.white,
                    transition:"border-color 0.2s" }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                      stroke={T.orange} strokeWidth={2}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <input style={{ flex:1, border:"none", outline:"none",
                      fontSize:14, color:T.text, background:"transparent",
                      fontFamily:"'DM Sans',sans-serif" }}
                      type="text" placeholder="e.g. 5514 Thornburn St, Los Angeles, CA 90045"
                      value={address} onChange={e=>setAddress(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&ready&&handleGeocode()} />
                  </div>
                </div>

                {/* Project type */}
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:10, color:T.secondary, fontFamily:"monospace",
                    letterSpacing:"0.12em", textTransform:"uppercase",
                    display:"block", marginBottom:8 }}>Project Type</label>
                  {/* Quick chips */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                    {QUICK_TYPES.map(t => (
                      <button key={t.value} className={`chip${projectType===t.value?" active":""}`}
                        onClick={() => setProjectType(t.value)}
                        style={{ background:projectType===t.value?T.orange:T.white,
                          color:projectType===t.value?T.white:T.text }}>
                        {t.label}
                      </button>
                    ))}
                    <button className="chip" onClick={() => setShowAllTypes(!showAllTypes)}
                      style={{ background:T.white, color:T.secondary }}>
                      {showAllTypes ? "Less ▲" : "More ▼"}
                    </button>
                  </div>
                  {/* Full dropdown */}
                  {showAllTypes && (
                    <select style={{ width:"100%", border:`1px solid ${T.border}`,
                      borderRadius:8, padding:"11px 14px", fontSize:13,
                      color:projectType?T.text:T.secondary, background:T.white,
                      cursor:"pointer", appearance:"none",
                      backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%238C7B70' d='M5 6L0 0h10z'/%3E%3C/svg%3E")`,
                      backgroundRepeat:"no-repeat", backgroundPosition:"right 14px center" }}
                      value={projectType} onChange={e=>setProjectType(e.target.value)}>
                      <option value="">All project types...</option>
                      {ALL_TYPES.map(g => (
                        <optgroup key={g.group} label={"— " + g.group}>
                          {g.items.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </div>

                {/* Details */}
                <div style={{ marginBottom:24 }}>
                  <label style={{ fontSize:10, color:T.secondary, fontFamily:"monospace",
                    letterSpacing:"0.12em", textTransform:"uppercase",
                    display:"block", marginBottom:8 }}>
                    Additional Details <span style={{ fontWeight:300, textTransform:"none",
                      letterSpacing:0 }}>— optional</span>
                  </label>
                  <textarea style={{ width:"100%", border:`1px solid ${T.border}`,
                    borderRadius:8, padding:"11px 14px", fontSize:13, color:T.text,
                    resize:"vertical", lineHeight:1.6, background:T.white,
                    fontFamily:"'DM Sans',sans-serif" }}
                    rows={2}
                    placeholder="e.g. demolish existing 4-unit and build ground-up multi-family"
                    value={details} onChange={e=>setDetails(e.target.value)} />
                </div>

                <button className="btn-primary" onClick={handleGeocode} disabled={!ready}>
                  <svg width={16} height={16} viewBox="0 0 20 20" fill="none">
                    <path d="M4 10.5L8.5 15L16 6" stroke="white" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Get Listo Report
                </button>
                <div style={{ textAlign:"center", fontSize:11, color:T.secondary,
                  marginTop:10, fontFamily:"'DM Sans',sans-serif" }}>
                  Results in seconds · AI-generated · Always verify with jurisdiction
                </div>
              </div>
            </div>

            {/* Coverage note */}
            <div style={{ textAlign:"center", fontSize:12, color:T.secondary,
              fontFamily:"'DM Sans',sans-serif" }}>
              Currently covering: <strong style={{ color:T.text }}>City of Los Angeles</strong>
              {" · "}<strong style={{ color:T.text }}>Santa Monica</strong>
              {" · "}<strong style={{ color:T.text }}>Beverly Hills</strong>
              {" · "}<strong style={{ color:T.text }}>Malibu</strong>
              {" · "}More cities coming soon
            </div>
          </div>
        )}

        {/* ── CONFIRM ───────────────────────────────────────────────────── */}
        {stage === "confirm" && (
          <div className="fade-up">
            <button onClick={reset} style={{ background:"none", border:"none",
              color:T.secondary, cursor:"pointer", fontSize:13, padding:"0 0 20px",
              fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:6 }}>
              ← Edit Address
            </button>

            <div style={{ background:T.white, border:`1px solid ${T.border}`,
              borderRadius:12, overflow:"hidden", marginBottom:16 }}>
              {/* Header */}
              <div style={{ background:T.black, padding:"14px 24px" }}>
                <Logo size={22} light />
              </div>

              <div style={{ padding:28 }}>
                <h2 style={{ fontSize:20, fontFamily:"'Georgia',serif", color:T.black,
                  marginBottom:6 }}>Confirm your address</h2>
                <p style={{ fontSize:13, color:T.secondary, marginBottom:24,
                  fontFamily:"'DM Sans',sans-serif" }}>
                  The <strong style={{ color:T.orange }}>ZIP code</strong> determines jurisdiction, zoning, and permit rules.
                </p>

                {/* Address field */}
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:10, color:T.secondary, fontFamily:"monospace",
                    letterSpacing:"0.12em", textTransform:"uppercase",
                    display:"block", marginBottom:8 }}>Street Address</label>
                  <input style={{ width:"100%", border:`1px solid ${T.border}`, borderRadius:8,
                    padding:"11px 14px", fontSize:13, color:T.text, background:T.white }}
                    value={editStreet} onChange={e=>setEditStreet(e.target.value)}
                    placeholder="5514 Thornburn St, Los Angeles, CA" />
                </div>

                {/* ZIP + jurisdiction */}
                <div style={{ marginBottom:8 }}>
                  <label style={{ fontSize:10, color:T.orange, fontFamily:"monospace",
                    letterSpacing:"0.12em", textTransform:"uppercase",
                    display:"block", marginBottom:8 }}>
                    ZIP Code <span style={{ fontWeight:300, color:T.secondary,
                      textTransform:"none", letterSpacing:0 }}>— double-check this</span>
                  </label>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <input style={{ width:120, border:`2px solid ${editZip.length === 5 ? T.orange : zipDetecting ? T.secondary : T.red}`,
                      borderRadius:8, padding:"11px 14px", fontSize:22,
                      fontWeight:700, color: editZip.length === 5 ? T.orange : zipDetecting ? T.secondary : T.red, letterSpacing:"0.12em",
                      textAlign:"center", fontFamily:"'DM Sans',sans-serif" }}
                      type="text" maxLength={5} value={editZip}
                      onChange={e=>setEditZip(e.target.value.replace(/\D/g,"").slice(0,5))}
                      placeholder={zipDetecting ? "···" : "ZIP"} />
                    {editZip.length === 5 && <JurisdictionBadge jurisdiction={jurisdiction} />}
                    {zipDetecting && <span style={{ fontSize:12, color:T.secondary, fontStyle:"italic" }}>Detecting ZIP...</span>}
                  </div>
                  {!editZip && !zipDetecting && (
                    <div style={{ marginTop:8, fontSize:12, color:T.red,
                      fontFamily:"'DM Sans',sans-serif" }}>
                      ⚠ ZIP not detected from your address — enter it manually above. It determines zoning, permits, and fees.
                    </div>
                  )}
                </div>

                {/* Jurisdiction note */}
                {jurisdiction?.note && (
                  <div style={{ marginBottom:16 }}>
                    <Flag level="blue">{jurisdiction.note}</Flag>
                  </div>
                )}

                {/* Not covered */}
                {jurisdiction && !jurisdiction.covered && (
                  <div style={{ marginBottom:16 }}>
                    <Flag level="red" title={`${jurisdiction.nearbyCity||"This city"} is not yet covered`}>
                      Listo currently covers City of LA, Santa Monica, and Beverly Hills.
                      {jurisdiction.nearbyCity ? ` ${jurisdiction.nearbyCity} has its own building department with different permit rules.` : ""}
                      {" "}Check back soon as we expand coverage.
                    </Flag>
                  </div>
                )}
              </div>
            </div>

            <button className="btn-primary"
              onClick={handleAnalyze}
              disabled={!!(jurisdiction && !jurisdiction.covered)}
              style={{ opacity:(jurisdiction && !jurisdiction.covered) ? 0.4 : 1 }}>
              Run Permit Analysis →
            </button>
            <div style={{ textAlign:"center", marginTop:12 }}>
              <button onClick={reset} style={{ background:"none", border:"none",
                color:T.secondary, cursor:"pointer", fontSize:13,
                fontFamily:"'DM Sans',sans-serif", textDecoration:"underline" }}>
                ← Start over
              </button>
            </div>
          </div>
        )}

        {/* ── RESULT ────────────────────────────────────────────────────── */}
        {stage === "result" && (
          <div className="fade-up">
            <div className="no-print" style={{ display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:4 }}>
              <button onClick={reset} style={{ background:"none", border:"none",
                color:T.secondary, cursor:"pointer", fontSize:13, padding:"0 0 16px",
                fontFamily:"'DM Sans',sans-serif" }}>← New Search</button>
              {result && <button onClick={handlePrint}
                style={{ background:"none", border:`1px solid ${T.border}`,
                  color:T.secondary, cursor:"pointer", fontSize:12, padding:"6px 14px",
                  borderRadius:6, fontFamily:"'DM Sans',sans-serif", marginBottom:16 }}>
                ↓ Export PDF
              </button>}
            </div>

            {/* Loading state — from brand preview */}
            {loading && (
              <div style={{ background:T.black, borderRadius:12, padding:48,
                textAlign:"center" }}>
                <div style={{ width:64, height:64, background:T.orange, borderRadius:16,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  margin:"0 auto 24px" }}>
                  <svg width={32} height={32} viewBox="0 0 20 20" fill="none">
                    <path d="M4 10.5L8.5 15L16 6" stroke={T.cream}
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div style={{ fontSize:22, fontFamily:"'Georgia',serif",
                  color:T.cream, marginBottom:8 }}>Working on it...</div>
                <div style={{ fontSize:13, color:"#A8A29E",
                  fontFamily:"'DM Sans',sans-serif", marginBottom:28 }}>
                  Checking zones, overlays, and permit pathways
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10,
                  maxWidth:280, margin:"0 auto" }}>
                  {LOADING_STEPS.map((step, idx) => (
                    <div key={idx} style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <div style={{ width:16, height:16, borderRadius:"50%",
                        background: idx <= loadingStep ? T.green : "#ffffff15",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        flexShrink:0, transition:"background 0.3s" }}>
                        {idx <= loadingStep && (
                          <svg width={8} height={8} viewBox="0 0 20 20" fill="none">
                            <path d="M4 10.5L8.5 15L16 6" stroke="white"
                              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span style={{ fontSize:12, color: idx <= loadingStep ? T.cream : "#78716C",
                        fontFamily:"'DM Sans',sans-serif", textAlign:"left" }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding:"12px 16px", background:"#FEF2F2",
                border:"1px solid #FECACA", borderRadius:8, color:T.red,
                fontSize:13, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif" }}>
                {error}
              </div>
            )}

            {result && (
              <div>
                {/* Hero Card */}
                <ReportHero address={editStreet || address} parcel={parcel} projectType={projectType} jurisdiction={jurisdiction} resultText={result} />

                {/* KPI Strip — light background */}
                <div style={{ padding: "0 16px" }}>
                  <KPIStrip parcel={parcel} resultText={result} />
                </div>

                {/* Sticky Nav */}
                <SectionNav />

                {/* Report Body — cream bg, white section cards */}
                <div style={{ background: T.cream, padding: "8px 0 0" }}>
                  <ReportBody text={result} parcel={parcel} projectType={projectType} jurisdiction={jurisdiction} />

                  {/* Footer */}
                  <div style={{ margin: "0 16px", background: T.black, borderRadius: 12, padding: "20px 24px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }} className="no-print">
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ position: "relative" }}>
                          <button onClick={handleShare}
                            style={{ display: "flex", alignItems: "center", gap: 8, background: T.gold, color: T.black, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" /></svg>
                            Share Report
                          </button>
                          {shareToast && (
                            <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: T.black, color: T.gold, fontSize: 11, padding: "5px 12px", borderRadius: 6, whiteSpace: "nowrap", fontFamily: "'DM Sans',sans-serif", border: `1px solid ${T.gold}40` }}>
                              ✓ Copied to clipboard
                            </div>
                          )}
                        </div>
                        <button onClick={handlePrint}
                          style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", color: "#D6D3D1", border: "1px solid #ffffff20", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          Export PDF
                        </button>
                      </div>
                      <button onClick={() => window.open(jurisdiction?.applyUrl || jurisdiction?.agencyUrl || "https://www.ladbs.org/permits-inspections/apply-for-a-permit", "_blank")}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: T.secondary, padding: "10px 0", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", textDecoration: "underline", textUnderlineOffset: 2 }}>
                        Apply at {jurisdiction?.agency || "LADBS"} →
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: T.secondary, lineHeight: 1.6 }}>
                      AI-generated guidance based on publicly available LA permit data. Always verify with your jurisdiction before submitting. This is not legal advice.
                    </div>
                    <div style={{ fontSize: 10, color: T.secondary, marginTop: 6 }}>
                      listo.zone · Not affiliated with the City of Los Angeles, Santa Monica, Beverly Hills, Malibu, or LADBS
                    </div>
                  </div>

                  {/* Feedback */}
                  <div style={{ padding: "16px 16px 20px" }} className="no-print">
                    {!fbDone ? (<>
                      <div style={{ fontSize: 13, color: T.secondary, marginBottom: 10, fontFamily: "'DM Sans',sans-serif" }}>Was this analysis accurate and useful?</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: fbOpen ? 14 : 0 }}>
                        <button onClick={() => { setFbState("up"); submitFeedback("up"); }}
                          style={{ fontSize: 13, background: fbState === "up" ? "#F0FDF4" : T.white, border: `1px solid ${fbState === "up" ? "#BBF7D0" : T.border}`, color: fbState === "up" ? T.green : T.secondary, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                          ✓ Accurate
                        </button>
                        <button onClick={() => { setFbState("down"); setFbOpen(true); }}
                          style={{ fontSize: 13, background: fbState === "down" ? "#FEF2F2" : T.white, border: `1px solid ${fbState === "down" ? "#FECACA" : T.border}`, color: fbState === "down" ? T.red : T.secondary, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                          Something's wrong
                        </button>
                      </div>
                      {fbOpen && (
                        <div style={{ marginTop: 12 }}>
                          <textarea style={{ width: "100%", border: `1px solid ${T.border}`, borderRadius: 8, padding: "11px 14px", fontSize: 13, color: T.text, height: 80, resize: "vertical", fontFamily: "'DM Sans',sans-serif" }}
                            placeholder="What was wrong or missing?"
                            value={fbComment} onChange={e => setFbComment(e.target.value)} />
                          <button className="btn-primary" style={{ width: "auto", padding: "10px 24px", fontSize: 13, marginTop: 8 }} onClick={() => submitFeedback("down", fbComment)}>
                            Submit Feedback
                          </button>
                        </div>
                      )}
                    </>) : (
                      <div style={{ fontSize: 13, color: T.green, fontFamily: "'DM Sans',sans-serif" }}>
                        Thanks — feedback received. This helps us improve accuracy.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer style={{ borderTop:`1px solid ${T.border}`, padding:"16px 24px",
        textAlign:"center", fontSize:11, color:T.secondary,
        fontFamily:"'DM Sans',sans-serif" }} className="no-print">
        listo.zone · City of LA · Santa Monica · Beverly Hills · Malibu
        {" · "}Not affiliated with LADBS or any city building department.
        {" · "}Always consult a licensed professional.
      </footer>
    </div>
  );
}
