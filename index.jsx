import { useState, useEffect } from "react";

// ── PostHog analytics ────────────────────────────────────────────────────
const POSTHOG_KEY = "phc_Gbq7s2JDLrsyaRC2X3jP9PmMEBclWGloKzzL29XZRhv";
const POSTHOG_HOST = "https://us.i.posthog.com";

function track(event, props = {}) {
  if (typeof window === "undefined" || !window.posthog) return;
  try { window.posthog.capture(event, props); } catch (_) {}
}

// ── Brand tokens ─────────────────────────────────────────────────────────
const B = {
  orange:   "#E8620A",
  orangeD:  "#C4520A",
  black:    "#1A1714",
  cream:    "#FAF7F2",
  lime:     "#C8F135",
  warmGray: "#F0EBE3",
  gray1:    "#2C2825",
  gray2:    "#6B6560",
  gray3:    "#A8A29C",
  gray4:    "#D4CEC8",
  white:    "#FFFFFF",
  // Status colors — muted, professional
  go:       { bg:"#0A1F0A", border:"#16a34a", text:"#22c55e", badge:"#14532d" },
  caution:  { bg:"#1A1200", border:"#78716c", text:"#d6d3d1", badge:"#292524" },
  complex:  { bg:"#1A0808", border:"#b91c1c", text:"#fca5a5", badge:"#3b0e0e" },
  info:     { bg:"#0A1020", border:"#334155", text:"#94a3b8", badge:"#0f172a" },
};

// ── Project Types ─────────────────────────────────────────────────────────
const PROJECT_TYPES = [
  { group: "ADU & Additions", items: [
    { value: "adu",         label: "ADU - Accessory Dwelling Unit" },
    { value: "jadu",        label: "JADU - Junior ADU (max 500 sf, within existing)" },
    { value: "addition",    label: "Room Addition / Home Expansion" },
    { value: "new_construction", label: "New Home Construction" },
  ]},
  { group: "Remodels", items: [
    { value: "whole_house_remodel", label: "Whole-House Remodel" },
    { value: "kitchen_remodel",     label: "Kitchen Remodel" },
    { value: "bathroom_remodel",    label: "Bathroom Remodel" },
    { value: "interior_remodel",    label: "Interior Remodel (non-structural)" },
    { value: "garage_conversion",   label: "Garage Conversion / ADU Conversion" },
  ]},
  { group: "Structural", items: [
    { value: "structural_modification", label: "Structural Modification / Load-Bearing Wall" },
    { value: "seismic_retrofit",        label: "Seismic Retrofit / Soft-Story" },
    { value: "foundation",              label: "Foundation Work / Repair" },
    { value: "demolition",              label: "Demolition (full or partial)" },
  ]},
  { group: "Exterior & Site", items: [
    { value: "deck_patio",      label: "Deck / Patio / Pergola" },
    { value: "pool_spa",        label: "Swimming Pool / Spa" },
    { value: "fence_wall",      label: "Fence / Garden Wall (up to 6 ft)" },
    { value: "retaining_wall",  label: "Retaining Wall / Site Wall (over 4 ft)" },
    { value: "grading",         label: "Grading / Excavation / Slope Work" },
    { value: "hardscape",       label: "Hardscape / Driveway / Landscaping" },
  ]},
  { group: "Systems", items: [
    { value: "roof",        label: "Roof Replacement / Repair" },
    { value: "solar",       label: "Solar / Battery Storage Installation" },
    { value: "electrical",  label: "Electrical Work / Panel Upgrade" },
    { value: "plumbing",    label: "Plumbing Work" },
    { value: "hvac",        label: "HVAC / AC Installation" },
    { value: "window_door", label: "Window / Door Replacement" },
  ]},
  { group: "Commercial", items: [
    { value: "commercial_tenant", label: "Commercial Tenant Improvement" },
    { value: "sign",              label: "Sign Installation" },
  ]},
];

const allTypes = PROJECT_TYPES.flatMap(g => g.items);
function getLabel(value) { return allTypes.find(p => p.value === value)?.label || value; }

// ── Overlay zone detection ────────────────────────────────────────────────
const OVERLAYS = {
  coastal:  { zips: ["90291","90292","90293","90272","90265","90266","90254","90277","90278","90731","90732","90245","90710","90740","90803","90802"], label: "Coastal Zone",        color: "#1e40af", bg: "#dbeafe", desc: "CA Coastal Commission permit required. Adds 3-6 months." },
  hillside: { zips: ["90046","90068","90069","90077","90210","90049","90027","90039","91302","91364","91356"], label: "Hillside Area",        color: "#92400e", bg: "#fef3c7", desc: "Hillside Construction Regulations apply. Grading permit likely required." },
  historic: { zips: ["90004","90005","90027","90036","90019","90018","90008"], label: "Historic Preservation", color: "#5b21b6", bg: "#ede9fe", desc: "HPOZ area. Design changes require LAHP review." },
  fire:     { zips: ["90046","90068","90069","90077","90210","90049","91302","91364","91356","90265","90266","90272"], label: "Fire Hazard Zone",     color: "#991b1b", bg: "#fee2e2", desc: "LAFD Fire Hazard Severity Zone. Fire-rated materials required." },
  hoa:      { zips: ["90049","90077","90272","90210","90024","90064","90025"], label: "High-HOA Area",        color: "#065f46", bg: "#d1fae5", desc: "Active HOAs with design review BEFORE LADBS submittal. Adds 4-8 weeks." },
};
function detectOverlays(zip) {
  if (!zip) return [];
  return Object.entries(OVERLAYS).filter(([,z]) => z.zips.includes(zip)).map(([key,z]) => ({ key, ...z }));
}

