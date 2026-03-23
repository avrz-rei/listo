import { useState, useEffect } from "react";

// ── PostHog ───────────────────────────────────────────────────────────────
const POSTHOG_KEY = "phc_Gbq7s2JDLrsyaRC2X3jP9PmMEBclWGloKzzL29XZRhv";
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
  lime:     "#C8F135",
  text:     "#2C2420",
  muted:    "#8C7B70",
  border:   "#E2D9D0",
  green:    "#16A34A",
  yellow:   "#D97706",
  red:      "#DC2626",
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
    covered: true, color: "#7c3aed",
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
  const zip = (s.match(/\b(\d{5})\b/) || [])[1] || "";
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
    red:    { bg:"#FEF2F2", border:"#FECACA", dot:T.red,    label:"FLAG" },
    yellow: { bg:"#FFFBEB", border:"#FDE68A", dot:T.yellow, label:"REVIEW" },
    green:  { bg:"#F0FDF4", border:"#BBF7D0", dot:T.green,  label:"CLEAR" },
    blue:   { bg:"#EFF6FF", border:"#BFDBFE", dot:"#2563eb",label:"INFO" },
  }[level] || { bg:"#F9FAFB", border:T.border, dot:T.muted, label:"NOTE" };

  return (
    <div style={{ background:cfg.bg, border:`1px solid ${cfg.border}`,
      borderRadius:8, padding:"12px 14px", display:"flex", gap:12, alignItems:"flex-start" }}>
      <div style={{ width:8, height:8, borderRadius:"50%", background:cfg.dot,
        marginTop:5, flexShrink:0 }} />
      <div style={{ flex:1 }}>
        <div style={{ fontSize:9, color:cfg.dot, fontFamily:"monospace",
          letterSpacing:"0.1em", marginBottom:3 }}>{cfg.label}</div>
        {title && <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:3 }}>{title}</div>}
        <div style={{ fontSize:13, color:T.text, lineHeight:1.6 }}>{children}</div>
        {meta && <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>{meta}</div>}
      </div>
    </div>
  );
}

// ── Score card component (from brand preview) ─────────────────────────────
function ScoreCard({ label, value, sub, color }) {
  return (
    <div style={{ background:T.white, padding:"20px 24px", borderRight:`1px solid ${T.border}` }}>
      <div style={{ fontSize:9, color:T.muted, fontFamily:"monospace",
        letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color: color||T.text,
        fontFamily:"'Georgia',serif", marginBottom:4 }}>{value}</div>
      <div style={{ fontSize:11, color:T.muted }}>{sub}</div>
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
      <span style={{ color:T.muted }}>· {jurisdiction.agency}</span>
    </div>
  );
}

// ── Inline markdown renderer ──────────────────────────────────────────────
function renderInline(text) {
  return (text||"").split(/(\*\*[^*]+\*\*)/g).map((p,i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} style={{ color:T.text }}>{p.slice(2,-2)}</strong> : p
  );
}