// ── Address parser (client-side, no API) ─────────────────────────────────
function parseAddress(raw) {
  const s = raw.trim();
  const zip = (s.match(/\b(\d{5})\b/) || [])[1] || "";
  const HOODS = ["Playa Del Rey","Playa del Rey","Marina del Rey","Venice","Westchester","Pacific Palisades","Brentwood","Bel Air","Westwood","Mar Vista","Silver Lake","Echo Park","Hancock Park","Los Feliz","Hollywood Hills","Laurel Canyon","North Hollywood","Sherman Oaks","Studio City","Encino","Woodland Hills","Century City","Culver City"];
  const CITIES = ["Los Angeles","West Hollywood","Santa Monica","Burbank","Glendale","Pasadena","Long Beach","Malibu","Calabasas","Beverly Hills"];
  let city = "", neighborhood = "";
  for (const n of HOODS) { if (s.toLowerCase().includes(n.toLowerCase())) { neighborhood = n; city = "Los Angeles"; break; } }
  if (!city) { for (const c of CITIES) { if (s.toLowerCase().includes(c.toLowerCase())) { city = c; break; } } }
  if (!city) city = "Los Angeles";
  return { displayName: [s.split(",")[0].trim(), neighborhood || city, "CA", zip].filter(Boolean).join(", "), city, zip, neighborhood };
}

// ── Markdown renderer ─────────────────────────────────────────────────────
function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2,-2)}</strong> : p
  );
}

function Markdown({ text }) {
  const lines = text.split("\n");
  const els = [];
  let i = 0, lk = 0, sec = "";

  const permitBadge = t => {
    const u = (t||"").toUpperCase();
    if (u === "OTC") return { label:"OTC", bg:"#0A1F0A", color:"#22c55e", border:"#16a34a" };
    if (u.includes("SPECIAL")) return { label:"SPECIAL", bg:"#1A0A00", color:"#fb923c", border:"#c2410c" };
    return { label:"PLAN CHECK", bg:"#0A1020", color:"#60a5fa", border:"#2563eb" };
  };

  const alertCol = sev => {
    const s = (sev||"").toUpperCase();
    if (s === "CRITICAL") return B.complex;
    if (s === "CAUTION") return { bg:"#0F0E08", border:"#854d0e", text:"#fcd34d", badge:"#292409" };
    if (s === "CLEAR") return B.go;
    return B.info;
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (t.startsWith("## ")) {
      sec = t.slice(3).toLowerCase();
      const id = "sec-" + sec.replace(/[^a-z0-9]+/g,"-").replace(/-+$/,"");
      els.push(<div key={"h2"+i} id={id} style={{ marginTop:32, marginBottom:14, scrollMarginTop:80 }}><h2 style={S.h2}>{t.slice(3)}</h2></div>);
      i++; continue;
    }
    if (t.startsWith("### ")) { els.push(<h3 key={i} style={S.h3}>{renderInline(t.slice(4))}</h3>); i++; continue; }
    if (!t || t === "---") { els.push(<div key={i} style={{ height:"5px" }} />); i++; continue; }

    // VERDICT badge
    if (t.startsWith("VERDICT:")) {
      const pts = t.slice(8).trim().split("|").map(p=>p.trim());
      const word = pts[0], desc = pts[1]||"";
      const col = word==="GO" ? B.go : word==="COMPLEX" ? B.complex : B.caution;
      els.push(<div key={i} style={{ display:"flex",alignItems:"center",gap:12,padding:"13px 16px",background:col.bg,border:`1px solid ${col.border}`,borderRadius:10,marginBottom:10 }}>
        <span style={{ fontSize:13,fontWeight:900,color:col.text,letterSpacing:"0.1em",background:col.badge,borderRadius:6,padding:"4px 14px",whiteSpace:"nowrap" }}>{word}</span>
        <span style={{ fontSize:13,color:"#94a3b8",lineHeight:1.5 }}>{desc}</span>
      </div>);
      i++; continue;
    }

    // KPI rows (Deal Summary)
    if (sec.includes("deal")) {
      const KPI = ["ZONING:","UNITS:","PERMITS:","ALERTS:","DATA:"];
      const kpi = KPI.find(k => t.startsWith(k));
      if (kpi) {
        const label = kpi.slice(0,-1);
        const val = t.slice(kpi.length).trim();
        els.push(<div key={i} style={{ display:"flex",gap:10,padding:"9px 0",borderBottom:`1px solid ${B.gray1}`,alignItems:"flex-start" }}>
          <span style={{ fontSize:11,fontWeight:700,color:label==="ALERTS"?"#f87171":B.gray2,textTransform:"uppercase",letterSpacing:"0.08em",minWidth:70,paddingTop:2,flexShrink:0 }}>{label}</span>
          <span style={{ fontSize:13,color:B.cream,lineHeight:1.5,flex:1 }}>{renderInline(val)}</span>
        </div>);
        i++; continue;
      }
    }

    // Alert rows
    if (sec.includes("alert") && t.includes("|") && t.split("|").length >= 2) {
      const [sev,name,dollar,time] = t.split("|").map(p=>p.trim());
      const col = alertCol(sev);
      let desc = "";
      if (i+1 < lines.length && !lines[i+1].trim().includes("|") && lines[i+1].trim()) { desc = lines[i+1].trim(); i++; }
      els.push(<div key={i} style={{ background:col.bg,border:`1px solid ${col.border}`,borderLeft:`4px solid ${col.border}`,borderRadius:10,padding:"14px 16px",marginBottom:10 }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:desc?6:0 }}>
          <span style={{ fontSize:10,fontWeight:800,letterSpacing:"0.1em",background:col.badge,color:col.text,borderRadius:4,padding:"2px 8px" }}>{sev}</span>
          <span style={{ fontSize:13,fontWeight:600,color:B.cream,flex:1 }}>{name}</span>
          {dollar && <span style={{ fontSize:12,color:col.text,fontWeight:500 }}>{dollar}</span>}
          {time && <span style={{ fontSize:12,color:B.gray2 }}>+{time}</span>}
        </div>
        {desc && <p style={{ fontSize:13,color:"#94a3b8",lineHeight:1.6,margin:0 }}>{desc}</p>}
      </div>);
      i++; continue;
    }

    // Permit roadmap cards
    if ((sec.includes("roadmap")||sec.includes("permit roadmap")) && t.includes("|") && t.split("|").length >= 3) {
      const [name,type,agency,time,cost] = t.split("|").map(p=>p.trim());
      const b = permitBadge(type);
      els.push(<div key={i} style={{ background:B.gray1,border:`1px solid #2C2825`,borderRadius:10,padding:"12px 16px",marginBottom:8 }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6 }}>
          <span style={{ fontSize:13,fontWeight:600,color:B.cream,flex:1 }}>{name}</span>
          <span style={{ fontSize:10,fontWeight:700,letterSpacing:"0.08em",background:b.bg,color:b.color,border:`1px solid ${b.border}`,borderRadius:4,padding:"2px 8px" }}>{b.label}</span>
        </div>
        <div style={{ display:"flex",flexWrap:"wrap",gap:14 }}>
          {agency && <span style={{ fontSize:12,color:B.gray2 }}>{agency}</span>}
          {time && <span style={{ fontSize:12,color:B.gray3 }}>{time}</span>}
          {cost && <span style={{ fontSize:12,color:B.orange,fontWeight:600 }}>{cost}</span>}
        </div>
      </div>);
      i++; continue;
    }

    // Density / zoning metric cards
    if (sec.includes("zoning") && !sec.includes("alert")) {
      if (t.startsWith("DENSITY MATH:")) {
        els.push(<div key={i} style={{ background:"#0A1F0A",border:`2px solid #16a34a`,borderRadius:10,padding:"14px 18px",marginBottom:10,marginTop:8 }}>
          <div style={{ fontSize:10,fontWeight:700,color:"#4ade80",letterSpacing:"0.12em",marginBottom:4 }}>DENSITY MATH</div>
          <div style={{ fontSize:20,fontWeight:700,color:"#22c55e",lineHeight:1.3,fontFamily:"Georgia,serif" }}>{t.slice(13).trim()}</div>
        </div>);
        i++; continue;
      }
      if (t.startsWith("MAX BUILDOUT:")) {
        els.push(<div key={i} style={{ background:"#1A1200",border:`2px solid ${B.orange}`,borderRadius:10,padding:"14px 18px",marginBottom:10 }}>
          <div style={{ fontSize:10,fontWeight:700,color:B.orange,letterSpacing:"0.12em",marginBottom:4 }}>MAX BUILDOUT</div>
          <div style={{ fontSize:20,fontWeight:700,color:B.orange,lineHeight:1.3,fontFamily:"Georgia,serif" }}>{t.slice(13).trim()}</div>
        </div>);
        i++; continue;
      }
      if (t.startsWith("TOC BONUS:")) {
        const val = t.slice(10).trim();
        const eligible = !/not applicable|not eligible|not located/i.test(val);
        els.push(<div key={i} style={{ background:eligible?"#0A1020":"#111",border:`1px solid ${eligible?"#2563eb":"#2C2825"}`,borderRadius:8,padding:"10px 14px",marginBottom:8 }}>
          <span style={{ fontSize:10,fontWeight:700,color:eligible?"#60a5fa":B.gray2,letterSpacing:"0.1em",marginRight:8 }}>TOC BONUS</span>
          <span style={{ fontSize:13,color:eligible?"#93c5fd":B.gray2 }}>{val}</span>
        </div>);
        i++; continue;
      }
      if (t.startsWith("ADU:")) {
        els.push(<div key={i} style={{ background:"#080e18",border:"1px solid #1e3a5f",borderRadius:8,padding:"10px 14px",marginBottom:8 }}>
          <span style={{ fontSize:10,fontWeight:700,color:"#60a5fa",letterSpacing:"0.1em",marginRight:8 }}>ADU</span>
          <span style={{ fontSize:13,color:"#94a3b8" }}>{t.slice(4).trim()}</span>
        </div>);
        i++; continue;
      }
      if (t.startsWith("EXISTING STRUCTURE:")) {
        els.push(<div key={i} style={{ background:B.gray1,border:`1px solid #2C2825`,borderRadius:8,padding:"10px 14px",marginBottom:8 }}>
          <span style={{ fontSize:10,fontWeight:700,color:B.gray2,letterSpacing:"0.1em",marginRight:8 }}>EXISTING</span>
          <span style={{ fontSize:13,color:B.gray3 }}>{t.slice(19).trim()}</span>
        </div>);
        i++; continue;
      }
    }

    // Doc rows
    if (sec.includes("document") && t.includes("|")) {
      const [name,who,stamp] = t.split("|").map(p=>p.trim());
      const req = stamp && stamp.toUpperCase().includes("YES");
      els.push(<div key={i} style={{ display:"flex",gap:8,padding:"7px 0",borderBottom:`1px solid #1A1714`,alignItems:"center",flexWrap:"wrap" }}>
        <span style={{ fontSize:13,color:B.cream,flex:1,minWidth:160 }}>{name}</span>
        <span style={{ fontSize:12,color:B.gray2,minWidth:130 }}>{who}</span>
        {stamp && <span style={{ fontSize:10,fontWeight:700,color:req?"#fb923c":"#34d399",background:req?"#1a0a00":"#061a0a",border:`1px solid ${req?"#c2410c":"#16a34a"}`,borderRadius:4,padding:"2px 8px",whiteSpace:"nowrap" }}>STAMP: {req?"REQUIRED":"NOT REQUIRED"}</span>}
      </div>);
      i++; continue;
    }

    // Fee rows
    if (sec.includes("fee") && t.includes("|")) {
      const [name,basis,range] = t.split("|").map(p=>p.trim());
      const isTotal = (name||"").toUpperCase().includes("TOTAL");
      els.push(<div key={i} style={{ display:"flex",gap:8,padding:"7px 0",borderBottom:`1px solid ${isTotal?B.orange+"50":"#1A1714"}`,background:isTotal?"#1A0E00":"transparent",paddingLeft:isTotal?8:0,paddingRight:isTotal?8:0,borderRadius:isTotal?6:0,marginTop:isTotal?4:0 }}>
        <span style={{ fontSize:13,color:isTotal?B.orange:B.gray3,flex:1,fontWeight:isTotal?700:400 }}>{name}</span>
        {basis && !isTotal && <span style={{ fontSize:11,color:B.gray1,minWidth:120 }}>{basis}</span>}
        <span style={{ fontSize:13,color:isTotal?B.orange:B.gray2,fontWeight:isTotal?700:500,whiteSpace:"nowrap" }}>{range}</span>
      </div>);
      i++; continue;
    }

    // Timeline rows
    if (sec.includes("timeline")) {
      const wm = t.match(/^(Weeks?\s[\d\-–]+)\s*:\s*(.+)$/i);
      if (wm) {
        els.push(<div key={i} style={{ display:"flex",gap:12,padding:"8px 0",borderBottom:`1px solid ${B.gray1}`,alignItems:"flex-start" }}>
          <span style={{ fontSize:11,fontWeight:700,color:B.orange,whiteSpace:"nowrap",minWidth:96,paddingTop:2,flexShrink:0 }}>{wm[1]}</span>
          <span style={{ fontSize:13,color:B.gray2,lineHeight:1.6 }}>{renderInline(wm[2])}</span>
        </div>);
        i++; continue;
      }
      if (t.startsWith("BEST CASE:") || t.startsWith("WORST CASE:")) {
        els.push(<div key={i} style={{ display:"flex",gap:8,alignItems:"center",padding:"7px 0" }}>
          <span style={{ fontSize:11,fontWeight:700,color:B.gray2,letterSpacing:"0.06em",minWidth:90 }}>{t.startsWith("BEST")?"BEST CASE":"WORST CASE"}</span>
          <span style={{ fontSize:13,color:t.startsWith("BEST")?"#22c55e":"#f87171",fontWeight:700 }}>{t.slice(t.indexOf(":")+1).trim()}</span>
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
      els.push(<div key={i} style={{ display:"flex",gap:12,padding:"10px 0",borderBottom:`1px solid ${B.gray1}`,alignItems:"flex-start" }}>
        <span style={{ fontSize:11,fontWeight:800,color:B.black,background:B.orange,borderRadius:4,padding:"2px 7px",whiteSpace:"nowrap",flexShrink:0,marginTop:1 }}>{num}</span>
        <div>
          <p style={{ fontSize:13,color:B.cream,fontWeight:500,margin:0,lineHeight:1.5 }}>{renderInline(action)}</p>
          {meta && <p style={{ fontSize:12,color:B.gray2,margin:"2px 0 0",lineHeight:1.5 }}>{renderInline(meta)}</p>}
        </div>
      </div>);
      i++; continue;
    }

    // Legal notice
    if (sec.includes("legal")) {
      els.push(<div key={i} style={{ padding:"14px 16px",background:B.black,border:`1px solid ${B.gray1}`,borderRadius:8,fontSize:12,color:B.gray2,lineHeight:1.75,fontStyle:"italic" }}>{renderInline(t)}</div>);
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
        els.push(<div key={"t"+i} style={{ overflowX:"auto",marginBottom:12 }}>
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
            <thead><tr>{hdrs.map((h,hi)=><th key={hi} style={{ padding:"8px 12px",textAlign:"left",background:B.gray1,color:B.orange,fontWeight:700,fontSize:11,letterSpacing:"0.06em",textTransform:"uppercase",borderBottom:`2px solid ${B.orange}40`,whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((row,ri)=>{
              const cells = row.split("|").filter((_,ci,a)=>ci>0&&ci<a.length-1).map(c=>c.trim());
              return <tr key={ri} style={{ background:ri%2===0?B.black:B.gray1 }}>{cells.map((c,ci)=><td key={ci} style={{ padding:"8px 12px",color:ci===0?B.gray3:B.cream,fontWeight:ci===0?600:400,borderBottom:`1px solid ${B.gray1}`,lineHeight:1.5 }}>{renderInline(c)}</td>)}</tr>;
            })}</tbody>
          </table>
        </div>);
        continue;
      }
    }

    // Bold line
    if (t.startsWith("**") && t.endsWith("**") && t.length>4) {
      els.push(<p key={i} style={{ fontSize:14,fontWeight:700,color:B.cream,marginTop:12,marginBottom:4 }}>{t.slice(2,-2)}</p>);
      i++; continue;
    }

    // Bullet
    if (t.startsWith("- ") || t.startsWith("* ")) {
      lk++;
      const items = [];
      while (i<lines.length && (lines[i].trim().startsWith("- ")||lines[i].trim().startsWith("* "))) {
        items.push(<li key={i} style={S.li}>{renderInline(lines[i].trim().slice(2))}</li>); i++;
      }
      els.push(<ul key={"ul"+lk} style={S.ul}>{items}</ul>);
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(t)) {
      lk++;
      const items = [];
      while (i<lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(<li key={i} style={S.li}>{renderInline(lines[i].trim().replace(/^\d+\.\s+/,""))}</li>); i++;
      }
      els.push(<ol key={"ol"+lk} start={1} style={{ ...S.ul,listStyleType:"decimal",paddingLeft:22 }}>{items}</ol>);
      continue;
    }

    els.push(<p key={i} style={S.p}>{renderInline(t)}</p>);
    i++;
  }
  return els;
}

// ── Main app ─────────────────────────────────────────────────────────────
export default function Listo() {
  const [address, setAddress]       = useState("");
  const [projectType, setProjectType] = useState("");
  const [details, setDetails]       = useState("");
  const [stage, setStage]           = useState("input"); // input | confirm | result
  const [parsed, setParsed]         = useState(null);
  const [editZip, setEditZip]       = useState("");
  const [editStreet, setEditStreet] = useState("");
  const [result, setResult]         = useState(null);
  const [parcel, setParcel]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [fbState, setFbState]       = useState(null); // null | "up" | "down"
  const [fbComment, setFbComment]   = useState("");
  const [fbDone, setFbDone]         = useState(false);
  const [fbOpen, setFbOpen]         = useState(false);

  // PostHog bootstrap
  useEffect(() => {
    if (typeof window === "undefined") return;
    (function(c,a,r,g,o,s){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    s=document.createElement("script");s.async=1;s.src=r;document.head.appendChild(s);
    })(window,"posthog","https://us-assets.i.posthog.com/static/array.js");
    window.posthog("init", POSTHOG_KEY, { api_host: POSTHOG_HOST, person_profiles: "identified_only" });
    track("page_view");
  }, []);

  const handleGeocode = () => {
    if (!address.trim() || !projectType) return;
    const p = parseAddress(address);
    setParsed(p);
    setEditZip(p.zip);
    setEditStreet(p.displayName);
    track("address_submitted", { zip: p.zip });
    setStage("confirm");
  };

  const handleAnalyze = async () => {
    setStage("result");
    setLoading(true);
    setError(null);
    setResult(null);
    setFbState(null); setFbDone(false); setFbOpen(false);
    track("analysis_started", { zip: editZip, project_type: projectType });

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: editStreet || parsed?.displayName || address,
          projectType: getLabel(projectType),
          projectDetails: details,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Analysis failed."); return; }
      setResult(data.analysis);
      if (data.parcel) setParcel(data.parcel);
      track("analysis_completed", { zip: editZip, project_type: projectType, parcel_verified: !!data.parcel });
    } catch (err) {
      setError("Request failed: " + err.message);
      track("analysis_error", { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (vote, comment = "") => {
    setFbDone(true); setFbOpen(false);
    track("feedback_submitted", { vote, zip: editZip, project_type: projectType });
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: editStreet || address,
          projectType: getLabel(projectType),
          feedback: comment || (vote === "up" ? "Accurate" : "Flagged as inaccurate"),
          rating: vote === "up" ? 5 : 2,
        }),
      });
    } catch (_) {}
  };

  const handlePrint = () => {
    if (!result) return;
    const label = getLabel(projectType);
    const date = new Date().toLocaleDateString("en-US", { year:"numeric",month:"long",day:"numeric" });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Listo — ${editStreet || address}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px 32px;color:#1A1714;font-size:14px;line-height:1.7}
  .header{border-bottom:3px solid #E8620A;padding-bottom:20px;margin-bottom:28px}
  .brand{font-size:24px;font-weight:700;color:#1A1714;font-family:Georgia,serif}
  .brand span{color:#E8620A}
  .address{font-size:16px;font-weight:600;margin:10px 0 4px}
  .meta{font-size:12px;color:#6B6560}
  h2{font-size:17px;font-weight:700;color:#1A1714;font-family:Georgia,serif;border-bottom:2px solid #E8620A;padding-bottom:6px;margin:28px 0 12px}
  h3{font-size:15px;font-weight:600;color:#2C2825;margin:20px 0 8px}
  p{margin:6px 0;color:#2C2825}
  ul,ol{padding-left:22px;margin:8px 0}
  li{margin:4px 0}
  strong{color:#1A1714}
  .disclaimer{margin-top:40px;padding:14px 16px;background:#FAF7F2;border:1px solid #F0EBE3;border-radius:8px;font-size:12px;color:#6B6560;line-height:1.65;font-style:italic}
  .footer{margin-top:24px;font-size:11px;color:#A8A29C;text-align:center;border-top:1px solid #F0EBE3;padding-top:16px}
  @media print{body{padding:20px}}
</style>
</head><body>
<div class="header">
  <div class="brand">listo<span>.</span></div>
  <div class="address">${editStreet || address}</div>
  <div class="meta">${label} &nbsp;·&nbsp; ${date}${parcel ? " &nbsp;·&nbsp; " + parcel.source : ""}</div>
</div>
${result.replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/^- (.+)$/gm,"<li>$1</li>").replace(/\n/g,"<br>")}
<div class="disclaimer">AI-generated guidance based on publicly available LA permit data. Always verify with your jurisdiction before submitting. This is not legal advice.</div>
<div class="footer">listo.zone &nbsp;·&nbsp; Not affiliated with the City of Los Angeles or LADBS</div>
</body></html>`;
    const win = window.open("","_blank","width=900,height=700");
    if (!win) { alert("Allow pop-ups to export PDF"); return; }
    win.document.write(html); win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 400);
    track("pdf_exported");
  };

  const reset = () => {
    setStage("input"); setResult(null); setAddress(""); setProjectType(""); setDetails("");
    setError(null); setParsed(null); setEditZip(""); setEditStreet(""); setParcel(null);
    setFbState(null); setFbDone(false); setFbOpen(false);
  };

  const overlays = detectOverlays(editZip || parsed?.zip || "");
  const ready = address.trim().length > 5 && projectType !== "";

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::selection{background:${B.orange};color:${B.white}}
        input:focus,select:focus,textarea:focus{outline:none;border-color:${B.orange}!important}
        .btn-primary:hover:not(:disabled){background:${B.orangeD}!important;transform:translateY(-1px)}
        .btn-primary:disabled{opacity:.4;cursor:not-allowed}
        .btn-ghost:hover{color:${B.orange}!important}
        input::placeholder,textarea::placeholder{color:${B.gray2}}
        select option{background:${B.black};color:${B.cream}}
        select optgroup{background:${B.black};color:${B.gray2};font-style:normal;font-size:11px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        .fade-up{animation:fadeUp .4s ease forwards}
        .fade-up-2{animation:fadeUp .4s ease .1s forwards;opacity:0}
        .fade-up-3{animation:fadeUp .4s ease .22s forwards;opacity:0}
        .pulse-a{animation:pulse 1.6s ease-in-out infinite}
        @media print{.no-print{display:none!important}}
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={S.header} className="no-print">
        <div style={S.headerInner}>
          <div style={S.logo} onClick={reset} role="button" tabIndex={0}>
            <div style={S.logoMark}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect width="18" height="18" rx="4" fill={B.orange}/>
                <path d="M4 9.5L7.5 13L14 6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={S.logoText}>listo<span style={{ color:B.orange }}>.</span></span>
          </div>
          <div style={S.headerRight}>
            <span style={S.tagline}>Know before you build.</span>
            <span style={S.badge}>Not Legal Advice</span>
          </div>
        </div>
      </header>

      <main style={S.container}>

        {/* ── INPUT ──────────────────────────────────────────────────────── */}
        {stage === "input" && (
          <>
            <div className="fade-up" style={S.hero}>
              <p style={S.heroEye}>LA Building Permit Guidance</p>
              <h1 style={S.heroTitle}>Know before<br />you build.</h1>
              <p style={S.heroSub}>
                Enter an LA address and project type. Listo pulls real parcel data and tells you
                what's possible, what permits you need, and what it costs — before you hire anyone.
              </p>
              <p style={S.heroBilingual}>
                <em>Listo significa listo.</em> Ready to build, ready to invest, ready to go.
              </p>
            </div>

            <div className="fade-up-2" style={S.card}>
              <div style={S.formGroup}>
                <label style={S.label}><span style={S.num}>01</span>Property Address in Los Angeles</label>
                <input style={S.input} type="text"
                  placeholder="e.g. 5514 Thornburn St, Los Angeles, CA 90045"
                  value={address} onChange={e => setAddress(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && ready && handleGeocode()} />
              </div>
              <div style={S.formGroup}>
                <label style={S.label}><span style={S.num}>02</span>What do you want to build?</label>
                <select style={S.select} value={projectType} onChange={e => setProjectType(e.target.value)}>
                  <option value="">Select project type...</option>
                  {PROJECT_TYPES.map(g => (
                    <optgroup key={g.group} label={"— " + g.group}>
                      {g.items.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div style={S.formGroup}>
                <label style={S.label}><span style={S.num}>03</span>Details <span style={S.opt}>— optional, improves accuracy</span></label>
                <textarea style={S.textarea} rows={2}
                  placeholder="e.g. demolish existing 4-unit and build ground-up multi-family"
                  value={details} onChange={e => setDetails(e.target.value)} />
              </div>
              <button className="btn-primary" style={{ ...S.btnPrimary, ...(!ready ? { opacity:.4,cursor:"not-allowed" } : {}) }}
                onClick={handleGeocode} disabled={!ready}>
                Look Up Address →
              </button>
            </div>

            <div className="fade-up-3" style={S.features}>
              {[
                { icon:"🏢", t:"Real Parcel Data",       d:"Lot size, zoning, RSO from LA County Assessor" },
                { icon:"📐", t:"Density Math Shown",     d:"Exact unit count calculation before you hire anyone" },
                { icon:"📋", t:"Complete Permit Roadmap",d:"Every permit with type, agency, timeline, and fee" },
                { icon:"⏱",  t:"Week-by-Week Timeline",  d:"Best and worst case from today to Certificate of Occupancy" },
              ].map((f,i) => (
                <div key={i} style={S.feat}>
                  <div style={{ fontSize:20,marginBottom:10 }}>{f.icon}</div>
                  <div style={S.featT}>{f.t}</div>
                  <div style={S.featD}>{f.d}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── CONFIRM ────────────────────────────────────────────────────── */}
        {stage === "confirm" && (
          <div className="fade-up">
            <button className="btn-ghost no-print" style={S.backBtn} onClick={reset}>← Edit Address</button>
            <div style={S.confirmHdr}>
              <div style={{ fontSize:32,lineHeight:1 }}>📍</div>
              <div>
                <div style={S.confirmTitle}>Confirm your address</div>
                <div style={S.confirmSub}>
                  The <strong style={{ color:B.orange }}>ZIP code</strong> drives zoning, overlays, and density rules.
                  Correct it here if needed.
                </div>
              </div>
            </div>

            <div style={S.confirmCard}>
              <div style={S.formGroup}>
                <label style={S.confirmLabel}>Street Address</label>
                <input style={S.input} value={editStreet} onChange={e => setEditStreet(e.target.value)} placeholder="5514 Thornburn St, Los Angeles, CA" />
              </div>
              <div style={S.formGroup}>
                <label style={{ ...S.confirmLabel, color:B.orange }}>ZIP Code <span style={{ fontWeight:400,fontSize:11,color:B.gray2 }}>— double-check this</span></label>
                <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                  <input style={{ ...S.input,flex:1,fontSize:22,fontWeight:700,color:B.orange,border:`1px solid ${B.orange}60`,letterSpacing:"0.12em" }}
                    type="text" maxLength={5} value={editZip}
                    onChange={e => setEditZip(e.target.value.replace(/\D/g,"").slice(0,5))}
                    placeholder="90045" />
                  {overlays.length > 0 && (
                    <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                      {overlays.map(z => (
                        <span key={z.key} style={{ fontSize:11,background:z.bg,color:z.color,border:`1px solid ${z.color}60`,borderRadius:20,padding:"3px 10px",fontWeight:600 }}>
                          {z.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {overlays.length > 0 && (
              <div style={{ background:"#0F1A0F",border:"1px solid #1a3020",borderRadius:12,padding:"16px 18px",marginBottom:20 }}>
                <div style={{ fontSize:12,fontWeight:700,color:B.orange,marginBottom:10 }}>Special Zones Detected for ZIP {editZip}</div>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10 }}>
                  {overlays.map(z => (
                    <div key={z.key} style={{ background:z.bg,border:`1px solid ${z.color}60`,borderRadius:9,padding:"10px 14px" }}>
                      <div style={{ fontWeight:700,color:z.color,fontSize:13,marginBottom:3 }}>{z.label}</div>
                      <div style={{ fontSize:12,color:z.color,lineHeight:1.5 }}>{z.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn-primary" style={{ ...S.btnPrimary,marginTop:0 }} onClick={handleAnalyze}>
              Run Permit Analysis →
            </button>
            <div style={{ textAlign:"center",marginTop:14 }}>
              <button className="btn-ghost" style={S.txtBtn} onClick={reset}>← Start over</button>
            </div>
          </div>
        )}

        {/* ── RESULT ─────────────────────────────────────────────────────── */}
        {stage === "result" && (
          <div className="fade-up">
            <div className="no-print" style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
              <button className="btn-ghost" style={S.backBtn} onClick={reset}>← New Search</button>
              {result && <button onClick={handlePrint} style={S.printBtn}>↓ Export PDF</button>}
            </div>

            {/* Address bar */}
            <div style={S.verBar}>
              <span style={S.verDot} />
              <div style={{ flex:1 }}>
                <div style={S.verAddr}>{editStreet || address}</div>
                <div style={S.verMeta}>
                  ZIP {editZip || parsed?.zip}
                  {parsed?.neighborhood ? " · " + parsed.neighborhood : ""}
                  {parcel?.lotSizeSf ? " · " + parcel.lotSizeSf.toLocaleString() + " sf · " + Math.floor(parcel.lotSizeSf/800) + " units by-right" : ""}
                  {" · " + (parcel ? "Parcel data verified" : "ZIP-based estimates")}
                </div>
              </div>
              <div style={S.verProj}>{getLabel(projectType)}</div>
            </div>

            {/* Section nav */}
            {result && (
              <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:20 }} className="no-print">
                {["Deal Summary","Zone Alerts","Zoning & Density","Permit Roadmap","Fee Summary","Timeline","Next Steps"].map(sec => (
                  <a key={sec} href={"#sec-"+sec.toLowerCase().replace(/[^a-z0-9]+/g,"-")}
                    style={{ fontSize:11,color:B.gray2,background:B.black,border:`1px solid ${B.gray1}`,borderRadius:20,padding:"3px 10px",textDecoration:"none",cursor:"pointer" }}>
                    {sec}
                  </a>
                ))}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="fade-up-2" style={S.loadBox}>
                <div style={S.spinner} />
                <div style={S.loadTitle}>Pulling parcel data and analyzing...</div>
                <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                  {["Fetching parcel data from LA County Assessor","Checking zoning for ZIP " + (editZip||""),
                    "Calculating density and unit allowances","Building your permit roadmap"].map((step,i) => (
                    <div key={i} className="pulse-a" style={{ ...S.loadStep,animationDelay:i*0.5+"s" }}>{step}</div>
                  ))}
                </div>
              </div>
            )}

            {error && <div style={S.errBox}>{error}</div>}

            {/* Result card */}
            {result && (
              <div className="fade-up-2" style={S.resultCard}>
                <div style={S.resultHdr} className="no-print">
                  <div style={{ flex:1 }}>
                    <div style={S.resultTitle}>Permit Analysis Report</div>
                    <div style={S.resultSub}>Verify requirements with LADBS before proceeding</div>
                  </div>
                  <div style={{ fontSize:10,color:parcel?"#22c55e":B.gray2,background:parcel?"#061a0a":B.black,border:`1px solid ${parcel?"#16a34a":B.gray1}`,borderRadius:20,padding:"3px 10px",whiteSpace:"nowrap",flexShrink:0 }}>
                    {parcel ? "Parcel verified" : "ZIP estimates"}
                  </div>
                </div>
                <div style={{ height:1,background:B.gray1 }} className="no-print" />

                <div style={S.resultBody}><Markdown text={result} /></div>

                {/* Disclaimer */}
                <div style={S.disclaimer}>
                  AI-generated guidance based on publicly available LA permit data. Always verify with your jurisdiction before submitting. This is not legal advice.
                </div>

                {/* CTAs */}
                <div style={{ padding:"0 28px 8px",display:"flex",gap:12,flexWrap:"wrap" }} className="no-print">
                  <button style={S.ctaPrimary} onClick={() => window.open("https://www.ladbs.org","_blank")}>Apply at LADBS.org →</button>
                  <button style={S.ctaSecondary} onClick={handlePrint}>↓ Export as PDF</button>
                </div>

                {/* Feedback */}
                <div style={{ padding:"20px 28px 24px",borderTop:`1px solid ${B.gray1}` }} className="no-print">
                  {!fbDone ? (
                    <>
                      <div style={{ fontSize:13,color:B.gray2,marginBottom:12 }}>Was this analysis accurate and useful?</div>
                      <div style={{ display:"flex",gap:10,marginBottom:fbOpen?16:0 }}>
                        <button onClick={() => { setFbState("up"); submitFeedback("up"); }}
                          style={{ fontSize:13,background:fbState==="up"?"#0A1F0A":B.black,border:`1px solid ${fbState==="up"?"#34d399":B.gray1}`,color:fbState==="up"?"#34d399":B.gray2,borderRadius:8,padding:"9px 16px",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                          Accurate
                        </button>
                        <button onClick={() => { setFbState("down"); setFbOpen(true); }}
                          style={{ fontSize:13,background:fbState==="down"?"#1a0808":B.black,border:`1px solid ${fbState==="down"?"#fca5a5":B.gray1}`,color:fbState==="down"?"#fca5a5":B.gray2,borderRadius:8,padding:"9px 16px",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>
                          Something's wrong
                        </button>
                      </div>
                      {fbOpen && (
                        <div style={{ marginTop:12 }}>
                          <textarea style={{ ...S.textarea,height:80,fontSize:13 }}
                            placeholder="What was wrong or missing? e.g. 'Wrong ZIP used' or 'Missed coastal permit requirement'"
                            value={fbComment} onChange={e => setFbComment(e.target.value)} />
                          <button className="btn-primary" style={{ ...S.btnPrimary,width:"auto",padding:"10px 24px",fontSize:13,marginTop:8 }}
                            onClick={() => submitFeedback("down", fbComment)}>
                            Submit Feedback
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize:13,color:"#22c55e" }}>Thanks — feedback received. This helps us improve accuracy.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer style={S.footer} className="no-print">
        listo.zone · Independent tool, not affiliated with the City of Los Angeles or LADBS.
        {" · "}Always consult a licensed professional for complex projects.
      </footer>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
const S = {
  root: { fontFamily:"'DM Sans',system-ui,sans-serif",background:B.black,minHeight:"100vh",color:B.cream },
  header: { borderBottom:`1px solid ${B.gray1}`,background:B.black,position:"sticky",top:0,zIndex:100 },
  headerInner: { maxWidth:860,margin:"0 auto",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between" },
  logo: { display:"flex",alignItems:"center",gap:10,cursor:"pointer",textDecoration:"none" },
  logoMark: { flexShrink:0 },
  logoText: { fontFamily:"Georgia,serif",fontSize:22,color:B.cream,letterSpacing:"-0.02em",fontWeight:700 },
  headerRight: { display:"flex",alignItems:"center",gap:12 },
  tagline: { fontSize:12,color:B.gray2,fontStyle:"italic" },
  badge: { fontSize:10,color:B.gray2,border:`1px solid ${B.gray1}`,borderRadius:20,padding:"3px 10px" },
  container: { maxWidth:860,margin:"0 auto",padding:"48px 24px 80px" },
  hero: { marginBottom:44 },
  heroEye: { fontSize:11,letterSpacing:"0.18em",textTransform:"uppercase",color:B.orange,marginBottom:14,fontWeight:600 },
  heroTitle: { fontFamily:"Georgia,serif",fontSize:"clamp(36px,6vw,62px)",lineHeight:1.1,color:B.cream,marginBottom:18,fontWeight:700 },
  heroSub: { fontSize:16,color:B.gray2,lineHeight:1.75,maxWidth:520,fontWeight:300,marginBottom:10 },
  heroBilingual: { fontSize:13,color:B.gray3,fontStyle:"italic" },
  card: { background:B.gray1,border:`1px solid #2C2825`,borderRadius:16,padding:"36px 32px 32px",marginBottom:44 },
  formGroup: { marginBottom:24 },
  label: { display:"flex",alignItems:"center",gap:9,fontSize:11,fontWeight:600,color:B.gray2,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:9 },
  num: { background:B.orange,color:B.white,borderRadius:4,fontSize:10,fontWeight:800,padding:"2px 6px" },
  opt: { fontWeight:300,textTransform:"none",letterSpacing:0,color:B.gray3,fontSize:11 },
  input: { width:"100%",background:B.black,border:`1px solid ${B.gray1}`,borderRadius:9,padding:"13px 16px",color:B.cream,fontSize:14,transition:"border-color .2s",fontFamily:"'DM Sans',system-ui,sans-serif" },
  select: { width:"100%",background:B.black,border:`1px solid ${B.gray1}`,borderRadius:9,padding:"13px 16px",color:B.cream,fontSize:14,cursor:"pointer",appearance:"none",fontFamily:"'DM Sans',system-ui,sans-serif",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%236B6560' d='M5 6L0 0h10z'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 14px center" },
  textarea: { width:"100%",background:B.black,border:`1px solid ${B.gray1}`,borderRadius:9,padding:"13px 16px",color:B.cream,fontSize:14,resize:"vertical",fontFamily:"'DM Sans',system-ui,sans-serif",lineHeight:1.6 },
  btnPrimary: { width:"100%",background:B.orange,color:B.white,border:"none",borderRadius:9,padding:"15px 28px",fontSize:15,fontWeight:700,cursor:"pointer",letterSpacing:"0.02em",transition:"background .2s,transform .15s",fontFamily:"'DM Sans',system-ui,sans-serif",marginTop:4 },
  features: { display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14 },
  feat: { background:B.gray1,border:`1px solid #2C2825`,borderRadius:12,padding:22 },
  featT: { fontSize:13,fontWeight:600,color:B.cream,marginBottom:5 },
  featD: { fontSize:12,color:B.gray2,lineHeight:1.6 },
  backBtn: { background:"none",border:"none",color:B.gray2,cursor:"pointer",fontSize:13,padding:"0 0 20px",fontFamily:"'DM Sans',system-ui,sans-serif",transition:"color .2s",display:"block" },
  printBtn: { background:"none",border:`1px solid ${B.gray1}`,color:B.gray2,cursor:"pointer",fontSize:12,padding:"6px 14px",fontFamily:"'DM Sans',system-ui,sans-serif",borderRadius:8,marginBottom:20 },
  confirmHdr: { display:"flex",gap:16,alignItems:"flex-start",marginBottom:24 },
  confirmTitle: { fontFamily:"Georgia,serif",fontSize:28,color:B.cream,marginBottom:6 },
  confirmSub: { fontSize:14,color:B.gray2,lineHeight:1.65,maxWidth:520 },
  confirmCard: { background:B.gray1,border:`1px solid #2C2825`,borderRadius:14,padding:"24px 24px 20px",marginBottom:16 },
  confirmLabel: { display:"block",fontSize:11,fontWeight:700,color:B.gray2,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8 },
  txtBtn: { background:"none",border:"none",color:B.gray2,cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',system-ui,sans-serif",textDecoration:"underline",padding:0 },
  verBar: { background:"#08150F",border:"1px solid #12301E",borderRadius:11,padding:"14px 20px",display:"flex",alignItems:"center",gap:13,marginBottom:16,flexWrap:"wrap" },
  verDot: { width:7,height:7,borderRadius:"50%",background:B.lime,flexShrink:0 },
  verAddr: { fontSize:13,color:"#D1FAE5",fontWeight:500 },
  verMeta: { fontSize:11,color:"#1a5c36",letterSpacing:"0.04em",marginTop:2 },
  verProj: { fontSize:12,color:B.orange,fontWeight:600,background:"#1A0E00",border:`1px solid ${B.orange}40`,borderRadius:20,padding:"4px 13px",whiteSpace:"nowrap" },
  loadBox: { textAlign:"center",padding:"68px 36px",background:B.gray1,border:`1px solid #2C2825`,borderRadius:16 },
  spinner: { width:36,height:36,border:`3px solid ${B.gray1}`,borderTop:`3px solid ${B.orange}`,borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 20px" },
  loadTitle: { fontFamily:"Georgia,serif",fontSize:20,color:B.cream,marginBottom:20 },
  loadStep: { fontSize:13,color:B.gray2 },
  errBox: { padding:"11px 14px",background:"#1A0808",border:"1px solid #3d1010",borderRadius:8,color:"#fca5a5",fontSize:13,marginBottom:14,lineHeight:1.6 },
  resultCard: { background:B.gray1,border:`1px solid #2C2825`,borderRadius:16,overflow:"hidden" },
  resultHdr: { display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"24px 28px",gap:14 },
  resultTitle: { fontFamily:"Georgia,serif",fontSize:22,color:B.cream,marginBottom:4 },
  resultSub: { fontSize:11,color:B.gray2 },
  resultBody: { padding:"26px 28px 0" },
  disclaimer: { margin:"24px 28px 0",padding:"13px 16px",background:B.black,border:`1px solid ${B.gray1}`,borderRadius:9,fontSize:12,color:B.gray2,lineHeight:1.75,fontStyle:"italic" },
  ctaPrimary: { background:B.orange,border:"none",color:B.white,borderRadius:9,padding:"12px 20px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',system-ui,sans-serif",flex:1 },
  ctaSecondary: { background:"transparent",border:`1px solid ${B.gray1}`,color:B.gray2,borderRadius:9,padding:"12px 20px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',system-ui,sans-serif",flex:1 },
  h2: { fontFamily:"Georgia,serif",fontSize:20,color:B.orange,marginTop:26,marginBottom:11,paddingBottom:8,borderBottom:`2px solid ${B.orange}30` },
  h3: { fontSize:14,fontWeight:600,color:B.cream,marginTop:16,marginBottom:7 },
  p: { fontSize:14,color:B.gray2,lineHeight:1.8,marginBottom:3 },
  ul: { paddingLeft:18,marginBottom:8 },
  li: { fontSize:14,color:B.gray2,lineHeight:1.75,marginBottom:3 },
  footer: { borderTop:`1px solid ${B.gray1}`,padding:"20px 24px",textAlign:"center",fontSize:11,color:B.gray1 },
};