// ── Report markdown renderer — light mode ─────────────────────────────────
function ReportMarkdown({ text, jurisdiction }) {
  const lines = text.split("\n");
  const els = [];
  let i = 0, lk = 0, sec = "";
  let scoreCards = null;

  // Extract score cards from Deal Summary for the header
  const extractScoreCards = (allLines) => {
    let verdict = "", permits = "", zoning = "";
    for (const l of allLines) {
      const t = l.trim();
      if (t.startsWith("VERDICT:")) verdict = t.slice(8).trim();
      if (t.startsWith("PERMITS:")) permits = t.slice(8).trim();
      if (t.startsWith("ZONING:")) zoning = t.slice(7).trim();
    }
    const complexityMap = { GO:"Low", CAUTION:"Medium", COMPLEX:"High" };
    const complexityColor = { GO:T.green, CAUTION:T.yellow, COMPLEX:T.red };
    const verdictWord = (verdict.split("|")[0]||"").trim();
    const [fees, timeline] = (permits||"").split("|").map(p=>p.trim());
    return { verdictWord, fees, timeline, zoning, complexityMap, complexityColor };
  };

  const sc = extractScoreCards(lines);

  // Render score cards block (rendered once at top of deal summary)
  const renderScoreCardsBlock = () => (
    <div key="score-cards" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
      background:T.border, gap:1, marginBottom:24, borderRadius:8, overflow:"hidden",
      border:`1px solid ${T.border}` }}>
      <ScoreCard
        label="Permit Complexity"
        value={sc.complexityMap[sc.verdictWord] || "—"}
        sub={sc.verdictWord === "GO" ? "Standard pathway" : sc.verdictWord === "CAUTION" ? "2–3 review rounds typical" : "Entitlement likely required"}
        color={sc.complexityColor[sc.verdictWord] || T.text}
      />
      <ScoreCard
        label="Est. Timeline"
        value={(sc.timeline||"").replace("week critical path","wks").replace("weeks","wks")||"—"}
        sub="From submittal to approval"
        color={T.black}
      />
      <ScoreCard
        label="Est. Permit Fees"
        value={(sc.fees||"").replace("estimated fees","").trim()||"—"}
        sub={`${jurisdiction?.short||"City of LA"} fee schedule`}
        color={T.orange}
      />
    </div>
  );

  let scoreCardsRendered = false;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    // Section headers
    if (t.startsWith("## ")) {
      sec = t.slice(3).toLowerCase();
      const id = "sec-" + sec.replace(/[^a-z0-9]+/g,"-").replace(/-+$/,"");
      els.push(
        <div key={"h2"+i} id={id} style={{ marginTop:28, marginBottom:12, scrollMarginTop:80,
          paddingBottom:8, borderBottom:`2px solid ${T.orange}30` }}>
          <h2 style={{ fontFamily:"'Georgia',serif", fontSize:17, fontWeight:700,
            color:T.black, margin:0, textTransform:"uppercase", letterSpacing:"0.05em" }}>
            {t.slice(3)}
          </h2>
        </div>
      );
      // Insert score cards after Project Overview header
      if ((sec.includes("project overview") || sec.includes("deal")) && !scoreCardsRendered) {
        scoreCardsRendered = true;
        i++;
        // Skip to end of deal summary KPI lines, then render score cards
        const kpiEls = [];
        while (i < lines.length && !lines[i].trim().startsWith("## ")) {
          const kt = lines[i].trim();
          if (!kt) { i++; continue; }
          if (kt.startsWith("VERDICT:")) {
            const pts = kt.slice(8).trim().split("|").map(p=>p.trim());
            const word = pts[0], desc = pts[1]||"";
            const col = word==="GO" ? T.green : word==="COMPLEX" ? T.red : T.yellow;
            kpiEls.push(
              <div key={"v"+i} style={{ display:"flex", alignItems:"center", gap:10,
                padding:"10px 14px", background: col+"15", border:`1px solid ${col}40`,
                borderRadius:8, marginBottom:8 }}>
                <span style={{ fontSize:11, fontWeight:800, color:T.white,
                  background:col, borderRadius:4, padding:"2px 10px",
                  letterSpacing:"0.08em" }}>{word}</span>
                <span style={{ fontSize:13, color:T.text, lineHeight:1.5 }}>{desc}</span>
              </div>
            );
          } else {
            const KPI = ["ZONING:","UNITS:","PERMITS:","ALERTS:","DATA:"];
            const kpi = KPI.find(k => kt.startsWith(k));
            if (kpi) {
              const label = kpi.slice(0,-1), val = kt.slice(kpi.length).trim();
              kpiEls.push(
                <div key={"k"+i} style={{ display:"flex", gap:10, padding:"7px 0",
                  borderBottom:`1px solid ${T.border}`, alignItems:"flex-start" }}>
                  <span style={{ fontSize:10, fontWeight:700, color:label==="ALERTS"?T.red:T.muted,
                    textTransform:"uppercase", letterSpacing:"0.08em", minWidth:70,
                    paddingTop:2, flexShrink:0, fontFamily:"monospace" }}>{label}</span>
                  <span style={{ fontSize:13, color:T.text, lineHeight:1.5, flex:1 }}>{renderInline(val)}</span>
                </div>
              );
            }
          }
          i++;
        }
        els.push(<div key="kpis">{kpiEls}</div>);
        els.push(renderScoreCardsBlock());
        continue;
      }
      i++; continue;
    }

    if (t.startsWith("### ")) {
      els.push(<h3 key={i} style={{ fontSize:13, fontWeight:700, color:T.black,
        margin:"14px 0 8px", background:T.warmGray, padding:"4px 10px", borderRadius:4 }}>
        {renderInline(t.slice(4))}
      </h3>);
      i++; continue;
    }
    if (!t || t === "---") { els.push(<div key={i} style={{ height:"5px" }} />); i++; continue; }

    // Zone Alerts — render as Flag components
    if (sec.includes("alert") && t.includes("|") && t.split("|").length >= 2) {
      const pts = t.split("|").map(p=>p.trim());
      const [sev, name, dollar, time] = pts;
      const levelMap = {
        "ACTION REQUIRED":"red", "CRITICAL":"red",
        "CAUTION":"yellow",
        "NOTE":"blue", "INFO":"blue",
        "CLEAR":"green"
      };
      const level = levelMap[sev] || "blue";
      // Update display label
      const displayLabel = sev === "ACTION REQUIRED" ? "ACTION REQUIRED"
        : sev === "CRITICAL" ? "ACTION REQUIRED"
        : sev === "INFO" ? "NOTE"
        : sev;
      let desc = "";
      if (i+1 < lines.length && !lines[i+1].trim().includes("|") && lines[i+1].trim()) {
        desc = lines[i+1].trim(); i++;
      }
      const meta = [dollar, time ? `+${time}` : ""].filter(Boolean).join(" · ");
      // Override the flag label display
      const cfgOverride = level === "red"
        ? { bg:"#FEF2F2", border:"#FECACA", dot:T.red, label:displayLabel }
        : level === "yellow"
        ? { bg:"#FFFBEB", border:"#FDE68A", dot:T.yellow, label:"CAUTION" }
        : level === "green"
        ? { bg:"#F0FDF4", border:"#BBF7D0", dot:T.green, label:"CLEAR" }
        : { bg:"#EFF6FF", border:"#BFDBFE", dot:"#2563eb", label:"NOTE" };
      els.push(<div key={i} style={{ marginBottom:8 }}>
        <div style={{ background:cfgOverride.bg, border:`1px solid ${cfgOverride.border}`,
          borderRadius:8, padding:"12px 14px", display:"flex", gap:12, alignItems:"flex-start" }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:cfgOverride.dot,
            marginTop:5, flexShrink:0 }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:9, color:cfgOverride.dot, fontFamily:"monospace",
              letterSpacing:"0.1em", marginBottom:3 }}>{cfgOverride.label}</div>
            {name && <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:3 }}>{name}</div>}
            <div style={{ fontSize:13, color:T.text, lineHeight:1.6 }}>{desc}</div>
            {meta && <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>{meta}</div>}
          </div>
        </div>
      </div>);
      i++; continue;
    }

    // Permit roadmap cards
    if ((sec.includes("roadmap")||sec.includes("permit roadmap")) && t.includes("|") && t.split("|").length >= 3) {
      const [name,type,agency,time,cost] = t.split("|").map(p=>p.trim());
      const isOTC = (type||"").toUpperCase()==="OTC";
      const isSpecial = (type||"").toUpperCase().includes("SPECIAL");
      const badgeStyle = {
        OTC:    { bg:T.green+"20",  color:T.green,  border:T.green+"40",  label:"OTC" },
        SPECIAL:{ bg:T.orange+"20", color:T.orange, border:T.orange+"40", label:"SPECIAL" },
        DEFAULT:{ bg:"#EFF6FF",     color:"#2563eb", border:"#BFDBFE",    label:"PLAN CHECK" },
      };
      const b = isOTC ? badgeStyle.OTC : isSpecial ? badgeStyle.SPECIAL : badgeStyle.DEFAULT;
      els.push(
        <div key={i} style={{ background:T.white, border:`1px solid ${T.border}`,
          borderRadius:8, padding:"10px 14px", marginBottom:6, display:"flex",
          alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:13, fontWeight:600, color:T.text, flex:1 }}>{name}</span>
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.08em",
            background:b.bg, color:b.color, border:`1px solid ${b.border}`,
            borderRadius:3, padding:"2px 8px" }}>{b.label}</span>
          <div style={{ display:"flex", flexWrap:"wrap", gap:12, fontSize:12, color:T.muted }}>
            {agency && <span>{agency}</span>}
            {time && <span>{time}</span>}
            {cost && <span style={{ color:T.orange, fontWeight:600 }}>{cost}</span>}
          </div>
        </div>
      );
      i++; continue;
    }

    // Development Standards section — pipe-delimited table + EXEMPTION rows
    if (sec.includes("development standards")) {
      if (t.startsWith("ZONING:") && !t.includes("DENSITY")) {
        els.push(<div key={i} style={{ fontSize:13, fontWeight:600, color:T.text,
          marginBottom:12, paddingBottom:8, borderBottom:`1px solid ${T.border}` }}>
          {renderInline(t)}
        </div>);
        i++; continue;
      }
      if (t === "STANDARD | MAX ALLOWED | PROPOSED/TYPICAL | LAMC REF" || t === "STANDARD | MAX ALLOWED | PROPOSED | LAMC REF") {
        // render table header
        els.push(<div key={i} style={{ display:"grid",
          gridTemplateColumns:"2fr 1.8fr 1.5fr 1.2fr",
          background:T.black, marginBottom:1, borderRadius:"6px 6px 0 0" }}>
          {["STANDARD","MAX ALLOWED","PROPOSED","LAMC REF"].map((h,hi) => (
            <div key={hi} style={{ padding:"7px 10px", fontSize:9, fontWeight:700,
              color:T.orange, fontFamily:"monospace", letterSpacing:"0.08em" }}>{h}</div>
          ))}
        </div>);
        i++;
        // Render all following pipe rows as table rows until non-pipe or EXEMPTION/ENCROACHMENT/GRADING etc.
        let rowIdx = 0;
        while (i < lines.length) {
          const rt = lines[i].trim();
          if (!rt || rt.startsWith("##") || rt.startsWith("EXEMPTION:") ||
              rt.startsWith("ENCROACHMENT") || rt.startsWith("GRADING:") ||
              rt.startsWith("BASEMENT:") || rt.startsWith("FIRE SPRINKLERS:") ||
              rt.startsWith("OFFSET PLAN")) break;
          if (rt.includes("|") && rt.split("|").length >= 2) {
            const cells = rt.split("|").map(p=>p.trim());
            const [std, maxA, prop, lamc] = cells;
            els.push(<div key={"dsr"+i} style={{ display:"grid",
              gridTemplateColumns:"2fr 1.8fr 1.5fr 1.2fr",
              background: rowIdx%2===0 ? T.white : T.warmGray,
              borderBottom:`1px solid ${T.border}` }}>
              <div style={{ padding:"8px 10px", fontSize:12, fontWeight:600, color:T.text }}>{renderInline(std)}</div>
              <div style={{ padding:"8px 10px", fontSize:12, color:T.green, fontWeight:500 }}>{renderInline(maxA||"")}</div>
              <div style={{ padding:"8px 10px", fontSize:12, color:T.muted }}>{renderInline(prop||"")}</div>
              <div style={{ padding:"8px 10px", fontSize:11, color:T.muted, fontFamily:"monospace" }}>{lamc||""}</div>
            </div>);
            rowIdx++;
          }
          i++;
        }
        els.push(<div key={"dsbot"+i} style={{ height:8 }} />);
        continue;
      }
      if (t.startsWith("EXEMPTION:")) {
        const rest = t.slice(10).trim();
        const parts = rest.split("|").map(p=>p.trim());
        const [desc, amount, lamc] = parts;
        els.push(<div key={i} style={{ display:"flex", gap:8, alignItems:"flex-start",
          padding:"7px 10px", background:"#FFF8F0", border:`1px solid ${T.orange}30`,
          borderRadius:5, marginBottom:4 }}>
          <span style={{ fontSize:9, fontWeight:700, color:T.orange, fontFamily:"monospace",
            letterSpacing:"0.08em", minWidth:70, marginTop:1, flexShrink:0 }}>EXEMPT</span>
          <span style={{ fontSize:12, color:T.text, flex:1, lineHeight:1.5 }}>{renderInline(desc)}</span>
          {amount && <span style={{ fontSize:11, color:T.orange, fontWeight:600, whiteSpace:"nowrap" }}>{amount}</span>}
          {lamc && <span style={{ fontSize:10, color:T.muted, fontFamily:"monospace", whiteSpace:"nowrap" }}>{lamc}</span>}
        </div>);
        i++; continue;
      }
      // Technical spec rows: ENCROACHMENT PLANE, GRADING, BASEMENT, FIRE SPRINKLERS, OFFSET PLAN BREAK
      if (t.startsWith("ENCROACHMENT PLANE:") || t.startsWith("GRADING:") ||
          t.startsWith("BASEMENT:") || t.startsWith("FIRE SPRINKLERS:") ||
          t.startsWith("OFFSET PLAN BREAK:")) {
        const colonIdx = t.indexOf(":");
        const label = t.slice(0, colonIdx);
        const val = t.slice(colonIdx+1).trim();
        els.push(<div key={i} style={{ display:"flex", gap:10, padding:"6px 0",
          borderBottom:`1px solid ${T.border}`, alignItems:"flex-start" }}>
          <span style={{ fontSize:9, fontWeight:700, color:T.muted, fontFamily:"monospace",
            letterSpacing:"0.06em", minWidth:110, flexShrink:0, paddingTop:2 }}>{label}</span>
          <span style={{ fontSize:12, color:T.text, lineHeight:1.6 }}>{renderInline(val)}</span>
        </div>);
        i++; continue;
      }
    }

    // Density / zoning metric cards
    if (sec.includes("zoning") && !sec.includes("alert")) {
      if (t.startsWith("DENSITY MATH:")) {
        els.push(<div key={i} style={{ background:"#F0FDF4", border:`2px solid ${T.green}`,
          borderRadius:8, padding:"14px 16px", marginBottom:10, marginTop:8 }}>
          <div style={{ fontSize:9, fontWeight:700, color:T.green, letterSpacing:"0.12em",
            fontFamily:"monospace", marginBottom:4 }}>DENSITY MATH</div>
          <div style={{ fontSize:20, fontWeight:700, color:T.green,
            fontFamily:"'Georgia',serif" }}>{t.slice(13).trim()}</div>
        </div>);
        i++; continue;
      }
      if (t.startsWith("MAX BUILDOUT:")) {
        els.push(<div key={i} style={{ background:T.orange+"12", border:`2px solid ${T.orange}`,
          borderRadius:8, padding:"14px 16px", marginBottom:10 }}>
          <div style={{ fontSize:9, fontWeight:700, color:T.orange, letterSpacing:"0.12em",
            fontFamily:"monospace", marginBottom:4 }}>MAX BUILDOUT</div>
          <div style={{ fontSize:20, fontWeight:700, color:T.orange,
            fontFamily:"'Georgia',serif" }}>{t.slice(13).trim()}</div>
        </div>);
        i++; continue;
      }
      if (t.startsWith("TOC BONUS:")) {
        const val = t.slice(10).trim();
        const eligible = !/not applicable|not eligible/i.test(val);
        els.push(<div key={i} style={{ background:eligible?"#EFF6FF":"#F9FAFB",
          border:`1px solid ${eligible?"#BFDBFE":T.border}`, borderRadius:6,
          padding:"8px 12px", marginBottom:6, display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:9, fontWeight:700, color:eligible?"#2563eb":T.muted,
            letterSpacing:"0.1em", fontFamily:"monospace" }}>TOC</span>
          <span style={{ fontSize:13, color:eligible?"#1d4ed8":T.muted }}>{val}</span>
        </div>);
        i++; continue;
      }
      if (t.startsWith("ADU:")) {
        els.push(<div key={i} style={{ background:T.warmGray, border:`1px solid ${T.border}`,
          borderRadius:6, padding:"8px 12px", marginBottom:6, display:"flex", gap:8 }}>
          <span style={{ fontSize:9, fontWeight:700, color:T.muted, letterSpacing:"0.1em",
            fontFamily:"monospace" }}>ADU</span>
          <span style={{ fontSize:13, color:T.text }}>{t.slice(4).trim()}</span>
        </div>);
        i++; continue;
      }
      if (t.startsWith("EXISTING STRUCTURE:")) {
        els.push(<div key={i} style={{ background:T.warmGray, border:`1px solid ${T.border}`,
          borderRadius:6, padding:"8px 12px", marginBottom:6, display:"flex", gap:8 }}>
          <span style={{ fontSize:9, fontWeight:700, color:T.muted, letterSpacing:"0.1em",
            fontFamily:"monospace" }}>EXISTING</span>
          <span style={{ fontSize:13, color:T.muted }}>{t.slice(19).trim()}</span>
        </div>);
        i++; continue;
      }
    }

    // Documents section
    if (sec.includes("document")) {
      if (t === "DEMO" || t === "BUILDING" || t.startsWith("TECHNICAL")) {
        els.push(<div key={i} style={{ fontSize:9, fontWeight:700, color:T.orange,
          textTransform:"uppercase", letterSpacing:"0.12em", fontFamily:"monospace",
          marginTop:16, marginBottom:6, paddingTop:10, borderTop:`1px solid ${T.border}` }}>
          {t}
        </div>);
        i++; continue;
      }
      if (t.includes("|")) {
        const [name, who, stamp] = t.split("|").map(p=>p.trim());
        const req = stamp && stamp.toUpperCase().includes("YES");
        els.push(<div key={i} style={{ display:"flex", gap:10, padding:"8px 0",
          borderBottom:`1px solid ${T.border}`, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ width:18, height:18, background:T.warmGray, borderRadius:4,
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width={9} height={9} viewBox="0 0 20 20" fill="none">
              <path d="M4 10.5L8.5 15L16 6" stroke={T.orange} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontSize:13, color:T.text, flex:1 }}>{name}</span>
          <span style={{ fontSize:11, color:T.muted, minWidth:120 }}>{who}</span>
          {stamp && <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.06em",
            color:req?"#b91c1c":"#16a34a",
            background:req?"#FEF2F2":"#F0FDF4",
            border:`1px solid ${req?"#FECACA":"#BBF7D0"}`,
            borderRadius:3, padding:"2px 7px", whiteSpace:"nowrap",
            fontFamily:"monospace" }}>STAMP: {req?"REQ":"NOT REQ"}</span>}
        </div>);
        i++; continue;
      }
    }

    // Fee rows
    if (sec.includes("fee") && t.includes("|")) {
      const [name, basis, range] = t.split("|").map(p=>p.trim());
      const isTotal = (name||"").toUpperCase().includes("TOTAL");
      els.push(<div key={i} style={{ display:"flex", gap:8, padding:"7px 0",
        borderBottom:`1px solid ${isTotal?T.orange+"50":T.border}`,
        background:isTotal?T.orange+"08":"transparent",
        paddingLeft:isTotal?8:0, paddingRight:isTotal?8:0,
        borderRadius:isTotal?6:0, marginTop:isTotal?4:0 }}>
        <span style={{ fontSize:13, color:isTotal?T.orange:T.muted, flex:1,
          fontWeight:isTotal?700:400 }}>{name}</span>
        {basis && !isTotal && <span style={{ fontSize:11, color:T.border, minWidth:120 }}>{basis}</span>}
        <span style={{ fontSize:13, color:isTotal?T.orange:T.text,
          fontWeight:isTotal?700:500, whiteSpace:"nowrap" }}>{range}</span>
      </div>);
      i++; continue;
    }

    // Fee excludes / notes
    if (sec.includes("fee") && (t.startsWith("EXCLUDES:") || t.startsWith("Note:"))) {
      els.push(<p key={i} style={{ fontSize:11, color:T.muted, lineHeight:1.6,
        marginTop:8, fontStyle:"italic" }}>{renderInline(t)}</p>);
      i++; continue;
    }

    // Timeline
    if (sec.includes("timeline")) {
      const wm = t.match(/^(Weeks?\s[\d\-–]+)\s*:\s*(.+)$/i);
      if (wm) {
        els.push(<div key={i} style={{ display:"flex", gap:12, padding:"7px 0",
          borderBottom:`1px solid ${T.border}`, alignItems:"flex-start" }}>
          <span style={{ fontSize:11, fontWeight:700, color:T.orange, fontFamily:"monospace",
            whiteSpace:"nowrap", minWidth:80, paddingTop:2, flexShrink:0 }}>{wm[1]}</span>
          <span style={{ fontSize:13, color:T.text, lineHeight:1.6 }}>{renderInline(wm[2])}</span>
        </div>);
        i++; continue;
      }
      if (t.startsWith("BEST CASE:") || t.startsWith("WORST CASE:")) {
        const isB = t.startsWith("BEST");
        els.push(<div key={i} style={{ display:"flex", gap:8, alignItems:"center", padding:"6px 0" }}>
          <span style={{ fontSize:10, fontWeight:700, color:T.muted, fontFamily:"monospace",
            letterSpacing:"0.06em", minWidth:90 }}>{isB?"BEST CASE":"WORST CASE"}</span>
          <span style={{ fontSize:13, color:isB?T.green:T.red, fontWeight:700 }}>
            {t.slice(t.indexOf(":")+1).trim()}
          </span>
        </div>);
        i++; continue;
      }
    }

    // Next steps
    if (sec.includes("next") && /^\d+\./.test(t)) {
      const rest = t.replace(/^\d+\.\s*/,"");
      const pi = rest.indexOf("|");
      const action = pi>0 ? rest.slice(0,pi).trim() : rest;
      const meta = pi>0 ? rest.slice(pi+1).trim() : "";
      const num = (t.match(/^\d+/)||[""])[0];
      els.push(<div key={i} style={{ display:"flex", gap:12, padding:"10px 0",
        borderBottom:`1px solid ${T.border}`, alignItems:"flex-start" }}>
        <span style={{ fontSize:10, fontWeight:800, color:T.white, background:T.orange,
          borderRadius:4, padding:"2px 7px", whiteSpace:"nowrap",
          flexShrink:0, marginTop:1 }}>{num}</span>
        <div>
          <p style={{ fontSize:13, color:T.text, fontWeight:600, margin:0, lineHeight:1.5 }}>
            {renderInline(action)}
          </p>
          {meta && <p style={{ fontSize:12, color:T.muted, margin:"2px 0 0", lineHeight:1.5 }}>
            {renderInline(meta)}
          </p>}
        </div>
      </div>);
      i++; continue;
    }

    // Legal notice — skip rendering here (rendered separately as Listo Summary style)
    if (sec.includes("legal")) { i++; continue; }

    // Critical path callout
    if (t.startsWith("CRITICAL PATH:")) {
      els.push(<div key={i} style={{ padding:"8px 12px", background:"#EFF6FF",
        border:"1px solid #BFDBFE", borderRadius:6, marginTop:8,
        display:"flex", gap:8, alignItems:"center" }}>
        <span style={{ fontSize:10, fontWeight:700, color:"#2563eb",
          fontFamily:"monospace", letterSpacing:"0.08em" }}>CRITICAL PATH</span>
        <span style={{ fontSize:13, color:"#1d4ed8" }}>{t.slice(14).trim()}</span>
      </div>);
      i++; continue;
    }

    // Markdown table
    if (t.startsWith("|")) {
      const tl = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { tl.push(lines[i].trim()); i++; }
      const data = tl.filter(l => !/^\|[\s\-\:]+\|/.test(l));
      if (data.length >= 2) {
        const hdrs = data[0].split("|").filter((_,ci,a)=>ci>0&&ci<a.length-1).map(c=>c.trim());
        const rows = data.slice(1).filter(l=>/^\|[^-]/.test(l));
        els.push(<div key={"t"+i} style={{ overflowX:"auto", marginBottom:12 }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead><tr>{hdrs.map((h,hi)=><th key={hi} style={{ padding:"8px 12px",
              textAlign:"left", background:T.black, color:T.orange, fontWeight:700,
              fontSize:10, letterSpacing:"0.06em", textTransform:"uppercase",
              fontFamily:"monospace", borderBottom:`2px solid ${T.orange}40` }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((row,ri)=>{
              const cells = row.split("|").filter((_,ci,a)=>ci>0&&ci<a.length-1).map(c=>c.trim());
              return <tr key={ri} style={{ background:ri%2===0?T.white:T.warmGray }}>
                {cells.map((c,ci)=><td key={ci} style={{ padding:"8px 12px",
                  color:ci===0?T.muted:T.text, fontWeight:ci===0?600:400,
                  borderBottom:`1px solid ${T.border}`, lineHeight:1.5 }}>{renderInline(c)}</td>)}
              </tr>;
            })}</tbody>
          </table>
        </div>);
        continue;
      }
    }

    // Bold standalone
    if (t.startsWith("**") && t.endsWith("**") && t.length>4) {
      els.push(<p key={i} style={{ fontSize:14, fontWeight:700, color:T.text,
        marginTop:10, marginBottom:4 }}>{t.slice(2,-2)}</p>);
      i++; continue;
    }

    // Bullet list
    if (t.startsWith("- ") || t.startsWith("* ")) {
      lk++;
      const items = [];
      while (i<lines.length && (lines[i].trim().startsWith("- ")||lines[i].trim().startsWith("* "))) {
        items.push(<li key={i} style={{ fontSize:13, color:T.text, lineHeight:1.7,
          marginBottom:2 }}>{renderInline(lines[i].trim().slice(2))}</li>);
        i++;
      }
      els.push(<ul key={"ul"+lk} style={{ paddingLeft:18, marginBottom:8 }}>{items}</ul>);
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(t) && !sec.includes("next")) {
      lk++;
      const items = [];
      while (i<lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(<li key={i} style={{ fontSize:13, color:T.text, lineHeight:1.7,
          marginBottom:2 }}>{renderInline(lines[i].trim().replace(/^\d+\.\s+/,""))}</li>);
        i++;
      }
      els.push(<ol key={"ol"+lk} start={1} style={{ paddingLeft:22, marginBottom:8,
        listStyleType:"decimal" }}>{items}</ol>);
      continue;
    }

    els.push(<p key={i} style={{ fontSize:13, color:T.muted, lineHeight:1.8,
      marginBottom:3 }}>{renderInline(t)}</p>);
    i++;
  }

  return els;
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
    <div style={{ margin:"24px 0 0", border:`1px solid ${T.border}`, borderRadius:8, overflow:"hidden" }}>
      <button onClick={() => setOpen(!open)} style={{
        width:"100%", background:T.warmGray, border:"none", padding:"10px 16px",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
        <span style={{ fontSize:11, fontWeight:700, color:T.muted, fontFamily:"monospace",
          letterSpacing:"0.1em" }}>TERMS & DATA SOURCES</span>
        <span style={{ fontSize:11, color:T.muted }}>{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {open && (
        <div style={{ padding:"16px 18px", background:T.white }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 24px", marginBottom:16 }}>
            {terms.map(([term, def]) => (
              <div key={term} style={{ display:"flex", gap:8, padding:"5px 0",
                borderBottom:`1px solid ${T.warmGray}`, alignItems:"flex-start" }}>
                <span style={{ fontSize:10, fontWeight:700, color:T.orange,
                  fontFamily:"monospace", minWidth:50, flexShrink:0, paddingTop:1 }}>{term}</span>
                <span style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{def}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:T.muted, fontFamily:"monospace",
            letterSpacing:"0.08em", marginBottom:6 }}>DATA SOURCES</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {sources.map(([label, url, href]) => (
              <a key={label} href={href} target="_blank" style={{
                fontSize:11, color:T.orange, textDecoration:"none",
                border:`1px solid ${T.orange}30`, borderRadius:4, padding:"3px 8px",
                fontFamily:"'DM Sans',sans-serif" }}>
                {label} · {url}
              </a>
            ))}
          </div>
          <div style={{ fontSize:10, color:T.muted, marginTop:12, lineHeight:1.6,
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
    const s=document.createElement("script");s.async=1;s.src=r;document.head.appendChild(s);
    })(window,"posthog","https://us-assets.i.posthog.com/static/array.js");
    window.posthog("init", POSTHOG_KEY, { api_host:"https://us.i.posthog.com", person_profiles:"identified_only" });
    track("page_view");
  }, []);

  // Update jurisdiction when ZIP changes
  useEffect(() => {
    const zip = editZip || parsed?.zip || "";
    if (zip.length === 5) setJurisdiction(detectJurisdiction(zip));
    else setJurisdiction(null);
  }, [editZip, parsed?.zip]);

  const handleGeocode = () => {
    if (!address.trim() || !projectType) return;
    const p = parseAddress(address);
    setParsed(p);
    setEditZip(p.zip || "");  // leave blank if no ZIP detected — don't carry forward
    setEditStreet(p.displayName);
    track("address_submitted", { zip:p.zip, project_type:projectType });
    setStage("confirm");
  };

  const LOADING_STEPS = [
    "Geocoding address...",
    "Querying ZIMAS parcel database...",
    "Checking zoning classification...",
    "Verifying overlay zones...",
    "Building permit roadmap...",
  ];

  const handleAnalyze = async () => {
    if (jurisdiction && !jurisdiction.covered) return;
    setStage("result");
    setLoading(true);
    setLoadingStep(0);
    setError(null);
    setResult(null);
    setFbState(null); setFbDone(false); setFbOpen(false);
    track("analysis_started", { zip:editZip, project_type:projectType, jurisdiction:jurisdiction?.key });

    const stepInterval = setInterval(() => {
      setLoadingStep(s => Math.min(s+1, LOADING_STEPS.length-1));
    }, 1800);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          address: editStreet || parsed?.displayName || address,
          projectType: getLabel(projectType),
          projectDetails: details,
          jurisdiction: jurisdiction?.key || "city-of-la",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Analysis failed."); return; }
      setResult(data.analysis);
      if (data.parcel) setParcel(data.parcel);
      track("analysis_completed", { zip:editZip, project_type:projectType, parcel_verified:!!data.parcel });
    } catch (err) {
      setError("Request failed: " + err.message);
      track("analysis_error", { error:err.message });
    } finally {
      clearInterval(stepInterval);
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
    const lines = result.split("\n");
    let bodyHtml = "", pdfSec = "";
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) { bodyHtml += "<br>"; continue; }
      if (t.startsWith("## ")) { pdfSec = t.slice(3).toLowerCase(); bodyHtml += `<h2>${pdfSec.toUpperCase()}</h2>`; continue; }
      if (t.startsWith("### ")) { bodyHtml += `<h3>${t.slice(4)}</h3>`; continue; }
      if (t.startsWith("VERDICT:")) {
        const pts = t.slice(8).trim().split("|");
        const w=(pts[0]||"").trim(), d=(pts[1]||"").trim();
        const c=w==="GO"?T.green:w==="COMPLEX"?T.red:T.yellow;
        bodyHtml += `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${c}15;border:2px solid ${c};border-radius:8px;margin:8px 0"><span style="font-size:10px;font-weight:800;color:#fff;background:${c};border-radius:4px;padding:2px 10px">${w}</span><span style="font-size:12px;color:#2C2420">${d}</span></div>`;
        continue;
      }
      if (t.includes("|") && /^(CRITICAL|CAUTION|INFO|CLEAR)\s*\|/.test(t)) {
        const pts=t.split("|").map(p=>p.trim());
        const [sev,name2,dollar]=pts;
        const cs={CRITICAL:["#FEF2F2","#b91c1c"],CAUTION:["#FFFBEB","#d97706"],INFO:["#EFF6FF","#2563eb"],CLEAR:["#F0FDF4","#16a34a"]};
        const [bg,bc]=cs[sev]||["#F9FAFB","#6B7280"];
        bodyHtml += `<div style="padding:8px 12px;margin:6px 0;border-radius:6px;border-left:3px solid ${bc};background:${bg}"><span style="font-size:9px;font-weight:800;color:#fff;background:${bc};border-radius:3px;padding:1px 6px;margin-right:8px">${sev}</span><strong>${name2}</strong>${dollar?` <span style="color:#6B7280;font-size:11px">· ${dollar}</span>`:""}</div>`;
        continue;
      }
      if (t.includes("|") && t.split("|").length >= 3) {
        const pts=t.split("|").map(p=>p.trim());
        if (pts.length>=4){
          const [pn,pt2,pa,pti,pc]=pts;
          const tc=pt2==="OTC"?T.green:T.orange;
          bodyHtml+=`<div style="padding:7px 12px;margin:3px 0;background:#F9FAFB;border-radius:5px;display:flex;align-items:center;gap:8px;font-size:12px"><span style="font-weight:600;color:#1A1714;flex:1">${pn}</span><span style="font-size:9px;font-weight:700;color:#fff;background:${tc};border-radius:3px;padding:1px 6px">${pt2}</span><span style="color:#8C7B70">${pa||""} ${pti||""}</span>${pc?`<span style="color:${T.orange};font-weight:600">${pc}</span>`:""}</div>`;
          continue;
        }
        const [dn,dw,ds]=pts;
        const isT=(dn||"").toUpperCase().includes("TOTAL");
        const req=ds&&ds.toUpperCase().includes("YES");
        if(ds&&(ds.toUpperCase().includes("YES")||ds.toUpperCase().includes("NO")||ds.toUpperCase().includes("REQ"))){
          bodyHtml+=`<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #E2D9D0;font-size:12px"><span style="color:#1A1714;flex:1">${dn}</span><span style="color:#8C7B70;min-width:120px">${dw}</span><span style="font-size:9px;font-weight:700;color:#fff;background:${req?"#b91c1c":"#16a34a"};border-radius:3px;padding:1px 6px">STAMP:${req?" REQ":" NOT REQ"}</span></div>`;
        } else {
          bodyHtml+=`<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid ${isT?T.orange:"#E2D9D0"};font-size:12px${isT?";font-weight:700;color:"+T.orange:""}"><span style="flex:1">${dn}</span>${dw&&!isT?`<span style="color:#8C7B70;min-width:100px">${dw}</span>`:""}<span>${ds}</span></div>`;
        }
        continue;
      }
      if (/^Weeks?\s[\d\-–]+:/i.test(t)){const ci=t.indexOf(":");bodyHtml+=`<div style="display:flex;gap:12px;padding:5px 0;border-bottom:1px solid #E2D9D0;font-size:12px"><span style="font-weight:700;color:${T.orange};min-width:80px;font-size:11px;font-family:monospace">${t.slice(0,ci)}</span><span style="color:#2C2420">${t.slice(ci+1).trim()}</span></div>`;continue;}
      if (/^\d+\./.test(t)){const rest2=t.replace(/^\d+\.\s*/,"");const pi=rest2.indexOf("|");const act=pi>0?rest2.slice(0,pi).trim():rest2;const me=pi>0?rest2.slice(pi+1).trim():"";const n2=(t.match(/^\d+/)||[""])[0];bodyHtml+=`<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #E2D9D0;align-items:flex-start"><span style="font-size:10px;font-weight:800;color:#fff;background:${T.orange};border-radius:4px;padding:2px 6px;white-space:nowrap;margin-top:1px">${n2}</span><div><strong style="font-size:12px">${act}</strong>${me?`<span style="display:block;font-size:11px;color:#8C7B70;margin-top:2px">${me}</span>`:""}</div></div>`;continue;}
      if (t.startsWith("- ")||t.startsWith("* ")){bodyHtml+=`<li style="font-size:12px;color:#2C2420;margin:3px 0">${t.slice(2)}</li>`;continue;}
      if (t==="DEMO"||t==="BUILDING"||t.startsWith("TECHNICAL")){bodyHtml+=`<div style="font-size:9px;font-weight:700;color:${T.orange};text-transform:uppercase;letter-spacing:0.1em;margin-top:12px;margin-bottom:4px;font-family:monospace">${t}</div>`;continue;}
      // Skip legal notice — rendered separately as footer disclaimer
      if (pdfSec==="legal notice") continue;
      bodyHtml+=`<p style="font-size:12px;color:#2C2420;margin:4px 0">${t}</p>`;
    }
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Listo_${addrSlug}_${dateSlug}</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:32px;color:#1A1714;font-size:13px;line-height:1.65;counter-reset:page}.header{border-bottom:3px solid ${T.orange};padding-bottom:14px;margin-bottom:20px}.brand{font-size:20px;font-weight:700;color:#1A1714;font-family:Georgia,serif}.brand span{color:${T.orange}}.address-bar{background:${T.orange};color:#1A1714;padding:12px 16px;border-radius:6px;margin:12px 0}.addr-main{font-size:14px;font-weight:700;color:#1A1714;font-family:Georgia,serif}.addr-sub{font-size:11px;color:#2C2420;margin-top:2px;opacity:0.85}h2{font-size:14px;font-weight:700;color:${T.orange};font-family:Georgia,serif;border-bottom:1px solid ${T.orange}30;padding-bottom:4px;margin:18px 0 10px;text-transform:uppercase;letter-spacing:0.05em}h3{font-size:12px;font-weight:700;color:#2C2420;margin:12px 0 6px;background:#F0EBE3;padding:3px 8px;border-radius:4px}ul{padding-left:18px;margin:6px 0}.disclaimer{margin-top:20px;padding:10px 12px;background:#FAF7F2;border:1px solid #E2D9D0;border-radius:6px;font-size:11px;color:#8C7B70;line-height:1.6;font-style:italic}.footer{margin-top:16px;font-size:10px;color:#A8A29C;text-align:center;border-top:1px solid #E2D9D0;padding-top:12px}@media print{body{padding:20px}h2{page-break-before:auto}@page{margin:20mm;@bottom-right{content:"Page " counter(page);font-size:9px;color:#8C7B70;font-family:Arial,sans-serif}}}</style>
</head><body>
<div class="header"><div class="brand">listo<span>.</span></div></div>
<div class="address-bar"><div class="addr-main">${editStreet||address}</div><div class="addr-sub">${label} · ${date}${parcel?" · "+parcel.source:" · ZIP estimates"}${jurisdiction?" · "+jurisdiction.short:""}</div></div>
${bodyHtml}
<div class="disclaimer">AI-generated guidance based on publicly available LA permit data. Always verify with your jurisdiction before submitting. This is not legal advice. Listo makes no warranties regarding accuracy or completeness.</div>
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
    setStage("input"); setResult(null); setAddress(""); setProjectType(""); setDetails("");
    setError(null); setParsed(null); setEditZip(""); setEditStreet(""); setParcel(null);
    setJurisdiction(null); setFbState(null); setFbDone(false); setFbOpen(false);
    setShowAllTypes(false);
  };

  const ready = address.trim().length > 5 && projectType !== "";
  const coverageText = "City of LA · Santa Monica · Beverly Hills · Malibu";

  return (
    <div style={{ fontFamily:"'Georgia',serif", background:T.warmGray, minHeight:"100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');
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
            <span style={{ fontSize:11, color:"#ffffff44", fontStyle:"italic",
              fontFamily:"'DM Sans',sans-serif" }}>Know before you build.</span>
            <span style={{ fontSize:10, color:"#ffffff33", border:"1px solid #ffffff15",
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
                  <div style={{ width:6, height:6, borderRadius:"50%", background:T.lime }} />
                  <span style={{ fontSize:11, color:"#ffffff66", fontFamily:"monospace" }}>
                    NOW LIVE · {coverageText}
                  </span>
                </div>
                <h1 style={{ fontSize:"clamp(38px,6vw,62px)", fontFamily:"'Georgia',serif",
                  color:T.cream, lineHeight:1.1, marginBottom:20, fontWeight:700 }}>
                  Know before<br />you <span style={{ color:T.orange }}>build.</span>
                </h1>
                <p style={{ fontSize:16, color:"#ffffff55", maxWidth:480,
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
                <span style={{ fontSize:10, color:"#ffffff33", fontFamily:"monospace" }}>
                  FREE · AI-POWERED
                </span>
              </div>

              <div style={{ padding:28 }}>
                <h2 style={{ fontSize:20, fontFamily:"'Georgia',serif", color:T.black,
                  marginBottom:6, fontWeight:700 }}>Permit Intelligence Report</h2>
                <p style={{ fontSize:13, color:T.muted, marginBottom:28,
                  fontFamily:"'DM Sans',sans-serif" }}>
                  Enter the project address to get started
                </p>

                {/* Address */}
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:10, color:T.muted, fontFamily:"monospace",
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
                  <label style={{ fontSize:10, color:T.muted, fontFamily:"monospace",
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
                      style={{ background:T.white, color:T.muted }}>
                      {showAllTypes ? "Less ▲" : "More ▼"}
                    </button>
                  </div>
                  {/* Full dropdown */}
                  {showAllTypes && (
                    <select style={{ width:"100%", border:`1px solid ${T.border}`,
                      borderRadius:8, padding:"11px 14px", fontSize:13,
                      color:projectType?T.text:T.muted, background:T.white,
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
                  <label style={{ fontSize:10, color:T.muted, fontFamily:"monospace",
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
                <div style={{ textAlign:"center", fontSize:11, color:T.muted,
                  marginTop:10, fontFamily:"'DM Sans',sans-serif" }}>
                  Results in seconds · AI-generated · Always verify with jurisdiction
                </div>
              </div>
            </div>

            {/* Coverage note */}
            <div style={{ textAlign:"center", fontSize:12, color:T.muted,
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
              color:T.muted, cursor:"pointer", fontSize:13, padding:"0 0 20px",
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
                <p style={{ fontSize:13, color:T.muted, marginBottom:24,
                  fontFamily:"'DM Sans',sans-serif" }}>
                  The <strong style={{ color:T.orange }}>ZIP code</strong> determines jurisdiction, zoning, and permit rules.
                </p>

                {/* Address field */}
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:10, color:T.muted, fontFamily:"monospace",
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
                    ZIP Code <span style={{ fontWeight:300, color:T.muted,
                      textTransform:"none", letterSpacing:0 }}>— double-check this</span>
                  </label>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <input style={{ width:120, border:`2px solid ${editZip.length === 5 ? T.orange : T.red}`,
                      borderRadius:8, padding:"11px 14px", fontSize:22,
                      fontWeight:700, color: editZip.length === 5 ? T.orange : T.red, letterSpacing:"0.12em",
                      textAlign:"center", fontFamily:"'DM Sans',sans-serif" }}
                      type="text" maxLength={5} value={editZip}
                      onChange={e=>setEditZip(e.target.value.replace(/\D/g,"").slice(0,5))}
                      placeholder="90045" />
                    {editZip.length === 5 && <JurisdictionBadge jurisdiction={jurisdiction} />}
                  </div>
                  {!editZip && (
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
                color:T.muted, cursor:"pointer", fontSize:13,
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
                color:T.muted, cursor:"pointer", fontSize:13, padding:"0 0 16px",
                fontFamily:"'DM Sans',sans-serif" }}>← New Search</button>
              {result && <button onClick={handlePrint}
                style={{ background:"none", border:`1px solid ${T.border}`,
                  color:T.muted, cursor:"pointer", fontSize:12, padding:"6px 14px",
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
                <div style={{ fontSize:13, color:"#ffffff44",
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
                      <span style={{ fontSize:12, color: idx <= loadingStep ? T.cream : "#ffffff33",
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
              <div style={{ background:T.white, border:`1px solid ${T.border}`,
                borderRadius:12, overflow:"hidden" }}>
                {/* Report header — black */}
                <div style={{ background:T.black, padding:"18px 28px",
                  display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <Logo size={22} light />
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:10, color:"#ffffff33",
                      fontFamily:"monospace" }}>PERMIT ANALYSIS REPORT</div>
                    <div style={{ fontSize:12, color:"#ffffff55",
                      fontFamily:"monospace" }}>
                      {new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}
                    </div>
                  </div>
                </div>

                {/* Address bar — orange */}
                <div style={{ background:T.orange, padding:"16px 28px" }}>
                  <div style={{ fontSize:10, color:"#ffffff88", fontFamily:"monospace",
                    letterSpacing:"0.12em", marginBottom:4 }}>PROPERTY</div>
                  <div style={{ fontSize:18, fontFamily:"'Georgia',serif",
                    color:T.white, fontWeight:700 }}>{editStreet || address}</div>
                  <div style={{ fontSize:13, color:"#ffffff88",
                    fontFamily:"'DM Sans',sans-serif", marginTop:2,
                    display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                    <span>{getLabel(projectType)}</span>
                    {jurisdiction && <span>· {jurisdiction.short}</span>}
                    {parcel?.lotSizeSf && <span>· {parcel.lotSizeSf.toLocaleString()} sf</span>}
                    <span style={{ fontSize:10, background:"#ffffff20",
                      borderRadius:10, padding:"1px 8px" }}>
                      {parcel?.hasData ? "ZIMAS verified" : "ZIP estimates"}
                    </span>
                  </div>
                </div>

                {/* Section nav */}
                <div style={{ borderBottom:`1px solid ${T.border}`,
                  padding:"0 28px", overflowX:"auto", display:"flex",
                  gap:0 }} className="no-print">
                  {["Project Overview","Zone Alerts","Development Standards","Zoning & Density","Permit Roadmap",
                    "Fee Summary","Timeline","Next Steps"].map(sec => (
                    <a key={sec}
                      href={"#sec-"+sec.toLowerCase().replace(/[^a-z0-9]+/g,"-")}
                      style={{ fontSize:11, color:T.muted, padding:"10px 16px",
                        textDecoration:"none", whiteSpace:"nowrap",
                        fontFamily:"monospace", letterSpacing:"0.04em",
                        borderBottom:`2px solid transparent`,
                        display:"inline-block" }}
                      onMouseEnter={e=>e.target.style.color=T.orange}
                      onMouseLeave={e=>e.target.style.color=T.muted}>
                      {sec}
                    </a>
                  ))}
                </div>

                {/* Report body */}
                <div style={{ padding:"28px 28px 0" }}>
                  <ReportMarkdown text={result} jurisdiction={jurisdiction} />
                </div>

                {/* Acronym legend */}
                <div style={{ padding:"0 28px" }} className="no-print">
                  <AcronymLegend jurisdiction={jurisdiction} />
                </div>

                {/* Listo Summary box */}
                <div style={{ margin:"24px 28px 0", background:T.black,
                  borderRadius:10, padding:"20px 24px" }}>
                  <div style={{ fontSize:10, color:T.orange, fontFamily:"monospace",
                    letterSpacing:"0.12em", marginBottom:10 }}>LISTO SUMMARY</div>
                  <p style={{ fontSize:14, color:T.cream, lineHeight:1.8, margin:0 }}>
                    AI-generated guidance based on publicly available{" "}
                    {jurisdiction?.name || "LA"} permit data. Always verify with{" "}
                    <strong style={{ color:T.lime }}>{jurisdiction?.agency || "LADBS"}</strong>{" "}
                    ({jurisdiction?.applyUrl || jurisdiction?.agencyUrl ? (
                      <a href={jurisdiction.applyUrl || jurisdiction.agencyUrl} target="_blank"
                        style={{ color:T.lime }}>{(jurisdiction.applyUrl || jurisdiction.agencyUrl).replace("https://","")}</a>
                    ) : "ladbs.org"}) before proceeding.
                    This is not legal advice.
                  </p>
                </div>

                {/* CTAs — Share + PDF */}
                <div style={{ padding:"16px 28px", display:"flex",
                  justifyContent:"space-between", alignItems:"center",
                  flexWrap:"wrap", gap:10 }} className="no-print">
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <div style={{ position:"relative" }}>
                      <button onClick={handleShare}
                        style={{ display:"flex", alignItems:"center", gap:8,
                          background:T.lime, color:T.black, border:"none",
                          borderRadius:8, padding:"10px 20px", fontSize:13,
                          fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth={2}>
                          <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
                        </svg>
                        Share Report
                      </button>
                      {shareToast && (
                        <div style={{ position:"absolute", bottom:"calc(100% + 8px)", left:"50%",
                          transform:"translateX(-50%)", background:T.black, color:T.lime,
                          fontSize:11, padding:"5px 12px", borderRadius:6, whiteSpace:"nowrap",
                          fontFamily:"'DM Sans',sans-serif", border:`1px solid ${T.lime}40` }}>
                          ✓ Copied to clipboard
                        </div>
                      )}
                    </div>
                    <button onClick={handlePrint}
                      style={{ display:"flex", alignItems:"center", gap:8,
                        background:T.warmGray, color:T.text, border:`1px solid ${T.border}`,
                        borderRadius:8, padding:"10px 20px", fontSize:13,
                        fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth={2}>
                        <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                      </svg>
                      Export PDF
                    </button>
                  </div>
                  <button onClick={() => window.open(jurisdiction?.applyUrl || jurisdiction?.agencyUrl || "https://www.ladbs.org/permits-inspections/apply-for-a-permit","_blank")}
                    style={{ display:"flex", alignItems:"center", gap:6,
                      background:"transparent", border:`1px solid ${T.border}`,
                      color:T.muted, borderRadius:8, padding:"10px 16px",
                      fontSize:12, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                    Apply at {jurisdiction?.agency||"LADBS"} →
                  </button>
                </div>

                {/* Feedback */}
                <div style={{ padding:"16px 28px 24px", borderTop:`1px solid ${T.border}` }}
                  className="no-print">
                  {!fbDone ? (<>
                    <div style={{ fontSize:13, color:T.muted, marginBottom:10,
                      fontFamily:"'DM Sans',sans-serif" }}>Was this analysis accurate and useful?</div>
                    <div style={{ display:"flex", gap:8, marginBottom:fbOpen?14:0 }}>
                      <button onClick={() => { setFbState("up"); submitFeedback("up"); }}
                        style={{ fontSize:13, background:fbState==="up"?"#F0FDF4":T.white,
                          border:`1px solid ${fbState==="up"?"#BBF7D0":T.border}`,
                          color:fbState==="up"?T.green:T.muted, borderRadius:8,
                          padding:"8px 16px", cursor:"pointer",
                          fontFamily:"'DM Sans',sans-serif" }}>
                        ✓ Accurate
                      </button>
                      <button onClick={() => { setFbState("down"); setFbOpen(true); }}
                        style={{ fontSize:13, background:fbState==="down"?"#FEF2F2":T.white,
                          border:`1px solid ${fbState==="down"?"#FECACA":T.border}`,
                          color:fbState==="down"?T.red:T.muted, borderRadius:8,
                          padding:"8px 16px", cursor:"pointer",
                          fontFamily:"'DM Sans',sans-serif" }}>
                        Something's wrong
                      </button>
                    </div>
                    {fbOpen && (
                      <div style={{ marginTop:12 }}>
                        <textarea style={{ width:"100%", border:`1px solid ${T.border}`,
                          borderRadius:8, padding:"11px 14px", fontSize:13,
                          color:T.text, height:80, resize:"vertical",
                          fontFamily:"'DM Sans',sans-serif" }}
                          placeholder="What was wrong or missing?"
                          value={fbComment} onChange={e=>setFbComment(e.target.value)} />
                        <button className="btn-primary"
                          style={{ width:"auto", padding:"10px 24px", fontSize:13, marginTop:8 }}
                          onClick={() => submitFeedback("down", fbComment)}>
                          Submit Feedback
                        </button>
                      </div>
                    )}
                  </>) : (
                    <div style={{ fontSize:13, color:T.green,
                      fontFamily:"'DM Sans',sans-serif" }}>
                      Thanks — feedback received. This helps us improve accuracy.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer style={{ borderTop:`1px solid ${T.border}`, padding:"16px 24px",
        textAlign:"center", fontSize:11, color:T.muted,
        fontFamily:"'DM Sans',sans-serif" }} className="no-print">
        listo.zone · City of LA · Santa Monica · Beverly Hills · Malibu
        {" · "}Not affiliated with LADBS or any city building department.
        {" · "}Always consult a licensed professional.
      </footer>
    </div>
  );
}
