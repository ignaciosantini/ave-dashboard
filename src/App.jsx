import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, LabelList
} from "recharts";

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://bujmrvrqsiwtcoscvwwu.supabase.co";
const SUPABASE_KEY = "sb_publishable_KqR-_d2yhRlkdytQuleMfA_b0Zp21l8";

async function sbGet() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ave_data?id=eq.main&select=stock,months`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
    });
    const rows = await res.json();
    return rows?.[0] ?? null;
  } catch(e) { return null; }
}

async function sbSet(stock, months) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ave_data?id=eq.main`, {
      method: "PATCH",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ stock, months, updated_at: new Date().toISOString() })
    });
  } catch(e) { console.error("Supabase save error:", e); }
}


const FLAVORS = [
  { key: "mandarina", label: "Mandarina",     color: "#D85A30" },
  { key: "mandCaf",   label: "Mand. cafeína", color: "#EF9F27" },
  { key: "lima",      label: "Lima",           color: "#639922" },
  { key: "limaCaf",   label: "Lima cafeína",   color: "#1D9E75" },
];
const CHANNELS = [
  { key: "referidos", label: "Referidos",  color: "#D85A30" },
  { key: "tiendas",   label: "Tiendas",    color: "#378ADD" },
  { key: "deporte",   label: "Cliente X",  color: "#1D9E75" },
  { key: "fff",       label: "FFF",        color: "#8E44AD" },
  { key: "shopify",   label: "Shopify",    color: "#96BF48" },
];
const DELIVERY_CHANNELS = [
  { key: "atleta",     label: "Atleta",       color: "#D85A30" },
  { key: "influencer", label: "Influencer",    color: "#9B59B6" },
  { key: "coach",      label: "Coach de Team", color: "#1D9E75" },
];

// Generate months from Aug-25 to current month (May 26 = index 4, year 26)
const MONTH_NAMES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function monthToIndex(m) {
  // "May 26" → 2026*12 + 4  (sortable number)
  if (!m) return 0;
  const parts = m.trim().split(" ");
  const mIdx  = MONTH_NAMES.indexOf(parts[0]);
  const year  = parseInt(parts[1]) || 0;
  return year * 12 + mIdx;
}

function sortMonths(arr) {
  return [...arr].sort((a, b) => monthToIndex(a.month) - monthToIndex(b.month));
}
function generateMonthList() {
  const list = [];
  // start: Aug 25 → month index 7, year 25
  // end:   dynamically compute from current date, but cap knowledge at year 27 max
  const now = new Date();
  let endY = now.getFullYear() - 2000; // e.g. 2026 → 26
  let endM = now.getMonth();           // 0-indexed: May = 4
  // Safety: if year looks wrong (e.g. env returns 1970), default to May 26
  if (endY < 25 || endY > 50) { endY = 26; endM = 4; }
  let y = 25, m = 7; // Aug 25
  while (y < endY || (y === endY && m <= endM)) {
    list.push(`${MONTH_NAMES[m]} ${String(y).padStart(2,"0")}`);
    m++; if (m > 11) { m = 0; y++; }
  }
  return list;
}
const MONTH_LIST = generateMonthList();

const mkMap      = (v=0) => Object.fromEntries(FLAVORS.map(f=>[f.key,v]));
const emptyUnit  = ()    => ({type:"unit",  flavor:"mandarina",qty:"",price:""});
const emptyPack  = ()    => ({type:"pack6", flavors:mkMap("0"),packs:"",price:""});
const emptyVenta = ()    => ({id:Date.now(),channel:"referidos",channelNote:"",items:[]});
const emptyDUnit = ()    => ({type:"unit",  flavor:"mandarina",qty:""});
const emptyDPack = ()    => ({type:"pack6", flavors:mkMap("0"),packs:""});
const emptyEntrega=()    => ({id:Date.now(),channel:"atleta",channelNote:"",items:[]});
const emptyMerma  =()    => ({id:Date.now(),motivo:"",items:[]});

const SEED_STOCK = {mandarina:50, mandCaf:30, lima:40, limaCaf:25};
const SEED_MONTHS= [
  {
    month:"May 26",
    cogs:800,
    ventas:[
      {
        id:1,
        channel:"referidos",
        channelNote:"Santi V.",
        items:[{type:"unit", flavor:"mandarina", qty:"3", price:"2000"}]
      },
      {
        id:2,
        channel:"referidos",
        channelNote:"Rengifo",
        items:[
          {type:"pack6", flavors:{mandarina:"4",mandCaf:"2",lima:"0",limaCaf:"0"}, packs:"1", price:"13500"},
          {type:"pack6", flavors:{mandarina:"0",mandCaf:"0",lima:"4",limaCaf:"2"}, packs:"1", price:"13500"},
        ]
      },
    ],
    entregas:[
      {
        id:101,
        channel:"influencer",
        channelNote:"Carla Fuenzalida",
        items:[
          {type:"unit", flavor:"mandarina", qty:"2"},
          {type:"unit", flavor:"mandCaf",   qty:"1"},
          {type:"unit", flavor:"lima",      qty:"3"},
          {type:"unit", flavor:"limaCaf",   qty:"2"},
        ]
      },
    ],
    mermas:[
      {
        id:201,
        motivo:"Gel reventado",
        items:[
          {type:"unit", flavor:"mandCaf",  qty:"1"},
          {type:"unit", flavor:"limaCaf",  qty:"1"},
        ]
      },
    ],
  },
];

// ─── Calc ──────────────────────────────────────────────────────────────────────
function calcItems(items){
  const byFlavor=mkMap(0); let units=0,revenue=0;
  (items||[]).forEach(item=>{
    if(item.type==="unit"){const u=parseFloat(item.qty)||0;byFlavor[item.flavor]+=u;units+=u;revenue+=u*(parseFloat(item.price)||0);}
    else{const p=parseFloat(item.packs)||0;FLAVORS.forEach(f=>{const u=p*(parseFloat(item.flavors[f.key])||0);byFlavor[f.key]+=u;units+=u;});revenue+=p*(parseFloat(item.price)||0);}
  });
  return {byFlavor,units,revenue};
}
function calcDeliveryItems(items){
  const byFlavor=mkMap(0); let units=0;
  (items||[]).forEach(item=>{
    if(item.type==="unit"){const u=parseFloat(item.qty)||0;byFlavor[item.flavor]+=u;units+=u;}
    else{const p=parseFloat(item.packs)||0;FLAVORS.forEach(f=>{const u=p*(parseFloat(item.flavors[f.key])||0);byFlavor[f.key]+=u;units+=u;});}
  });
  return {byFlavor,units};
}
function calcMonth(m){
  const byFlavor=mkMap(0),byChannel=Object.fromEntries(CHANNELS.map(c=>[c.key,0]));
  let totalUnits=0,totalRevenue=0;
  (m.ventas||[]).forEach(v=>{const r=calcItems(v.items);FLAVORS.forEach(f=>{byFlavor[f.key]+=r.byFlavor[f.key];});byChannel[v.channel]=(byChannel[v.channel]||0)+r.units;totalUnits+=r.units;totalRevenue+=r.revenue;});
  const price=totalUnits>0?Math.round(totalRevenue/totalUnits):0;
  const delivByChannel=Object.fromEntries(DELIVERY_CHANNELS.map(c=>[c.key,0]));
  const delivByFlavor=mkMap(0); let totalDelivUnits=0;
  (m.entregas||[]).forEach(e=>{const r=calcDeliveryItems(e.items);FLAVORS.forEach(f=>{delivByFlavor[f.key]+=r.byFlavor[f.key];});delivByChannel[e.channel]=(delivByChannel[e.channel]||0)+r.units;totalDelivUnits+=r.units;});
  const mermaByFlavor=mkMap(0); let totalMermaUnits=0;
  (m.mermas||[]).forEach(mr=>{const r=calcDeliveryItems(mr.items);FLAVORS.forEach(f=>{mermaByFlavor[f.key]+=r.byFlavor[f.key];});totalMermaUnits+=r.units;});
  return {byFlavor,byChannel,totalUnits,totalRevenue,price,delivByChannel,delivByFlavor,totalDelivUnits,mermaByFlavor,totalMermaUnits};
}
function calcRunningStock(globalStock,months){
  const s={...globalStock};
  months.forEach(m=>{const r=calcMonth(m);FLAVORS.forEach(f=>{s[f.key]=(s[f.key]||0)-r.byFlavor[f.key]-r.delivByFlavor[f.key]-r.mermaByFlavor[f.key];});});
  return s;
}

const fmtNum=n=>Math.round(n).toLocaleString("es-CL");
const fmtMrr=n=>`$${fmtNum(n)}`;
const pct=(a,b)=>b?(((a-b)/b)*100).toFixed(1):null;
const norm=s=>s.trim().toLowerCase().replace(/\s+/g," ");

// ─── Styles ───────────────────────────────────────────────────────────────────
const inp ={padding:"8px 12px",borderRadius:8,border:"0.5px solid rgba(0,0,0,0.2)",fontSize:14,outline:"none",background:"white",width:"100%",boxSizing:"border-box"};
const sel ={...inp,cursor:"pointer"};
const lbl ={fontSize:12,color:"#666",fontWeight:500,display:"block",marginBottom:4};
const sInp={...inp,fontSize:13,padding:"6px 10px"};

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Delta({curr,prevVal}){
  if(!prevVal)return null;
  const d=pct(curr,prevVal),up=parseFloat(d)>=0;
  return <span style={{fontSize:12,color:up?"#3B6D11":"#A32D2D",marginTop:3,display:"block"}}>{up?"▲":"▼"} {Math.abs(d)}% vs mes anterior</span>;
}
function Pill({label,type}){
  const s={green:{background:"#EAF3DE",color:"#3B6D11"},amber:{background:"#FAEEDA",color:"#854F0B"},red:{background:"#FCEBEB",color:"#A32D2D"},blue:{background:"#E6F1FB",color:"#185FA5"},purple:{background:"#F3EAFB",color:"#6C3483"}};
  return <span style={{...s[type],fontSize:11,padding:"2px 8px",borderRadius:100,fontWeight:500,display:"inline-block",marginTop:5}}>{label}</span>;
}
function SectionLabel({children}){return <div style={{fontSize:11,fontWeight:500,letterSpacing:"0.1em",textTransform:"uppercase",color:"#888",margin:"1.5rem 0 0.75rem"}}>{children}</div>;}
function Card({children,style}){return <div style={{background:"white",border:"0.5px solid rgba(0,0,0,0.1)",borderRadius:12,padding:"1.25rem",...style}}>{children}</div>;}
function MetricBox({label,value,curr,prevVal}){
  return(<div style={{background:"#f7f7f5",borderRadius:8,padding:"1rem"}}>
    <div style={{fontSize:12,color:"#888",marginBottom:6}}>{label}</div>
    <div style={{fontSize:21,fontWeight:500}}>{value}</div>
    {curr!==undefined&&<Delta curr={curr} prevVal={prevVal}/>}
  </div>);
}
function CTip({active,payload,label}){
  if(!active||!payload?.length)return null;
  return(<div style={{background:"white",border:"0.5px solid rgba(0,0,0,0.12)",borderRadius:8,padding:"8px 12px",fontSize:12}}>
    <div style={{fontWeight:500,marginBottom:4}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color||"#333"}}>{p.name}: {typeof p.value==="number"?p.value.toLocaleString("es-CL"):p.value}</div>)}
  </div>);
}

// ─── Filter chip ─────────────────────────────────────────────────────────────
function FilterChip({label,color,active,onClick}){
  return(
    <button onClick={onClick} style={{padding:"5px 12px",borderRadius:100,border:`1.5px solid ${active?color:"rgba(0,0,0,0.15)"}`,background:active?color+"18":"transparent",color:active?color:"#666",fontSize:12,fontWeight:active?600:400,cursor:"pointer",transition:"all 0.15s"}}>
      {label}
    </button>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
function ConfirmDialog({message,detail,onConfirm,onCancel}){
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:"white",borderRadius:14,padding:"1.75rem 2rem",maxWidth:420,width:"90%",boxShadow:"0 8px 40px rgba(0,0,0,0.22)"}}>
      <div style={{fontSize:16,fontWeight:600,marginBottom:8}}>¿Estás seguro?</div>
      <div style={{fontSize:13,color:"#555",marginBottom:detail?8:22,lineHeight:1.5}}>{message}</div>
      {detail&&<div style={{fontSize:12,color:"#666",marginBottom:22,background:"#f7f7f5",borderRadius:8,padding:"8px 12px",lineHeight:1.6}}>{detail}</div>}
      <div style={{display:"flex",gap:10}}>
        <button onClick={onConfirm} style={{flex:1,padding:"10px 0",background:"#D85A30",color:"white",border:"none",borderRadius:8,fontSize:14,fontWeight:500,cursor:"pointer"}}>Sí, confirmar</button>
        <button onClick={onCancel}  style={{flex:1,padding:"10px 0",background:"transparent",border:"0.5px solid rgba(0,0,0,0.2)",borderRadius:8,fontSize:14,cursor:"pointer",color:"#555"}}>Cancelar</button>
      </div>
    </div>
  </div>);
}

// ─── Stock Setup Modal ────────────────────────────────────────────────────────
function StockSetupModal({current,onSave,onCancel,isEdit}){
  const [draft,setDraft]=useState(()=>Object.fromEntries(FLAVORS.map(f=>[f.key,String(current[f.key]??0)])));
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:"white",borderRadius:14,padding:"1.75rem 2rem",maxWidth:460,width:"90%",boxShadow:"0 8px 40px rgba(0,0,0,0.22)"}}>
      <div style={{fontSize:16,fontWeight:600,marginBottom:4}}>{isEdit?"Modificar stock inicial":"Configurar stock inicial"}</div>
      <div style={{fontSize:13,color:"#888",marginBottom:20,lineHeight:1.5}}>{isEdit?"⚠ Cambiar el stock inicial afecta el inventario global.":"Ingresa las unidades disponibles por sabor. Ventas y entregas irán restando desde este inventario."}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {FLAVORS.map(f=>(<div key={f.key}>
          <label style={{...lbl,display:"flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:"50%",background:f.color,display:"inline-block"}}></span>{f.label}</label>
          <input type="number" value={draft[f.key]} onChange={e=>setDraft(d=>({...d,[f.key]:e.target.value}))} placeholder="0" style={inp}/>
        </div>))}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>onSave(Object.fromEntries(FLAVORS.map(f=>[f.key,parseFloat(draft[f.key])||0])))} style={{flex:1,padding:"10px 0",background:"#D85A30",color:"white",border:"none",borderRadius:8,fontSize:14,fontWeight:500,cursor:"pointer"}}>{isEdit?"Actualizar stock":"Guardar stock"}</button>
        {onCancel&&<button onClick={onCancel} style={{flex:1,padding:"10px 0",background:"transparent",border:"0.5px solid rgba(0,0,0,0.2)",borderRadius:8,fontSize:14,cursor:"pointer",color:"#555"}}>Cancelar</button>}
      </div>
    </div>
  </div>);
}

// ─── Venta Modal ──────────────────────────────────────────────────────────────
function VentaModal({initialVenta,onSave,onCancel,monthKey,isEdit}){
  const [v,setV]=useState(()=>JSON.parse(JSON.stringify(initialVenta)));
  const [selectedMonth,setSelectedMonth]=useState(monthKey||"");
  const addUnit=()=>setV(p=>({...p,items:[...p.items,emptyUnit()]}));
  const addPack=()=>setV(p=>({...p,items:[...p.items,emptyPack()]}));
  const delItem=i=>setV(p=>({...p,items:p.items.filter((_,idx)=>idx!==i)}));
  const setItem=(i,k,val)=>setV(p=>({...p,items:p.items.map((x,idx)=>idx===i?{...x,[k]:val}:x)}));
  const setPFl=(i,fk,val)=>setV(p=>({...p,items:p.items.map((x,idx)=>idx===i?{...x,flavors:{...x.flavors,[fk]:val}}:x)}));
  const cv=calcItems(v.items);
  const hasErr=v.items.some(item=>item.type==="pack6"&&FLAVORS.reduce((a,f)=>a+(parseFloat(item.flavors[f.key])||0),0)!==6);
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1500,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"2rem 1rem 3rem"}}>
    <div style={{background:"#f4f3ef",borderRadius:16,width:"100%",maxWidth:680,boxShadow:"0 16px 48px rgba(0,0,0,0.25)"}}>
      <div style={{background:"#D85A30",borderRadius:"16px 16px 0 0",padding:"0.9rem 1.25rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"white",letterSpacing:2}}>{isEdit?"Editar venta":"Agregar venta"}</span>
          {v.items.length>0&&<span style={{background:"rgba(255,255,255,0.25)",color:"white",fontSize:12,fontWeight:600,padding:"2px 10px",borderRadius:100}}>{v.items.length} prod. · {fmtNum(cv.units)} unid.</span>}
        </div>
        <button onClick={onCancel} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"white",borderRadius:6,padding:"4px 12px",fontSize:14,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{padding:"1.25rem"}}>
        {/* Month selector — shown in edit mode */}
        {isEdit&&(
          <div style={{marginBottom:"1.25rem",padding:"10px 14px",background:"#FAECE7",borderRadius:8,border:"0.5px solid #F0C0A0"}}>
            <label style={lbl}>Mes al que pertenece esta venta</label>
            <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} style={sel}>
              <option value="">Seleccionar mes...</option>
              {[...MONTH_LIST].reverse().map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12,marginBottom:"1.25rem"}}>
          <div><label style={lbl}>Canal de venta</label><select value={v.channel} onChange={e=>setV(p=>({...p,channel:e.target.value}))} style={sel}>{CHANNELS.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
          <div><label style={lbl}>Comentario (opcional)</label><input type="text" value={v.channelNote} onChange={e=>setV(p=>({...p,channelNote:e.target.value}))} placeholder="ej: cliente, tienda, evento..." style={inp}/></div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
          <span style={{fontSize:13,fontWeight:500,color:"#444"}}>Productos</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addUnit} style={{padding:"6px 14px",background:"white",border:"0.5px solid #D85A30",color:"#D85A30",borderRadius:7,fontSize:12,fontWeight:500,cursor:"pointer"}}>+ Unidad</button>
            <button onClick={addPack} style={{padding:"6px 14px",background:"white",border:"0.5px solid #378ADD",color:"#185FA5",borderRadius:7,fontSize:12,fontWeight:500,cursor:"pointer"}}>+ Mix 6-pack</button>
          </div>
        </div>
        {v.items.length===0&&<div style={{fontSize:13,color:"#bbb",textAlign:"center",padding:"20px 0"}}>Agrega productos con los botones de arriba.</div>}
        {v.items.map((item,i)=>(
          <div key={i} style={{background:"white",border:`1px solid ${item.type==="pack6"?"#B5D4F4":"#F0D0C0"}`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:11,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color:item.type==="pack6"?"#185FA5":"#993C1D",background:item.type==="pack6"?"#E6F1FB":"#FAECE7",padding:"3px 10px",borderRadius:100}}>{item.type==="pack6"?"Mix 6-pack":"Unidad"}</span>
              <button onClick={()=>delItem(i)} style={{padding:"3px 9px",background:"transparent",border:"0.5px solid #F09595",color:"#A32D2D",borderRadius:6,fontSize:12,cursor:"pointer"}}>✕</button>
            </div>
            {item.type==="unit"&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div><label style={lbl}>Sabor</label><select value={item.flavor} onChange={e=>setItem(i,"flavor",e.target.value)} style={sel}>{FLAVORS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
              <div><label style={lbl}>Unidades</label><input type="number" value={item.qty} onChange={e=>setItem(i,"qty",e.target.value)} placeholder="ej: 50" style={inp}/></div>
              <div><label style={lbl}>Precio unit. ($)</label><input type="number" value={item.price} onChange={e=>setItem(i,"price",e.target.value)} placeholder="ej: 400" style={inp}/></div>
            </div>)}
            {item.type==="pack6"&&(<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label style={lbl}>Packs vendidos</label><input type="number" value={item.packs} onChange={e=>setItem(i,"packs",e.target.value)} placeholder="ej: 10" style={inp}/></div>
                <div><label style={lbl}>Precio por pack ($)</label><input type="number" value={item.price} onChange={e=>setItem(i,"price",e.target.value)} placeholder="ej: 2200" style={inp}/></div>
              </div>
              <div style={{background:"#f7f8fc",border:"0.5px solid #C8DCF4",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#185FA5",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:8}}>Sabores por pack — deben sumar 6</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  {FLAVORS.map(f=>(<div key={f.key}><label style={{...lbl,display:"flex",alignItems:"center",gap:5}}><span style={{width:7,height:7,borderRadius:"50%",background:f.color,display:"inline-block"}}></span>{f.label}</label><input type="number" min="0" max="6" value={item.flavors[f.key]} onChange={e=>setPFl(i,f.key,e.target.value)} placeholder="0" style={sInp}/></div>))}
                </div>
                {(()=>{const s=FLAVORS.reduce((a,f)=>a+(parseFloat(item.flavors[f.key])||0),0);return <div style={{fontSize:12,marginTop:8,fontWeight:500,color:s===6?"#3B6D11":"#A32D2D"}}>{s===6?"✓ Suma correcta: 6":`⚠ Suma actual: ${s} de 6`}</div>;})()}
                {parseFloat(item.packs)>0&&(()=>{const parts=FLAVORS.map(f=>{const u=(parseFloat(item.packs)||0)*(parseFloat(item.flavors[f.key])||0);return u>0?`${fmtNum(u)} ${f.label}`:null;}).filter(Boolean);return parts.length>0?<div style={{fontSize:12,color:"#888",marginTop:4}}>Equiv: {parts.join(" · ")}</div>:null;})()}
              </div>
            </>)}
          </div>
        ))}
        {v.items.length>0&&<div style={{background:"#FAECE7",border:"0.5px solid #F0C0A0",borderRadius:8,padding:"10px 14px",marginTop:4,fontSize:13}}><span style={{fontWeight:600}}>Resumen: </span>{fmtNum(cv.units)} unidades · {fmtMrr(cv.revenue)}{cv.units>0&&<span style={{color:"#888"}}> · prom. ${fmtNum(Math.round(cv.revenue/cv.units))}</span>}</div>}
        <div style={{display:"flex",gap:10,marginTop:"1rem"}}>
          <button onClick={()=>!hasErr&&v.items.length>0&&onSave(v,selectedMonth)} disabled={hasErr||v.items.length===0||(isEdit&&!selectedMonth)} style={{padding:"10px 24px",background:hasErr||v.items.length===0||(isEdit&&!selectedMonth)?"#ccc":"#D85A30",color:"white",border:"none",borderRadius:8,fontSize:14,fontWeight:500,cursor:hasErr||v.items.length===0||(isEdit&&!selectedMonth)?"not-allowed":"pointer"}}>{isEdit?"Guardar cambios":"Guardar venta"}</button>
          <button onClick={onCancel} style={{padding:"10px 20px",background:"transparent",border:"0.5px solid rgba(0,0,0,0.2)",borderRadius:8,fontSize:14,cursor:"pointer",color:"#555"}}>Cancelar</button>
        </div>
      </div>
    </div>
  </div>);
}

// ─── Entrega Modal ────────────────────────────────────────────────────────────
function EntregaModal({initialEntrega,onSave,onCancel,monthKey,isEdit}){
  const [e,setE]=useState(()=>JSON.parse(JSON.stringify(initialEntrega)));
  const [selectedMonth,setSelectedMonth]=useState(monthKey||"");
  const addUnit=()=>setE(p=>({...p,items:[...p.items,emptyDUnit()]}));
  const addPack=()=>setE(p=>({...p,items:[...p.items,emptyDPack()]}));
  const delItem=i=>setE(p=>({...p,items:p.items.filter((_,idx)=>idx!==i)}));
  const setItem=(i,k,val)=>setE(p=>({...p,items:p.items.map((x,idx)=>idx===i?{...x,[k]:val}:x)}));
  const setPFl=(i,fk,val)=>setE(p=>({...p,items:p.items.map((x,idx)=>idx===i?{...x,flavors:{...x.flavors,[fk]:val}}:x)}));
  const cv=calcDeliveryItems(e.items);
  const hasErr=e.items.some(item=>item.type==="pack6"&&FLAVORS.reduce((a,f)=>a+(parseFloat(item.flavors[f.key])||0),0)!==6);
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1500,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"2rem 1rem 3rem"}}>
    <div style={{background:"#f4f3ef",borderRadius:16,width:"100%",maxWidth:680,boxShadow:"0 16px 48px rgba(0,0,0,0.25)"}}>
      <div style={{background:"#6C3483",borderRadius:"16px 16px 0 0",padding:"0.9rem 1.25rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"white",letterSpacing:2}}>{isEdit?"Editar entrega":"Registrar entrega"}</span>
          {e.items.length>0&&<span style={{background:"rgba(255,255,255,0.25)",color:"white",fontSize:12,fontWeight:600,padding:"2px 10px",borderRadius:100}}>{e.items.length} prod. · {fmtNum(cv.units)} unid.</span>}
        </div>
        <button onClick={onCancel} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"white",borderRadius:6,padding:"4px 12px",fontSize:14,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{padding:"1.25rem"}}>
        {/* Month selector — shown in edit mode */}
        {isEdit&&(
          <div style={{marginBottom:"1.25rem",padding:"10px 14px",background:"#F3EAFB",borderRadius:8,border:"0.5px solid #D7BDE2"}}>
            <label style={lbl}>Mes al que pertenece esta entrega</label>
            <select value={selectedMonth} onChange={ev=>setSelectedMonth(ev.target.value)} style={sel}>
              <option value="">Seleccionar mes...</option>
              {[...MONTH_LIST].reverse().map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12,marginBottom:"1.25rem"}}>
          <div><label style={lbl}>Canal de entrega</label><select value={e.channel} onChange={ev=>setE(p=>({...p,channel:ev.target.value}))} style={sel}>{DELIVERY_CHANNELS.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
          <div><label style={lbl}>Nombre / comentario</label><input type="text" value={e.channelNote} onChange={ev=>setE(p=>({...p,channelNote:ev.target.value}))} placeholder="ej: @usuario, nombre atleta, nombre team..." style={inp}/></div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
          <span style={{fontSize:13,fontWeight:500,color:"#444"}}>Productos entregados</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addUnit} style={{padding:"6px 14px",background:"white",border:"0.5px solid #6C3483",color:"#6C3483",borderRadius:7,fontSize:12,fontWeight:500,cursor:"pointer"}}>+ Unidad</button>
            <button onClick={addPack} style={{padding:"6px 14px",background:"white",border:"0.5px solid #6C3483",color:"#6C3483",borderRadius:7,fontSize:12,fontWeight:500,cursor:"pointer"}}>+ Mix 6-pack</button>
          </div>
        </div>
        {e.items.length===0&&<div style={{fontSize:13,color:"#bbb",textAlign:"center",padding:"20px 0"}}>Agrega productos con los botones de arriba.</div>}
        {e.items.map((item,i)=>(
          <div key={i} style={{background:"white",border:"1px solid #D7BDE2",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:11,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color:"#6C3483",background:"#F3EAFB",padding:"3px 10px",borderRadius:100}}>{item.type==="pack6"?"Mix 6-pack":"Unidad"}</span>
              <button onClick={()=>delItem(i)} style={{padding:"3px 9px",background:"transparent",border:"0.5px solid #F09595",color:"#A32D2D",borderRadius:6,fontSize:12,cursor:"pointer"}}>✕</button>
            </div>
            {item.type==="unit"&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><label style={lbl}>Sabor</label><select value={item.flavor} onChange={ev=>setItem(i,"flavor",ev.target.value)} style={sel}>{FLAVORS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
              <div><label style={lbl}>Unidades</label><input type="number" value={item.qty} onChange={ev=>setItem(i,"qty",ev.target.value)} placeholder="ej: 12" style={inp}/></div>
            </div>)}
            {item.type==="pack6"&&(<>
              <div style={{marginBottom:10}}><label style={lbl}>Packs a entregar</label><input type="number" value={item.packs} onChange={ev=>setItem(i,"packs",ev.target.value)} placeholder="ej: 3" style={{...inp,maxWidth:200}}/></div>
              <div style={{background:"#f7f4fb",border:"0.5px solid #D7BDE2",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#6C3483",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:8}}>Sabores por pack — deben sumar 6</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  {FLAVORS.map(f=>(<div key={f.key}><label style={{...lbl,display:"flex",alignItems:"center",gap:5}}><span style={{width:7,height:7,borderRadius:"50%",background:f.color,display:"inline-block"}}></span>{f.label}</label><input type="number" min="0" max="6" value={item.flavors[f.key]} onChange={ev=>setPFl(i,f.key,ev.target.value)} placeholder="0" style={sInp}/></div>))}
                </div>
                {(()=>{const s=FLAVORS.reduce((a,f)=>a+(parseFloat(item.flavors[f.key])||0),0);return <div style={{fontSize:12,marginTop:8,fontWeight:500,color:s===6?"#3B6D11":"#A32D2D"}}>{s===6?"✓ Suma correcta: 6":`⚠ Suma actual: ${s} de 6`}</div>;})()}
                {parseFloat(item.packs)>0&&(()=>{const parts=FLAVORS.map(f=>{const u=(parseFloat(item.packs)||0)*(parseFloat(item.flavors[f.key])||0);return u>0?`${fmtNum(u)} ${f.label}`:null;}).filter(Boolean);return parts.length>0?<div style={{fontSize:12,color:"#888",marginTop:4}}>Equiv: {parts.join(" · ")}</div>:null;})()}
              </div>
            </>)}
          </div>
        ))}
        {e.items.length>0&&<div style={{background:"#F3EAFB",border:"0.5px solid #D7BDE2",borderRadius:8,padding:"10px 14px",marginTop:4,fontSize:13}}><span style={{fontWeight:600}}>Resumen entrega: </span>{fmtNum(cv.units)} geles{Object.entries(cv.byFlavor).filter(([,u])=>u>0).length>0&&<div style={{marginTop:4,color:"#888"}}>{Object.entries(cv.byFlavor).filter(([,u])=>u>0).map(([k,u])=>`${FLAVORS.find(f=>f.key===k)?.label}: ${fmtNum(u)}`).join(" · ")}</div>}</div>}
        <div style={{display:"flex",gap:10,marginTop:"1rem"}}>
          <button onClick={()=>!hasErr&&e.items.length>0&&onSave(e,selectedMonth)} disabled={hasErr||e.items.length===0||(isEdit&&!selectedMonth)} style={{padding:"10px 24px",background:hasErr||e.items.length===0||(isEdit&&!selectedMonth)?"#ccc":"#6C3483",color:"white",border:"none",borderRadius:8,fontSize:14,fontWeight:500,cursor:hasErr||e.items.length===0||(isEdit&&!selectedMonth)?"not-allowed":"pointer"}}>{isEdit?"Guardar cambios":"Guardar entrega"}</button>
          <button onClick={onCancel} style={{padding:"10px 20px",background:"transparent",border:"0.5px solid rgba(0,0,0,0.2)",borderRadius:8,fontSize:14,cursor:"pointer",color:"#555"}}>Cancelar</button>
        </div>
      </div>
    </div>
  </div>);
}

// ─── Merma Modal ──────────────────────────────────────────────────────────────
function MermaModal({initialMerma,onSave,onCancel,monthKey,isEdit}){
  const [mr,setMr]=useState(()=>JSON.parse(JSON.stringify(initialMerma)));
  const [selectedMonth,setSelectedMonth]=useState(monthKey||"");
  const addUnit=()=>setMr(p=>({...p,items:[...p.items,emptyDUnit()]}));
  const addPack=()=>setMr(p=>({...p,items:[...p.items,emptyDPack()]}));
  const delItem=i=>setMr(p=>({...p,items:p.items.filter((_,idx)=>idx!==i)}));
  const setItem=(i,k,val)=>setMr(p=>({...p,items:p.items.map((x,idx)=>idx===i?{...x,[k]:val}:x)}));
  const setPFl=(i,fk,val)=>setMr(p=>({...p,items:p.items.map((x,idx)=>idx===i?{...x,flavors:{...x.flavors,[fk]:val}}:x)}));
  const cv=calcDeliveryItems(mr.items);
  const hasErr=mr.items.some(item=>item.type==="pack6"&&FLAVORS.reduce((a,f)=>a+(parseFloat(item.flavors[f.key])||0),0)!==6);
  const inp2={padding:"8px 12px",borderRadius:8,border:"0.5px solid rgba(0,0,0,0.2)",fontSize:14,outline:"none",background:"white",width:"100%",boxSizing:"border-box"};
  const sel2={...inp2,cursor:"pointer"};
  const lbl2={fontSize:12,color:"#666",fontWeight:500,display:"block",marginBottom:4};
  const sInp2={...inp2,fontSize:13,padding:"6px 10px"};
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1500,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"2rem 1rem 3rem"}}>
    <div style={{background:"#f4f3ef",borderRadius:16,width:"100%",maxWidth:680,boxShadow:"0 16px 48px rgba(0,0,0,0.25)"}}>
      <div style={{background:"#7F8C8D",borderRadius:"16px 16px 0 0",padding:"0.9rem 1.25rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:"white",letterSpacing:2}}>{isEdit?"Editar merma":"Registrar merma"}</span>
          {mr.items.length>0&&<span style={{background:"rgba(255,255,255,0.25)",color:"white",fontSize:12,fontWeight:600,padding:"2px 10px",borderRadius:100}}>{mr.items.length} prod. · {fmtNum(cv.units)} unid.</span>}
        </div>
        <button onClick={onCancel} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"white",borderRadius:6,padding:"4px 12px",fontSize:14,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{padding:"1.25rem"}}>
        {isEdit&&(
          <div style={{marginBottom:"1.25rem",padding:"10px 14px",background:"#F2F3F4",borderRadius:8,border:"0.5px solid #ccc"}}>
            <label style={lbl2}>Mes al que pertenece esta merma</label>
            <select value={selectedMonth} onChange={ev=>setSelectedMonth(ev.target.value)} style={sel2}>
              <option value="">Seleccionar mes...</option>
              {[...MONTH_LIST].reverse().map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
        <div style={{marginBottom:"1.25rem"}}>
          <label style={lbl2}>Motivo / comentario (opcional)</label>
          <input type="text" value={mr.motivo} onChange={ev=>setMr(p=>({...p,motivo:ev.target.value}))} placeholder="ej: producto vencido, golpeado, error de conteo..." style={inp2}/>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
          <span style={{fontSize:13,fontWeight:500,color:"#444"}}>Unidades perdidas</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={addUnit} style={{padding:"6px 14px",background:"white",border:"0.5px solid #7F8C8D",color:"#555",borderRadius:7,fontSize:12,fontWeight:500,cursor:"pointer"}}>+ Unidad</button>
            <button onClick={addPack} style={{padding:"6px 14px",background:"white",border:"0.5px solid #7F8C8D",color:"#555",borderRadius:7,fontSize:12,fontWeight:500,cursor:"pointer"}}>+ Mix 6-pack</button>
          </div>
        </div>
        {mr.items.length===0&&<div style={{fontSize:13,color:"#bbb",textAlign:"center",padding:"20px 0"}}>Agrega los productos con merma.</div>}
        {mr.items.map((item,i)=>(
          <div key={i} style={{background:"white",border:"1px solid #D5D8DC",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:11,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color:"#555",background:"#F2F3F4",padding:"3px 10px",borderRadius:100}}>{item.type==="pack6"?"Mix 6-pack":"Unidad"}</span>
              <button onClick={()=>delItem(i)} style={{padding:"3px 9px",background:"transparent",border:"0.5px solid #F09595",color:"#A32D2D",borderRadius:6,fontSize:12,cursor:"pointer"}}>✕</button>
            </div>
            {item.type==="unit"&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><label style={lbl2}>Sabor</label><select value={item.flavor} onChange={ev=>setItem(i,"flavor",ev.target.value)} style={sel2}>{FLAVORS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
              <div><label style={lbl2}>Unidades</label><input type="number" value={item.qty} onChange={ev=>setItem(i,"qty",ev.target.value)} placeholder="ej: 5" style={inp2}/></div>
            </div>)}
            {item.type==="pack6"&&(<>
              <div style={{marginBottom:10}}><label style={lbl2}>Packs</label><input type="number" value={item.packs} onChange={ev=>setItem(i,"packs",ev.target.value)} placeholder="ej: 2" style={{...inp2,maxWidth:200}}/></div>
              <div style={{background:"#f7f7f5",border:"0.5px solid #D5D8DC",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#555",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:8}}>Sabores por pack — deben sumar 6</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  {FLAVORS.map(f=>(<div key={f.key}><label style={{...lbl2,display:"flex",alignItems:"center",gap:5}}><span style={{width:7,height:7,borderRadius:"50%",background:f.color,display:"inline-block"}}></span>{f.label}</label><input type="number" min="0" max="6" value={item.flavors[f.key]} onChange={ev=>setPFl(i,f.key,ev.target.value)} placeholder="0" style={sInp2}/></div>))}
                </div>
                {(()=>{const s=FLAVORS.reduce((a,f)=>a+(parseFloat(item.flavors[f.key])||0),0);return <div style={{fontSize:12,marginTop:8,fontWeight:500,color:s===6?"#3B6D11":"#A32D2D"}}>{s===6?"✓ Suma correcta: 6":`⚠ Suma actual: ${s} de 6`}</div>;})()}
              </div>
            </>)}
          </div>
        ))}
        {mr.items.length>0&&<div style={{background:"#F2F3F4",border:"0.5px solid #D5D8DC",borderRadius:8,padding:"10px 14px",marginTop:4,fontSize:13}}><span style={{fontWeight:600}}>Merma total: </span>{fmtNum(cv.units)} unidades{Object.entries(cv.byFlavor).filter(([,u])=>u>0).length>0&&<div style={{marginTop:4,color:"#888"}}>{Object.entries(cv.byFlavor).filter(([,u])=>u>0).map(([k,u])=>`${FLAVORS.find(f=>f.key===k)?.label}: ${fmtNum(u)}`).join(" · ")}</div>}</div>}
        <div style={{display:"flex",gap:10,marginTop:"1rem"}}>
          <button onClick={()=>!hasErr&&mr.items.length>0&&onSave(mr,selectedMonth)} disabled={hasErr||mr.items.length===0||(isEdit&&!selectedMonth)} style={{padding:"10px 24px",background:hasErr||mr.items.length===0||(isEdit&&!selectedMonth)?"#ccc":"#7F8C8D",color:"white",border:"none",borderRadius:8,fontSize:14,fontWeight:500,cursor:hasErr||mr.items.length===0||(isEdit&&!selectedMonth)?"not-allowed":"pointer"}}>{isEdit?"Guardar cambios":"Guardar merma"}</button>
          <button onClick={onCancel} style={{padding:"10px 20px",background:"transparent",border:"0.5px solid rgba(0,0,0,0.2)",borderRadius:8,fontSize:14,cursor:"pointer",color:"#555"}}>Cancelar</button>
        </div>
      </div>
    </div>
  </div>);
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App(){
  const [stock,       setStock]       = useState(null);
  const [months,      setMonths]      = useState([]);
  const [view,        setView]        = useState("dashboard");
  const [saved,       setSaved]       = useState(false);
  const [activeMonth, setActiveMonth] = useState(null);
  const [monthDraft,  setMonthDraft]  = useState({month:"",cogs:""});
  const [confirm,     setConfirm]     = useState(null);
  const [ventaModal,  setVentaModal]  = useState(false);
  const [editVenta,   setEditVenta]   = useState(null);
  const [entregaModal,setEntregaModal]= useState(false);
  const [editEntrega, setEditEntrega] = useState(null);
  const [mermaModal,  setMermaModal]  = useState(false);
  const [editMerma,   setEditMerma]   = useState(null);
  const [stockModal,  setStockModal]  = useState(false);
  const [delConf,     setDelConf]     = useState(null);

  // Dashboard filters — month is single select, others are multi-chip
  const [fMonth,   setFMonth]   = useState(""); // single month key or "" = all
  const [fFlavors, setFFlavors] = useState([]);
  const [fChan,    setFChan]    = useState([]);
  const [fDChan,   setFDChan]   = useState([]);

  // Historial tab
  const [histTab, setHistTab] = useState("ventas"); // "ventas" | "entregas" | "mermas"

  useEffect(()=>{
    (async()=>{
      try{
        const row = await sbGet();
        if(row && row.stock) {
          const s = row.stock;
          const m = (row.months ?? []).map(mo=>({...mo, entregas:mo.entregas??[], mermas:mo.mermas??[]}));
          setStock(s); setMonths(m);
        } else {
          setStock(SEED_STOCK); setMonths(SEED_MONTHS);
          await sbSet(SEED_STOCK, SEED_MONTHS);
        }
      }catch{setStock(SEED_STOCK);setMonths(SEED_MONTHS);}
    })();
  },[]);

  const persist=useCallback(async(s,m)=>{setStock(s);setMonths(m);await sbSet(s,m);},[]);
  const saveStock=s=>{persist(s,months);setStockModal(false);};

  const confirmMonthDraft=()=>{
    const name=monthDraft.month.trim(),cogs=parseFloat(monthDraft.cogs)||0;
    if(!name)return;
    const existing=months.find(m=>norm(m.month)===norm(name));
    setConfirm({
      message:existing?`El mes "${existing.month}" ya existe. Se actualizará el COGS a $${cogs}. Las ventas y entregas se mantienen.`:`Se creará el mes "${name}" con COGS $${cogs}.`,
      onConfirm:()=>{
        const nm=existing?months.map(m=>norm(m.month)===norm(name)?{...m,cogs}:m):[...months,{month:name,cogs,ventas:[],entregas:[]}];
        persist(stock,nm);setActiveMonth({month:existing?existing.month:name,cogs});setConfirm(null);
      },
    });
  };

  const saveNewVenta=v=>{if(!activeMonth)return;persist(stock,months.map(m=>norm(m.month)===norm(activeMonth.month)?{...m,ventas:[...m.ventas,{...v,id:Date.now()}]}:m));setVentaModal(false);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const saveEditVenta=(v,newMonthKey)=>{
    if(!editVenta)return;
    const oldKey=editVenta.monthKey;
    const targetKey=newMonthKey||oldKey;
    let nm=months;
    // Remove from old month
    nm=nm.map(m=>norm(m.month)===norm(oldKey)?{...m,ventas:m.ventas.filter((_,i)=>i!==editVenta.vIdx)}:m);
    // If target month doesn't exist yet, create it (keep cogs from old)
    const oldMonth=months.find(m=>norm(m.month)===norm(oldKey));
    if(!nm.find(m=>norm(m.month)===norm(targetKey))){
      nm=[...nm,{month:targetKey,cogs:oldMonth?.cogs||0,ventas:[],entregas:[]}];
    }
    // Add to target month
    nm=nm.map(m=>norm(m.month)===norm(targetKey)?{...m,ventas:[...m.ventas,{...v,id:v.id||Date.now()}]}:m);
    persist(stock,nm);setEditVenta(null);
  };
  const deleteVenta=(mk,vi)=>persist(stock,months.map(m=>norm(m.month)===norm(mk)?{...m,ventas:m.ventas.filter((_,i)=>i!==vi)}:m));

  const saveNewEntrega=e=>{if(!activeMonth)return;persist(stock,months.map(m=>norm(m.month)===norm(activeMonth.month)?{...m,entregas:[...(m.entregas||[]),{...e,id:Date.now()}]}:m));setEntregaModal(false);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const saveEditEntrega=(e,newMonthKey)=>{
    if(!editEntrega)return;
    const oldKey=editEntrega.monthKey;
    const targetKey=newMonthKey||oldKey;
    let nm=months;
    // Remove from old month
    nm=nm.map(m=>norm(m.month)===norm(oldKey)?{...m,entregas:(m.entregas||[]).filter((_,i)=>i!==editEntrega.eIdx)}:m);
    // If target month doesn't exist yet, create it
    const oldMonth=months.find(m=>norm(m.month)===norm(oldKey));
    if(!nm.find(m=>norm(m.month)===norm(targetKey))){
      nm=[...nm,{month:targetKey,cogs:oldMonth?.cogs||0,ventas:[],entregas:[]}];
    }
    // Add to target month
    nm=nm.map(m=>norm(m.month)===norm(targetKey)?{...m,entregas:[...(m.entregas||[]),{...e,id:e.id||Date.now()}]}:m);
    persist(stock,nm);setEditEntrega(null);
  };
  const deleteEntrega=(mk,ei)=>persist(stock,months.map(m=>norm(m.month)===norm(mk)?{...m,entregas:(m.entregas||[]).filter((_,i)=>i!==ei)}:m));

  // ── Merma handlers ────────────────────────────────────────────────────────
  const saveNewMerma=mr=>{if(!activeMonth)return;persist(stock,months.map(m=>norm(m.month)===norm(activeMonth.month)?{...m,mermas:[...(m.mermas||[]),{...mr,id:Date.now()}]}:m));setMermaModal(false);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const saveEditMerma=(mr,newMonthKey)=>{
    if(!editMerma)return;
    const oldKey=editMerma.monthKey, targetKey=newMonthKey||oldKey;
    let nm=months;
    nm=nm.map(m=>norm(m.month)===norm(oldKey)?{...m,mermas:(m.mermas||[]).filter((_,i)=>i!==editMerma.mIdx)}:m);
    const oldMonth=months.find(m=>norm(m.month)===norm(oldKey));
    if(!nm.find(m=>norm(m.month)===norm(targetKey))) nm=[...nm,{month:targetKey,cogs:oldMonth?.cogs||0,ventas:[],entregas:[],mermas:[]}];
    nm=nm.map(m=>norm(m.month)===norm(targetKey)?{...m,mermas:[...(m.mermas||[]),{...mr,id:mr.id||Date.now()}]}:m);
    persist(stock,nm);setEditMerma(null);
  };
  const deleteMerma=(mk,mi)=>persist(stock,months.map(m=>norm(m.month)===norm(mk)?{...m,mermas:(m.mermas||[]).filter((_,i)=>i!==mi)}:m));

  const handleReset=async()=>{await persist(SEED_STOCK,SEED_MONTHS);setDelConf(null);};

  // ── Computed ──────────────────────────────────────────────────────────────
  const computed  = sortMonths(months.map(m=>({...m,...calcMonth(m)})));
  const currStock = stock?calcRunningStock(stock,months):mkMap(0);

  // 1. Filter months
  const filtMonths = fMonth ? computed.filter(m=>m.month===fMonth) : computed;

  // 2. For ventas: filter by channel, then slice by flavor for revenue/units
  //    If no flavor filter → use calcItems directly (exact). If flavor filter → prorate pack revenue.
  const filtVentas = filtMonths.flatMap(m=>(m.ventas||[]).map(v=>{
    if(fChan.length>0&&!fChan.includes(v.channel))return null;
    // No flavor filter — use exact calc
    if(fFlavors.length===0){
      const r=calcItems(v.items);
      return {month:m.month,cogs:m.cogs,...v,...r};
    }
    // Flavor filter active — recalculate restricting to selected flavors
    let units=0,revenue=0;
    const byFlavor=mkMap(0);
    (v.items||[]).forEach(item=>{
      if(item.type==="unit"){
        if(!fFlavors.includes(item.flavor))return;
        const u=parseFloat(item.qty)||0;
        byFlavor[item.flavor]+=u; units+=u;
        revenue+=u*(parseFloat(item.price)||0);
      } else {
        const p=parseFloat(item.packs)||0;
        const packPrice=parseFloat(item.price)||0;
        // Units per pack for filtered flavors vs total per pack
        let filtU=0, totalU=0;
        FLAVORS.forEach(f=>{
          const u=p*(parseFloat(item.flavors[f.key])||0);
          totalU+=u;
          if(fFlavors.includes(f.key)){filtU+=u; byFlavor[f.key]+=u;}
        });
        units+=filtU;
        // Prorate pack revenue by proportion of filtered units
        if(totalU>0) revenue+=p*packPrice*(filtU/totalU);
      }
    });
    if(units===0)return null;
    return {month:m.month,cogs:m.cogs,...v,byFlavor,units,revenue};
  }).filter(Boolean));

  // 3. For entregas: filter by delivery channel, then by flavor
  const filtEntregas = filtMonths.flatMap(m=>(m.entregas||[]).map(e=>{
    if(fDChan.length>0&&!fDChan.includes(e.channel))return null;
    let units=0;
    const byFlavor=mkMap(0);
    (e.items||[]).forEach(item=>{
      if(item.type==="unit"){
        const f=item.flavor;
        if(fFlavors.length>0&&!fFlavors.includes(f))return;
        const u=parseFloat(item.qty)||0;
        byFlavor[f]+=u; units+=u;
      } else {
        const p=parseFloat(item.packs)||0;
        FLAVORS.forEach(f=>{
          if(fFlavors.length>0&&!fFlavors.includes(f.key))return;
          const u=p*(parseFloat(item.flavors[f.key])||0);
          byFlavor[f.key]+=u; units+=u;
        });
      }
    });
    if(units===0&&fFlavors.length>0)return null;
    return {month:m.month,...e,byFlavor,units};
  }).filter(Boolean));

  // 4. Aggregate
  const aggVentas = filtVentas.reduce((acc,v)=>{
    acc.totalUnits+=v.units; acc.totalRevenue+=v.revenue;
    FLAVORS.forEach(f=>{acc.byFlavor[f.key]+=(v.byFlavor[f.key]||0);});
    CHANNELS.forEach(c=>{if(v.channel===c.key)acc.byChannel[c.key]+=v.units;});
    return acc;
  },{totalUnits:0,totalRevenue:0,byFlavor:mkMap(0),byChannel:Object.fromEntries(CHANNELS.map(c=>[c.key,0]))});
  aggVentas.price=aggVentas.totalUnits>0?Math.round(aggVentas.totalRevenue/aggVentas.totalUnits):0;

  const aggEntregas = filtEntregas.reduce((acc,e)=>{
    acc.totalUnits+=e.units;
    DELIVERY_CHANNELS.forEach(c=>{if(e.channel===c.key)acc.byChannel[c.key]+=e.units;});
    return acc;
  },{totalUnits:0,byChannel:Object.fromEntries(DELIVERY_CHANNELS.map(c=>[c.key,0]))});

  // Filtered mermas (flavor filter applies, no channel filter for mermas)
  const filtMermas = filtMonths.flatMap(m=>(m.mermas||[]).map(mr=>{
    let units=0; const byFlavor=mkMap(0);
    (mr.items||[]).forEach(item=>{
      if(item.type==="unit"){
        if(fFlavors.length>0&&!fFlavors.includes(item.flavor))return;
        const u=parseFloat(item.qty)||0; byFlavor[item.flavor]+=u; units+=u;
      } else {
        const p=parseFloat(item.packs)||0;
        FLAVORS.forEach(f=>{ if(fFlavors.length>0&&!fFlavors.includes(f.key))return; const u=p*(parseFloat(item.flavors[f.key])||0); byFlavor[f.key]+=u; units+=u; });
      }
    });
    if(units===0&&fFlavors.length>0)return null;
    return {month:m.month,cogs:m.cogs,...mr,byFlavor,units};
  }).filter(Boolean));
  const aggMermas = filtMermas.reduce((acc,mr)=>{acc.totalUnits+=mr.units; acc.totalCost+=mr.units*(mr.cogs||0); return acc;},{totalUnits:0,totalCost:0});

  // 5. MRR chart — per filtered month, stacked by channel
  const mrrChartData = filtMonths.map((d,i)=>{
    const mVentas=filtVentas.filter(v=>v.month===d.month);
    const mrr=mVentas.reduce((a,v)=>a+v.revenue,0);
    const totalUnits=mVentas.reduce((a,v)=>a+v.units,0);
    const prevMrr=i>0?filtVentas.filter(v=>v.month===filtMonths[i-1].month).reduce((a,v)=>a+v.revenue,0):null;
    const byChan = Object.fromEntries(CHANNELS.map(c=>[c.key, 0]));
    mVentas.forEach(v=>{ byChan[v.channel]=(byChan[v.channel]||0)+v.revenue; });
    return {month:d.month, mrr, totalUnits, growth:prevMrr!=null?parseFloat(pct(mrr,prevMrr)):null, ...byChan};
  });

  const marginData=filtMonths.map(d=>({month:d.month,precio:d.price,cogs:d.cogs,margen:d.price-d.cogs}));

  // 6. Pie charts — from aggregated data
  const flavorData=FLAVORS.map(f=>({name:f.label,value:aggVentas.byFlavor[f.key]||0,color:f.color}));
  const chanData  =CHANNELS.map(c=>({name:c.label,value:aggVentas.byChannel[c.key]||0,color:c.color}));
  const fTotal=flavorData.reduce((a,b)=>a+b.value,0);
  const cTotal=chanData.reduce((a,b)=>a+b.value,0);

  // 7. Delivery chart — filtered, value = units × COGS of that month
  const avgCogs = filtMonths.length>0 ? Math.round(filtMonths.reduce((a,m)=>a+(m.cogs||0),0)/filtMonths.length) : 0;
  const delivChartData=DELIVERY_CHANNELS.map(c=>({
    name:c.label,color:c.color,
    unidades:filtEntregas.filter(e=>e.channel===c.key).reduce((a,e)=>a+e.units,0),
  })).map(d=>({...d,valor:Math.round(d.unidades*avgCogs)}));
  const totalDelivUnits=delivChartData.reduce((a,b)=>a+b.unidades,0);
  const totalDelivValor=Math.round(totalDelivUnits*avgCogs);

  // Prev month comparison for deliveries (unfiltered, always last 2 months)
  const lastComp = computed[computed.length-1];
  const prevComp = computed[computed.length-2];
  const totalDelivPrev=prevComp?.totalDelivUnits||0;
  const totalDelivPrevValor=Math.round(totalDelivPrev*(prevComp?.price||0));

  const ltv=aggVentas.price?aggVentas.price*3*1.5:0;
  const cac=aggVentas.totalUnits>0?Math.round(aggVentas.totalRevenue*0.12/(aggVentas.totalUnits*0.15)):0;
  const be=aggVentas.price&&aggVentas.price>(lastComp?.cogs||0)?Math.round((aggVentas.totalRevenue*0.35)/((aggVentas.price-(lastComp?.cogs||0)))):0;

  // Active month helpers
  const activeMData=activeMonth?months.find(m=>norm(m.month)===norm(activeMonth.month)):null;
  const activeCalc=activeMData?calcMonth(activeMData):null;
  const priorMonths=activeMData?months.slice(0,months.findIndex(m=>norm(m.month)===norm(activeMonth.month))):months;
  const stockBefore=stock?calcRunningStock(stock,priorMonths):mkMap(0);
  const stockAfter=activeCalc?Object.fromEntries(FLAVORS.map(f=>[f.key,stockBefore[f.key]-activeCalc.byFlavor[f.key]-activeCalc.delivByFlavor[f.key]])):stockBefore;

  const toggleFilter=(arr,setArr,key)=>setArr(prev=>prev.includes(key)?prev.filter(k=>k!==key):[...prev,key]);

  const NAV=[["dashboard","📊","Tablero"],["ventas","＋","Registrar ventas"],["entregas","🎁","Entrega influencers"],["mermas","⚠️","Registrar mermas"],["historial","📋","Historial"]];
  const activeFilterCount=(fMonth?1:0)+fFlavors.length+fChan.length+fDChan.length;

  // ── All rows for historial ────────────────────────────────────────────────
  const allVentaRows = [...months].sort((a,b)=>monthToIndex(a.month)-monthToIndex(b.month)).flatMap(m=>
    (m.ventas||[]).map((v,vi)=>{
      const r=calcItems(v.items);
      const ch=CHANNELS.find(c=>c.key===v.channel);
      return {kind:"venta",month:m.month,cogs:m.cogs,ch,channelNote:v.channelNote,units:r.units,revenue:r.revenue,byFlavor:r.byFlavor,price:r.units>0?Math.round(r.revenue/r.units):0,monthKey:m.month,vIdx:months.find(mm=>norm(mm.month)===norm(m.month))?.ventas?.indexOf(v)??vi,raw:v};
    })
  );
  const allEntregaRows = [...months].sort((a,b)=>monthToIndex(a.month)-monthToIndex(b.month)).flatMap(m=>
    (m.entregas||[]).map((e,ei)=>{
      const r=calcDeliveryItems(e.items);
      const ch=DELIVERY_CHANNELS.find(c=>c.key===e.channel);
      return {kind:"entrega",month:m.month,ch,channelNote:e.channelNote,units:r.units,byFlavor:r.byFlavor,monthKey:m.month,eIdx:months.find(mm=>norm(mm.month)===norm(m.month))?.entregas?.indexOf(e)??ei,raw:e};
    })
  );
  const allMermaRows = [...months].sort((a,b)=>monthToIndex(a.month)-monthToIndex(b.month)).flatMap(m=>
    (m.mermas||[]).map((mr,mi)=>{
      const r=calcDeliveryItems(mr.items);
      return {kind:"merma",month:m.month,motivo:mr.motivo,units:r.units,byFlavor:r.byFlavor,monthKey:m.month,mIdx:months.find(mm=>norm(mm.month)===norm(m.month))?.mermas?.indexOf(mr)??mi,raw:mr};
    })
  );

  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:"#f4f3ef",color:"#1a1a1a"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Bebas+Neue&display=swap" rel="stylesheet"/>
      {confirm      &&<ConfirmDialog {...confirm} onCancel={()=>setConfirm(null)}/>}
      {stockModal   &&<StockSetupModal current={stock||mkMap(0)} onSave={saveStock} onCancel={()=>setStockModal(false)} isEdit={!!stock}/>}
      {ventaModal   &&<VentaModal initialVenta={emptyVenta()} onSave={saveNewVenta} onCancel={()=>setVentaModal(false)} isEdit={false}/>}
      {editVenta    &&<VentaModal initialVenta={editVenta.venta} onSave={saveEditVenta} onCancel={()=>setEditVenta(null)} monthKey={editVenta.monthKey} isEdit={true}/>}
      {entregaModal &&<EntregaModal initialEntrega={emptyEntrega()} onSave={saveNewEntrega} onCancel={()=>setEntregaModal(false)} isEdit={false}/>}
      {editEntrega  &&<EntregaModal initialEntrega={editEntrega.entrega} onSave={saveEditEntrega} onCancel={()=>setEditEntrega(null)} monthKey={editEntrega.monthKey} isEdit={true}/>}
      {mermaModal   &&<MermaModal initialMerma={emptyMerma()} onSave={saveNewMerma} onCancel={()=>setMermaModal(false)} isEdit={false}/>}
      {editMerma    &&<MermaModal initialMerma={editMerma.merma} onSave={saveEditMerma} onCancel={()=>setEditMerma(null)} monthKey={editMerma.monthKey} isEdit={true}/>}
      {!stock       &&<StockSetupModal current={mkMap(0)} onSave={saveStock} isEdit={false}/>}

      <div style={{background:"#D85A30",padding:"1rem 1.5rem",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"white",letterSpacing:2}}>AVE</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",borderLeft:"1px solid rgba(255,255,255,0.3)",paddingLeft:12}}>Dashboard de métricas</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {NAV.map(([id,icon,label])=>(
            <button key={id} onClick={()=>{setView(id);if((id==="ventas"||id==="entregas"||id==="mermas")&&!activeMonth)setMonthDraft({month:"",cogs:""}); }} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:8,border:view===id?"1.5px solid #D85A30":"0.5px solid rgba(0,0,0,0.15)",background:view===id?"#FAECE7":"transparent",color:view===id?"#993C1D":"#555",fontWeight:view===id?500:400,fontSize:12,cursor:"pointer"}}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:960,margin:"0 auto",padding:"1.5rem 1rem 3rem"}}>

        {/* ══ DASHBOARD ══════════════════════════════════════════════════════ */}
        {view==="dashboard"&&(
          <>
            {saved&&<div style={{background:"#EAF3DE",color:"#3B6D11",borderRadius:8,padding:"10px 16px",fontSize:13,marginBottom:12}}>✓ Guardado correctamente</div>}

            {/* ── Filters ── */}
            <Card style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:500}}>Filtros del tablero {activeFilterCount>0&&<span style={{background:"#D85A30",color:"white",fontSize:11,padding:"1px 7px",borderRadius:100,marginLeft:6}}>{activeFilterCount}</span>}</div>
                {activeFilterCount>0&&<button onClick={()=>{setFMonth("");setFFlavors([]);setFChan([]);setFDChan([]);}} style={{fontSize:12,color:"#888",background:"transparent",border:"0.5px solid #ccc",padding:"3px 10px",borderRadius:6,cursor:"pointer"}}>Limpiar filtros</button>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {/* Month — single dropdown */}
                <div style={{display:"grid",gridTemplateColumns:"160px 1fr",alignItems:"center",gap:12}}>
                  <div style={{fontSize:11,color:"#aaa",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.07em"}}>Mes</div>
                  <select value={fMonth} onChange={e=>setFMonth(e.target.value)} style={{...sel,maxWidth:200,fontSize:13,padding:"6px 10px"}}>
                    <option value="">Todos los meses</option>
                    {[...MONTH_LIST].reverse().map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                {/* Flavors — chips */}
                <div style={{display:"grid",gridTemplateColumns:"160px 1fr",alignItems:"center",gap:12}}>
                  <div style={{fontSize:11,color:"#aaa",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.07em"}}>Sabor</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {FLAVORS.map(f=><FilterChip key={f.key} label={f.label} color={f.color} active={fFlavors.includes(f.key)} onClick={()=>toggleFilter(fFlavors,setFFlavors,f.key)}/>)}
                  </div>
                </div>
                {/* Channels — chips */}
                <div style={{display:"grid",gridTemplateColumns:"160px 1fr",alignItems:"center",gap:12}}>
                  <div style={{fontSize:11,color:"#aaa",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.07em"}}>Canal de venta</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {CHANNELS.map(c=><FilterChip key={c.key} label={c.label} color={c.color} active={fChan.includes(c.key)} onClick={()=>toggleFilter(fChan,setFChan,c.key)}/>)}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"160px 1fr",alignItems:"center",gap:12}}>
                  <div style={{fontSize:11,color:"#aaa",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.07em"}}>Canal de entrega</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {DELIVERY_CHANNELS.map(c=><FilterChip key={c.key} label={c.label} color={c.color} active={fDChan.includes(c.key)} onClick={()=>toggleFilter(fDChan,setFDChan,c.key)}/>)}
                  </div>
                </div>
              </div>
            </Card>

            {/* Stock */}
            <SectionLabel>Inventario actual</SectionLabel>
            <Card style={{marginBottom:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div><div style={{fontSize:14,fontWeight:500}}>Stock disponible</div><div style={{fontSize:12,color:"#888",marginTop:2}}>Stock inicial − ventas − entregas − mermas</div></div>
                <button onClick={()=>setStockModal(true)} style={{fontSize:12,color:"#185FA5",background:"transparent",border:"0.5px solid #B5D4F4",padding:"5px 12px",borderRadius:7,cursor:"pointer"}}>Modificar stock inicial</button>
              </div>
              {FLAVORS.map((f,i)=>{
                const s=currStock[f.key]??0,init=stock?.[f.key]??0;
                const bar=init>0?Math.round(Math.max(s,0)/init*100):0;
                const crit=s<=30,low=s<=80&&s>30;
                return(<div key={f.key} style={{display:"grid",gridTemplateColumns:"150px 1fr 110px",alignItems:"center",gap:12,padding:"8px 0",borderBottom:i<FLAVORS.length-1?"0.5px solid rgba(0,0,0,0.07)":"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:500}}><div style={{width:10,height:10,borderRadius:"50%",background:f.color,flexShrink:0}}></div>{f.label}</div>
                  <div style={{background:"#f0f0ec",borderRadius:4,height:10,overflow:"hidden"}}><div style={{width:`${bar}%`,height:"100%",background:f.color,borderRadius:4,transition:"width 0.3s"}}/></div>
                  <div style={{textAlign:"right"}}><span style={{fontSize:14,fontWeight:500,color:crit?"#A32D2D":low?"#854F0B":"#1a1a1a"}}>{fmtNum(s)} u.</span>{crit&&<div><Pill label="Stock crítico" type="red"/></div>}{low&&<div><Pill label="Stock bajo" type="amber"/></div>}</div>
                </div>);
              })}
              <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,marginTop:4,borderTop:"0.5px solid rgba(0,0,0,0.08)",fontSize:13}}>
                <span style={{color:"#888"}}>Total</span><span style={{fontWeight:500}}>{fmtNum(Object.values(currStock).reduce((a,b)=>a+b,0))} unidades</span>
              </div>
            </Card>

            <SectionLabel>Resumen {activeFilterCount>0?"(filtrado)":""}</SectionLabel>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10,marginBottom:4}}>
              {/* Ventas */}
              <div style={{background:"#EAF3DE",borderRadius:8,padding:"1rem",gridColumn:"span 1"}}>
                <div style={{fontSize:11,color:"#3B6D11",marginBottom:2}}>Ingresos por ventas</div>
                <div style={{fontSize:21,fontWeight:500,color:"#3B6D11"}}>{fmtMrr(aggVentas.totalRevenue)}</div>
                <div style={{fontSize:11,color:"#5a8a2a",marginTop:4,borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:4}}>Unidades vendidas</div>
                <div style={{fontSize:16,fontWeight:500,color:"#3B6D11"}}>{fmtNum(aggVentas.totalUnits)}</div>
                <div style={{fontSize:11,color:"#5a8a2a",marginTop:4,borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:4}}>Precio prom.</div>
                <div style={{fontSize:16,fontWeight:500,color:"#3B6D11"}}>{aggVentas.price?`$${fmtNum(aggVentas.price)}`:"—"}</div>
              </div>
              {/* Entregas */}
              <div style={{background:"#FCEBEB",borderRadius:8,padding:"1rem",gridColumn:"span 1"}}>
                <div style={{fontSize:11,color:"#A32D2D",marginBottom:2}}>Valor entregado</div>
                <div style={{fontSize:21,fontWeight:500,color:"#A32D2D"}}>−{fmtMrr(totalDelivValor)}</div>
                <div style={{fontSize:11,color:"#c04040",marginTop:4,borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:4}}>Geles entregados</div>
                <div style={{fontSize:16,fontWeight:500,color:"#A32D2D"}}>{fmtNum(aggEntregas.totalUnits)}</div>
              </div>
              {/* Mermas */}
              <div style={{background:"#FCEBEB",borderRadius:8,padding:"1rem",gridColumn:"span 1"}}>
                <div style={{fontSize:11,color:"#A32D2D",marginBottom:2}}>Pérdida por merma</div>
                <div style={{fontSize:21,fontWeight:500,color:"#A32D2D"}}>−{fmtMrr(aggMermas.totalCost)}</div>
                <div style={{fontSize:11,color:"#c04040",marginTop:4,borderTop:"0.5px solid rgba(0,0,0,0.07)",paddingTop:4}}>Geles en merma</div>
                <div style={{fontSize:16,fontWeight:500,color:"#A32D2D"}}>{fmtNum(aggMermas.totalUnits)}</div>
              </div>
            </div>

            <SectionLabel>Ingresos y crecimiento {activeFilterCount>0?"(filtrado)":""}</SectionLabel>
            <Card>
              <div style={{fontSize:14,fontWeight:500,marginBottom:2}}>Ingresos por ventas — CLP</div>
              <div style={{fontSize:12,color:"#888",marginBottom:10}}>Por canal de venta</div>
              <div style={{display:"flex",gap:16,marginBottom:10,fontSize:12,color:"#666",flexWrap:"wrap"}}>
                {CHANNELS.map(c=><span key={c.key} style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,borderRadius:2,background:c.color,display:"inline-block"}}></span>{c.label}</span>)}
                <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,borderRadius:"50%",background:"#2C3E50",display:"inline-block"}}></span>Geles vendidos</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={mrrChartData} margin={{top:4,right:50,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)"/>
                  <XAxis dataKey="month" tick={{fontSize:11,fill:"#888"}}/>
                  <YAxis yAxisId="left" tick={{fontSize:11,fill:"#888"}} tickFormatter={v=>`$${fmtNum(v)}`}/>
                  <YAxis yAxisId="right" orientation="right" tick={{fontSize:11,fill:"#2C3E50"}} tickFormatter={v=>fmtNum(v)} allowDecimals={false}/>
                  <Tooltip content={<CTip/>}/>
                  {CHANNELS.map((c,idx)=>(
                    <Bar key={c.key} yAxisId="left" dataKey={c.key} name={c.label} stackId="ingresos" fill={c.color} radius={idx===CHANNELS.length-1?[3,3,0,0]:[0,0,0,0]}/>
                  ))}
                  <Line yAxisId="right" dataKey="totalUnits" name="Geles vendidos" stroke="#2C3E50" strokeWidth={2} dot={{r:5,fill:"#2C3E50",stroke:"white",strokeWidth:2}} connectNulls={true}/>
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <SectionLabel>Canales y sabores {activeFilterCount>0?"(filtrado)":""}</SectionLabel>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <Card>
                <div style={{fontSize:14,fontWeight:500,marginBottom:2}}>Mix por canal de venta</div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:8,fontSize:12,color:"#666"}}>
                  {chanData.map(c=><span key={c.name} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:2,background:c.color,display:"inline-block"}}></span>{c.name}</span>)}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={chanData} cx="50%" cy="50%" innerRadius={40} outerRadius={72} dataKey="value" nameKey="name"
                      label={({cx,cy,midAngle,innerRadius,outerRadius,percent})=>{
                        if(percent===0)return null;
                        const RADIAN=Math.PI/180;
                        const r=innerRadius+(outerRadius-innerRadius)*0.55;
                        const x=cx+r*Math.cos(-midAngle*RADIAN);
                        const y=cy+r*Math.sin(-midAngle*RADIAN);
                        return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>{`${(percent*100).toFixed(0)}%`}</text>;
                      }}
                      labelLine={false}
                    >
                      {chanData.map((c,i)=><Cell key={i} fill={c.color}/>)}
                    </Pie>
                    <Tooltip content={<CTip/>}/>
                  </PieChart>
                </ResponsiveContainer>
              </Card>
              <Card>
                <div style={{fontSize:14,fontWeight:500,marginBottom:2}}>Mix por sabor</div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:8,fontSize:12,color:"#666"}}>
                  {flavorData.map(f=><span key={f.name} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:2,background:f.color,display:"inline-block"}}></span>{f.name}</span>)}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={flavorData} cx="50%" cy="50%" innerRadius={40} outerRadius={72} dataKey="value" nameKey="name"
                      label={({cx,cy,midAngle,innerRadius,outerRadius,percent})=>{
                        if(percent===0)return null;
                        const RADIAN=Math.PI/180;
                        const r=innerRadius+(outerRadius-innerRadius)*0.55;
                        const x=cx+r*Math.cos(-midAngle*RADIAN);
                        const y=cy+r*Math.sin(-midAngle*RADIAN);
                        return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>{`${(percent*100).toFixed(0)}%`}</text>;
                      }}
                      labelLine={false}
                    >
                      {flavorData.map((f,i)=><Cell key={i} fill={f.color}/>)}
                    </Pie>
                    <Tooltip content={<CTip/>}/>
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <Card style={{marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:500,marginBottom:12}}>Precio vs. COGS — evolución del margen</div>
              <div style={{display:"flex",gap:16,marginBottom:10,fontSize:12,color:"#666"}}>
                {[["#D85A30","Precio venta"],["#888","COGS"],["#1D9E75","Margen unit."]].map(([c,l])=><span key={l} style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,borderRadius:2,background:c,display:"inline-block"}}></span>{l}</span>)}
              </div>
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={marginData} margin={{top:4,right:10,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)"/>
                  <XAxis dataKey="month" tick={{fontSize:11,fill:"#888"}}/>
                  <YAxis tick={{fontSize:11,fill:"#888"}} tickFormatter={v=>`$${v}`} domain={[100,500]}/>
                  <Tooltip content={<CTip/>}/>
                  <Line type="monotone" dataKey="precio" name="Precio ($)"  stroke="#D85A30" strokeWidth={2} dot={{r:3}}/>
                  <Line type="monotone" dataKey="cogs"   name="COGS ($)"   stroke="#888"    strokeWidth={2} dot={{r:3}} strokeDasharray="5 3"/>
                  <Line type="monotone" dataKey="margen" name="Margen ($)" stroke="#1D9E75" strokeWidth={2} dot={{r:3}}/>
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Entregas chart */}
            <SectionLabel>Entregas a influencers {activeFilterCount>0?"(filtrado)":""}</SectionLabel>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:10}}>
              <Card>
                <div style={{fontSize:14,fontWeight:500,marginBottom:2}}>Geles entregados por canal</div>
                <div style={{fontSize:12,color:"#888",marginBottom:12}}>Unidades · etiqueta = valor en $ (unidades × COGS del mes)</div>
                {totalDelivUnits===0
                  ?<div style={{fontSize:13,color:"#bbb",textAlign:"center",padding:"30px 0"}}>Sin entregas en la selección actual.</div>
                  :<ResponsiveContainer width="100%" height={220}>
                    <BarChart data={delivChartData} margin={{top:28,right:10,left:0,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)"/>
                      <XAxis dataKey="name" tick={{fontSize:11,fill:"#888"}}/>
                      <YAxis tick={{fontSize:11,fill:"#888"}} allowDecimals={false}/>
                      <Tooltip content={<CTip/>}/>
                      <Bar dataKey="unidades" name="Geles entregados" radius={[4,4,0,0]}>
                        {delivChartData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                        <LabelList dataKey="valor" position="top" formatter={v=>v>0?`$${fmtNum(v)}`:""} style={{fontSize:10,fontWeight:600,fill:"#555"}}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                }
              </Card>
              <Card>
                <div style={{fontSize:14,fontWeight:500,marginBottom:14}}>Resumen entregas</div>
                <div style={{background:"#F3EAFB",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                  <div style={{fontSize:11,color:"#888",marginBottom:4}}>Total geles entregados</div>
                  <div style={{fontSize:22,fontWeight:500,color:"#6C3483"}}>{fmtNum(totalDelivUnits)} u.</div>
                  <div style={{fontSize:12,marginTop:4,color:"#888"}}>Valor aprox. {fmtMrr(totalDelivValor)}</div>
                  {totalDelivPrev>0&&(()=>{const d=pct(totalDelivUnits,totalDelivPrev),up=parseFloat(d)>=0;return <span style={{fontSize:12,color:up?"#3B6D11":"#A32D2D",marginTop:4,display:"block"}}>{up?"▲":"▼"} {Math.abs(d)}% vs mes anterior</span>;})()}
                </div>
                <div style={{background:"#f7f7f5",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:11,color:"#888",marginBottom:6}}>Mes anterior — {prevComp?.month||"—"}</div>
                  <div style={{fontSize:18,fontWeight:500}}>{fmtNum(totalDelivPrev)} u.</div>
                  <div style={{fontSize:12,color:"#888",marginTop:2}}>Valor {fmtMrr(totalDelivPrevValor)}</div>
                </div>
                <div style={{marginTop:12}}>
                  {DELIVERY_CHANNELS.map(c=>{const u=aggEntregas.byChannel[c.key]||0;return u>0?(<div key={c.key} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:"0.5px solid rgba(0,0,0,0.06)"}}><span style={{color:c.color,fontWeight:500}}>{c.label}</span><span>{fmtNum(u)} u. · {fmtMrr(Math.round(u*(aggVentas.price||0)))}</span></div>):null;})}
                </div>
              </Card>
            </div>

            <SectionLabel>KPIs de escalabilidad</SectionLabel>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[
                {label:"CAC estimado",        val:`$${fmtNum(cac)}`,    sub:"Costo adquirir cliente nuevo",      pill:"Saludable",type:"green"},
                {label:"LTV estimado",        val:`$${fmtNum(ltv)}`,    sub:"Valor de vida del cliente",         pill:`LTV/CAC = ${cac?(ltv/cac).toFixed(1):"—"}x`,type:ltv/cac>=3?"green":"amber"},
                {label:"Punto de equilibrio", val:`${fmtNum(be)} u/mes`,sub:"Unidades para cubrir costos fijos", pill:aggVentas.totalUnits>be?"Superado":"No alcanzado",type:aggVentas.totalUnits>be?"green":"red"},
              ].map((k,i)=>(<div key={i} style={{background:"#f7f7f5",borderRadius:8,padding:"1rem"}}>
                <div style={{fontSize:12,color:"#888",marginBottom:4}}>{k.label}</div>
                <div style={{fontSize:19,fontWeight:500}}>{k.val}</div>
                <div style={{fontSize:11,color:"#999",marginTop:2}}>{k.sub}</div>
                <Pill label={k.pill} type={k.type}/>
              </div>))}
            </div>
          </>
        )}

        {/* ══ VENTAS ═════════════════════════════════════════════════════════ */}
        {view==="ventas"&&(
          <>
            <SectionLabel>Registrar ventas</SectionLabel>
            <Card style={{marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>{activeMonth?`Mes activo: ${activeMonth.month}`:"Paso 1 — ¿A qué mes corresponden estas ventas?"}</div>
              {!activeMonth?(<>
                <div style={{fontSize:12,color:"#888",marginBottom:14}}>Si el mes ya existe, las ventas se sumarán.</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:12,alignItems:"end"}}>
                  <div><label style={lbl}>Mes</label>
                    <select value={monthDraft.month} onChange={e=>setMonthDraft(d=>({...d,month:e.target.value}))} style={sel}>
                      <option value="">Seleccionar mes...</option>
                      {[...MONTH_LIST].reverse().map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>COGS unitario ($)</label><input type="number" value={monthDraft.cogs} onChange={e=>setMonthDraft(d=>({...d,cogs:e.target.value}))} placeholder="ej: 185" style={inp}/></div>
                  <button onClick={confirmMonthDraft} disabled={!monthDraft.month.trim()} style={{padding:"8px 18px",background:!monthDraft.month.trim()?"#ccc":"#D85A30",color:"white",border:"none",borderRadius:8,fontSize:13,fontWeight:500,cursor:!monthDraft.month.trim()?"not-allowed":"pointer",height:40}}>Confirmar mes</button>
                </div>
              </>):(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:13,color:"#555"}}>COGS: <strong>${activeMonth.cogs}</strong> · {activeMData?.ventas?.length??0} venta(s)</div>
                  <button onClick={()=>setActiveMonth(null)} style={{fontSize:12,color:"#888",background:"transparent",border:"0.5px solid #ccc",padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>Cambiar mes</button>
                </div>
              )}
            </Card>
            {activeMonth&&(<Card>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div>
                  <div style={{fontSize:14,fontWeight:500}}>Ventas — {activeMonth.month}</div>
                  {activeCalc&&activeCalc.totalUnits>0&&<div style={{fontSize:12,color:"#888",marginTop:2}}>{fmtNum(activeCalc.totalUnits)} unidades · {fmtMrr(activeCalc.totalRevenue)}</div>}
                </div>
                <button onClick={()=>setVentaModal(true)} style={{padding:"8px 18px",background:"#D85A30",color:"white",border:"none",borderRadius:8,fontSize:13,fontWeight:500,cursor:"pointer"}}>+ Agregar venta</button>
              </div>
              {(!activeMData?.ventas||activeMData.ventas.length===0)&&<div style={{fontSize:13,color:"#bbb",textAlign:"center",padding:"20px 0"}}>Sin ventas para este mes.</div>}
              {(activeMData?.ventas||[]).map((v,i)=>{
                const cv=calcItems(v.items),ch=CHANNELS.find(c=>c.key===v.channel);
                return(<div key={i} style={{background:"#f9f8f6",border:"0.5px solid rgba(0,0,0,0.09)",borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:12,fontWeight:600,color:ch?.color||"#555",background:"rgba(0,0,0,0.06)",padding:"2px 8px",borderRadius:100}}>{ch?.label}</span>{v.channelNote&&<span style={{fontSize:12,color:"#888"}}>{v.channelNote}</span>}</div>
                    <div style={{fontSize:13}}><strong>{fmtNum(cv.units)}</strong> unidades · {fmtMrr(cv.revenue)}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setEditVenta({monthKey:activeMonth.month,vIdx:i,venta:JSON.parse(JSON.stringify(v))})} style={{fontSize:12,color:"#185FA5",background:"transparent",border:"0.5px solid #B5D4F4",padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>Editar</button>
                    <button onClick={()=>deleteVenta(activeMonth.month,i)} style={{fontSize:12,color:"#A32D2D",background:"transparent",border:"0.5px solid #F09595",padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>✕</button>
                  </div>
                </div>);
              })}
              <div style={{marginTop:14,padding:"10px 14px",background:"#f7f7f5",borderRadius:8}}>
                <div style={{fontSize:11,fontWeight:500,color:"#888",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Stock tras ventas y entregas de {activeMonth.month}</div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  {FLAVORS.map(f=>{const r=stockAfter[f.key]??0,crit=r<30,low=r<80&&r>=30;return(<div key={f.key} style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}><span style={{width:8,height:8,borderRadius:"50%",background:f.color,display:"inline-block"}}></span><span style={{fontWeight:500}}>{f.label}:</span><span style={{color:crit?"#A32D2D":low?"#854F0B":"#1a1a1a",fontWeight:500}}>{fmtNum(r)} u.</span>{crit&&<Pill label="Crítico" type="red"/>}{low&&<Pill label="Bajo" type="amber"/>}</div>);})}</div>
              </div>
            </Card>)}
          </>
        )}

        {/* ══ ENTREGAS ═══════════════════════════════════════════════════════ */}
        {view==="entregas"&&(
          <>
            <SectionLabel>Registro entrega a influencers</SectionLabel>
            <Card style={{marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>{activeMonth?`Mes activo: ${activeMonth.month}`:"Paso 1 — ¿A qué mes corresponden estas entregas?"}</div>
              {!activeMonth?(<>
                <div style={{fontSize:12,color:"#888",marginBottom:14}}>Los geles entregados se descontarán del inventario.</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:12,alignItems:"end"}}>
                  <div><label style={lbl}>Mes</label>
                    <select value={monthDraft.month} onChange={e=>setMonthDraft(d=>({...d,month:e.target.value}))} style={sel}>
                      <option value="">Seleccionar mes...</option>
                      {[...MONTH_LIST].reverse().map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>COGS unitario ($)</label><input type="number" value={monthDraft.cogs} onChange={e=>setMonthDraft(d=>({...d,cogs:e.target.value}))} placeholder="ej: 185" style={inp}/></div>
                  <button onClick={confirmMonthDraft} disabled={!monthDraft.month.trim()} style={{padding:"8px 18px",background:!monthDraft.month.trim()?"#ccc":"#6C3483",color:"white",border:"none",borderRadius:8,fontSize:13,fontWeight:500,cursor:!monthDraft.month.trim()?"not-allowed":"pointer",height:40}}>Confirmar mes</button>
                </div>
              </>):(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:13,color:"#555"}}>{activeMData?.entregas?.length??0} entrega(s) · {fmtNum(activeCalc?.totalDelivUnits||0)} geles entregados</div>
                  <button onClick={()=>setActiveMonth(null)} style={{fontSize:12,color:"#888",background:"transparent",border:"0.5px solid #ccc",padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>Cambiar mes</button>
                </div>
              )}
            </Card>
            {activeMonth&&(<Card>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div>
                  <div style={{fontSize:14,fontWeight:500}}>Entregas — {activeMonth.month}</div>
                  {activeCalc&&activeCalc.totalDelivUnits>0&&<div style={{fontSize:12,color:"#888",marginTop:2}}>{fmtNum(activeCalc.totalDelivUnits)} geles entregados</div>}
                </div>
                <button onClick={()=>setEntregaModal(true)} style={{padding:"8px 18px",background:"#6C3483",color:"white",border:"none",borderRadius:8,fontSize:13,fontWeight:500,cursor:"pointer"}}>+ Agregar entrega</button>
              </div>
              {(!activeMData?.entregas||activeMData.entregas.length===0)&&<div style={{fontSize:13,color:"#bbb",textAlign:"center",padding:"20px 0"}}>Sin entregas para este mes.</div>}
              {(activeMData?.entregas||[]).map((e,i)=>{
                const ce=calcDeliveryItems(e.items),ch=DELIVERY_CHANNELS.find(c=>c.key===e.channel);
                return(<div key={i} style={{background:"#f9f4fb",border:"0.5px solid #D7BDE2",borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:12,fontWeight:600,color:ch?.color||"#6C3483",background:"#F3EAFB",padding:"2px 8px",borderRadius:100}}>{ch?.label}</span>{e.channelNote&&<span style={{fontSize:12,color:"#888"}}>{e.channelNote}</span>}</div>
                    <div style={{fontSize:13}}><strong>{fmtNum(ce.units)}</strong> geles · {Object.entries(ce.byFlavor).filter(([,u])=>u>0).map(([k,u])=>`${FLAVORS.find(f=>f.key===k)?.label} ${fmtNum(u)}`).join(" · ")}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setEditEntrega({monthKey:activeMonth.month,eIdx:i,entrega:JSON.parse(JSON.stringify(e))})} style={{fontSize:12,color:"#6C3483",background:"transparent",border:"0.5px solid #D7BDE2",padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>Editar</button>
                    <button onClick={()=>deleteEntrega(activeMonth.month,i)} style={{fontSize:12,color:"#A32D2D",background:"transparent",border:"0.5px solid #F09595",padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>✕</button>
                  </div>
                </div>);
              })}
              <div style={{marginTop:14,padding:"10px 14px",background:"#f7f7f5",borderRadius:8}}>
                <div style={{fontSize:11,fontWeight:500,color:"#888",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Stock tras ventas y entregas de {activeMonth.month}</div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  {FLAVORS.map(f=>{const r=stockAfter[f.key]??0,crit=r<30,low=r<80&&r>=30;return(<div key={f.key} style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}><span style={{width:8,height:8,borderRadius:"50%",background:f.color,display:"inline-block"}}></span><span style={{fontWeight:500}}>{f.label}:</span><span style={{color:crit?"#A32D2D":low?"#854F0B":"#1a1a1a",fontWeight:500}}>{fmtNum(r)} u.</span>{crit&&<Pill label="Crítico" type="red"/>}{low&&<Pill label="Bajo" type="amber"/>}</div>);})}</div>
              </div>
            </Card>)}
          </>
        )}

        {/* ══ MERMAS ═════════════════════════════════════════════════════════ */}
        {view==="mermas"&&(
          <>
            <SectionLabel>Registrar mermas</SectionLabel>
            <Card style={{marginBottom:12}}>
              <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>{activeMonth?`Mes activo: ${activeMonth.month}`:"Paso 1 — ¿A qué mes corresponden estas mermas?"}</div>
              {!activeMonth?(<>
                <div style={{fontSize:12,color:"#888",marginBottom:14}}>Las unidades con merma se descontarán del inventario.</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:12,alignItems:"end"}}>
                  <div><label style={lbl}>Mes</label>
                    <select value={monthDraft.month} onChange={e=>setMonthDraft(d=>({...d,month:e.target.value}))} style={sel}>
                      <option value="">Seleccionar mes...</option>
                      {[...MONTH_LIST].reverse().map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>COGS unitario ($)</label><input type="number" value={monthDraft.cogs} onChange={e=>setMonthDraft(d=>({...d,cogs:e.target.value}))} placeholder="ej: 185" style={inp}/></div>
                  <button onClick={confirmMonthDraft} disabled={!monthDraft.month.trim()} style={{padding:"8px 18px",background:!monthDraft.month.trim()?"#ccc":"#7F8C8D",color:"white",border:"none",borderRadius:8,fontSize:13,fontWeight:500,cursor:!monthDraft.month.trim()?"not-allowed":"pointer",height:40}}>Confirmar mes</button>
                </div>
              </>):(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:13,color:"#555"}}>{activeMData?.mermas?.length??0} merma(s) · {fmtNum(activeCalc?.totalMermaUnits||0)} unidades</div>
                  <button onClick={()=>setActiveMonth(null)} style={{fontSize:12,color:"#888",background:"transparent",border:"0.5px solid #ccc",padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>Cambiar mes</button>
                </div>
              )}
            </Card>
            {activeMonth&&(<Card>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div>
                  <div style={{fontSize:14,fontWeight:500}}>Mermas — {activeMonth.month}</div>
                  {activeCalc&&activeCalc.totalMermaUnits>0&&<div style={{fontSize:12,color:"#888",marginTop:2}}>{fmtNum(activeCalc.totalMermaUnits)} unidades con merma</div>}
                </div>
                <button onClick={()=>setMermaModal(true)} style={{padding:"8px 18px",background:"#7F8C8D",color:"white",border:"none",borderRadius:8,fontSize:13,fontWeight:500,cursor:"pointer"}}>+ Agregar merma</button>
              </div>
              {(!activeMData?.mermas||activeMData.mermas.length===0)&&<div style={{fontSize:13,color:"#bbb",textAlign:"center",padding:"20px 0"}}>Sin mermas para este mes.</div>}
              {(activeMData?.mermas||[]).map((mr,i)=>{
                const cmr=calcDeliveryItems(mr.items);
                return(<div key={i} style={{background:"#f7f7f7",border:"0.5px solid #D5D8DC",borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    {mr.motivo&&<div style={{fontSize:12,color:"#888",marginBottom:4}}>{mr.motivo}</div>}
                    <div style={{fontSize:13}}><strong>{fmtNum(cmr.units)}</strong> unidades · {Object.entries(cmr.byFlavor).filter(([,u])=>u>0).map(([k,u])=>`${FLAVORS.find(f=>f.key===k)?.label} ${fmtNum(u)}`).join(" · ")}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setEditMerma({monthKey:activeMonth.month,mIdx:i,merma:JSON.parse(JSON.stringify(mr))})} style={{fontSize:12,color:"#555",background:"transparent",border:"0.5px solid #ccc",padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>Editar</button>
                    <button onClick={()=>deleteMerma(activeMonth.month,i)} style={{fontSize:12,color:"#A32D2D",background:"transparent",border:"0.5px solid #F09595",padding:"4px 10px",borderRadius:6,cursor:"pointer"}}>✕</button>
                  </div>
                </div>);
              })}
              <div style={{marginTop:14,padding:"10px 14px",background:"#f7f7f5",borderRadius:8}}>
                <div style={{fontSize:11,fontWeight:500,color:"#888",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Stock tras ventas, entregas y mermas de {activeMonth.month}</div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  {FLAVORS.map(f=>{const r=stockAfter[f.key]??0,crit=r<30,low=r<80&&r>=30;return(<div key={f.key} style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}><span style={{width:8,height:8,borderRadius:"50%",background:f.color,display:"inline-block"}}></span><span style={{fontWeight:500}}>{f.label}:</span><span style={{color:crit?"#A32D2D":low?"#854F0B":"#1a1a1a",fontWeight:500}}>{fmtNum(r)} u.</span>{crit&&<Pill label="Crítico" type="red"/>}{low&&<Pill label="Bajo" type="amber"/>}</div>);})}
                </div>
              </div>
            </Card>)}
          </>
        )}

        {/* ══ HISTORIAL ══════════════════════════════════════════════════════ */}
        {view==="historial"&&(
          <>
            <SectionLabel>Historial de registros</SectionLabel>
            {/* Tabs */}
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <button onClick={()=>setHistTab("ventas")} style={{padding:"7px 18px",borderRadius:8,border:histTab==="ventas"?"1.5px solid #D85A30":"0.5px solid rgba(0,0,0,0.15)",background:histTab==="ventas"?"#FAECE7":"transparent",color:histTab==="ventas"?"#993C1D":"#555",fontWeight:histTab==="ventas"?500:400,fontSize:13,cursor:"pointer"}}>
                Ventas ({allVentaRows.length})
              </button>
              <button onClick={()=>setHistTab("entregas")} style={{padding:"7px 18px",borderRadius:8,border:histTab==="entregas"?"1.5px solid #6C3483":"0.5px solid rgba(0,0,0,0.15)",background:histTab==="entregas"?"#F3EAFB":"transparent",color:histTab==="entregas"?"#6C3483":"#555",fontWeight:histTab==="entregas"?500:400,fontSize:13,cursor:"pointer"}}>
                Entregas ({allEntregaRows.length})
              </button>
              <button onClick={()=>setHistTab("mermas")} style={{padding:"7px 18px",borderRadius:8,border:histTab==="mermas"?"1.5px solid #7F8C8D":"0.5px solid rgba(0,0,0,0.15)",background:histTab==="mermas"?"#F2F3F4":"transparent",color:histTab==="mermas"?"#555":"#555",fontWeight:histTab==="mermas"?500:400,fontSize:13,cursor:"pointer"}}>
                Mermas ({allMermaRows.length})
              </button>
              <button onClick={()=>setDelConf("reset")} style={{marginLeft:"auto",fontSize:12,color:"#A32D2D",background:"transparent",border:"0.5px solid #F09595",padding:"4px 12px",borderRadius:8,cursor:"pointer"}}>Resetear datos</button>
            </div>
            {delConf==="reset"&&(
              <div style={{background:"#FCEBEB",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#A32D2D",display:"flex",gap:10,alignItems:"center"}}>
                ¿Seguro? Se borrarán todos los datos.
                <button onClick={handleReset} style={{background:"#A32D2D",color:"white",border:"none",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:12}}>Sí, resetear</button>
                <button onClick={()=>setDelConf(null)} style={{background:"transparent",border:"0.5px solid #A32D2D",color:"#A32D2D",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:12}}>Cancelar</button>
              </div>
            )}

            {/* Ventas table */}
            {histTab==="ventas"&&(
              <Card>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:"0.5px solid rgba(0,0,0,0.1)"}}>
                        {["Mes","Canal","Comentario","Unidades","Ingresos","Precio prom.","Sabores","",""].map((h,i)=>(
                          <th key={i} style={{textAlign:"left",padding:"6px 8px",fontSize:11,fontWeight:500,color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allVentaRows.length===0&&<tr><td colSpan={8} style={{padding:"20px",textAlign:"center",color:"#bbb",fontSize:13}}>Sin ventas registradas.</td></tr>}
                      {allVentaRows.map((r,i)=>{
                        const mg=r.price&&r.cogs?Math.round((r.price-r.cogs)/r.price*100):0;
                        const flavorSummary=Object.entries(r.byFlavor).filter(([,u])=>u>0).map(([k,u])=>`${FLAVORS.find(f=>f.key===k)?.label} ${fmtNum(u)}`).join(" · ");
                        return(
                          <tr key={i} style={{borderBottom:"0.5px solid rgba(0,0,0,0.06)"}}>
                            <td style={{padding:"8px",fontWeight:500,whiteSpace:"nowrap"}}>{r.month}</td>
                            <td style={{padding:"8px"}}><span style={{fontSize:11,fontWeight:600,color:r.ch?.color||"#555",background:"rgba(0,0,0,0.05)",padding:"2px 7px",borderRadius:100,whiteSpace:"nowrap"}}>{r.ch?.label}</span></td>
                            <td style={{padding:"8px",color:"#888",fontSize:12}}>{r.channelNote||"—"}</td>
                            <td style={{padding:"8px"}}>{fmtNum(r.units)}</td>
                            <td style={{padding:"8px"}}>{fmtMrr(r.revenue)}</td>
                            <td style={{padding:"8px"}}>{r.price?`$${fmtNum(r.price)}`:"—"}{r.price&&r.cogs?<span style={{marginLeft:6,fontSize:11,fontWeight:500,color:mg>=50?"#3B6D11":mg>=35?"#854F0B":"#A32D2D",background:mg>=50?"#EAF3DE":mg>=35?"#FAEEDA":"#FCEBEB",padding:"1px 6px",borderRadius:100}}>{mg}%</span>:null}</td>
                            <td style={{padding:"8px",fontSize:12,color:"#888"}}>{flavorSummary}</td>
                            <td style={{padding:"8px 4px",textAlign:"center"}}>
                              <button onClick={()=>{ setEditVenta({monthKey:r.monthKey,vIdx:r.vIdx,venta:JSON.parse(JSON.stringify(r.raw))}); }} style={{fontSize:12,color:"#185FA5",background:"transparent",border:"0.5px solid #B5D4F4",padding:"3px 10px",borderRadius:6,cursor:"pointer"}}>Editar</button>
                            </td>
                            <td style={{padding:"8px 4px",textAlign:"center"}}>
                              {delConf===`v_${i}`?(
                                <span style={{display:"flex",gap:4}}>
                                  <button onClick={()=>{deleteVenta(r.monthKey,r.vIdx);setDelConf(null);}} style={{fontSize:11,color:"white",background:"#A32D2D",border:"none",padding:"3px 8px",borderRadius:6,cursor:"pointer"}}>Sí</button>
                                  <button onClick={()=>setDelConf(null)} style={{fontSize:11,color:"#555",background:"transparent",border:"0.5px solid #ccc",padding:"3px 8px",borderRadius:6,cursor:"pointer"}}>No</button>
                                </span>
                              ):(
                                <button onClick={()=>setDelConf(`v_${i}`)} style={{fontSize:12,color:"#A32D2D",background:"transparent",border:"0.5px solid #F09595",padding:"3px 10px",borderRadius:6,cursor:"pointer"}}>Eliminar</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Entregas table */}
            {histTab==="entregas"&&(
              <Card>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:"0.5px solid rgba(0,0,0,0.1)"}}>
                        {["Mes","Canal entrega","Destinatario","Geles","Sabores","",""].map((h,i)=>(
                          <th key={i} style={{textAlign:"left",padding:"6px 8px",fontSize:11,fontWeight:500,color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allEntregaRows.length===0&&<tr><td colSpan={6} style={{padding:"20px",textAlign:"center",color:"#bbb",fontSize:13}}>Sin entregas registradas.</td></tr>}
                      {allEntregaRows.map((r,i)=>{
                        const flavorSummary=Object.entries(r.byFlavor).filter(([,u])=>u>0).map(([k,u])=>`${FLAVORS.find(f=>f.key===k)?.label} ${fmtNum(u)}`).join(" · ");
                        return(
                          <tr key={i} style={{borderBottom:"0.5px solid rgba(0,0,0,0.06)"}}>
                            <td style={{padding:"8px",fontWeight:500,whiteSpace:"nowrap"}}>{r.month}</td>
                            <td style={{padding:"8px"}}><span style={{fontSize:11,fontWeight:600,color:r.ch?.color||"#6C3483",background:"#F3EAFB",padding:"2px 7px",borderRadius:100,whiteSpace:"nowrap"}}>{r.ch?.label}</span></td>
                            <td style={{padding:"8px",color:"#555"}}>{r.channelNote||"—"}</td>
                            <td style={{padding:"8px",fontWeight:500}}>{fmtNum(r.units)}</td>
                            <td style={{padding:"8px",fontSize:12,color:"#888"}}>{flavorSummary}</td>
                            <td style={{padding:"8px 4px",textAlign:"center"}}>
                              <button onClick={()=>setEditEntrega({monthKey:r.monthKey,eIdx:r.eIdx,entrega:JSON.parse(JSON.stringify(r.raw))})} style={{fontSize:12,color:"#6C3483",background:"transparent",border:"0.5px solid #D7BDE2",padding:"3px 10px",borderRadius:6,cursor:"pointer"}}>Editar</button>
                            </td>
                            <td style={{padding:"8px 4px",textAlign:"center"}}>
                              {delConf===`e_${i}`?(
                                <span style={{display:"flex",gap:4}}>
                                  <button onClick={()=>{deleteEntrega(r.monthKey,r.eIdx);setDelConf(null);}} style={{fontSize:11,color:"white",background:"#A32D2D",border:"none",padding:"3px 8px",borderRadius:6,cursor:"pointer"}}>Sí</button>
                                  <button onClick={()=>setDelConf(null)} style={{fontSize:11,color:"#555",background:"transparent",border:"0.5px solid #ccc",padding:"3px 8px",borderRadius:6,cursor:"pointer"}}>No</button>
                                </span>
                              ):(
                                <button onClick={()=>setDelConf(`e_${i}`)} style={{fontSize:12,color:"#A32D2D",background:"transparent",border:"0.5px solid #F09595",padding:"3px 10px",borderRadius:6,cursor:"pointer"}}>Eliminar</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Mermas table */}
            {histTab==="mermas"&&(
              <Card>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:"0.5px solid rgba(0,0,0,0.1)"}}>
                        {["Mes","Motivo","Unidades","Sabores","",""].map((h,i)=>(
                          <th key={i} style={{textAlign:"left",padding:"6px 8px",fontSize:11,fontWeight:500,color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allMermaRows.length===0&&<tr><td colSpan={6} style={{padding:"20px",textAlign:"center",color:"#bbb",fontSize:13}}>Sin mermas registradas.</td></tr>}
                      {allMermaRows.map((r,i)=>{
                        const flavorSummary=Object.entries(r.byFlavor).filter(([,u])=>u>0).map(([k,u])=>`${FLAVORS.find(f=>f.key===k)?.label} ${fmtNum(u)}`).join(" · ");
                        return(
                          <tr key={i} style={{borderBottom:"0.5px solid rgba(0,0,0,0.06)"}}>
                            <td style={{padding:"8px",fontWeight:500,whiteSpace:"nowrap"}}>{r.month}</td>
                            <td style={{padding:"8px",color:"#888",fontSize:12}}>{r.motivo||"—"}</td>
                            <td style={{padding:"8px",fontWeight:500}}>{fmtNum(r.units)}</td>
                            <td style={{padding:"8px",fontSize:12,color:"#888"}}>{flavorSummary}</td>
                            <td style={{padding:"8px 4px",textAlign:"center"}}>
                              <button onClick={()=>setEditMerma({monthKey:r.monthKey,mIdx:r.mIdx,merma:JSON.parse(JSON.stringify(r.raw))})} style={{fontSize:12,color:"#555",background:"transparent",border:"0.5px solid #ccc",padding:"3px 10px",borderRadius:6,cursor:"pointer"}}>Editar</button>
                            </td>
                            <td style={{padding:"8px 4px",textAlign:"center"}}>
                              {delConf===`m_${i}`?(
                                <span style={{display:"flex",gap:4}}>
                                  <button onClick={()=>{deleteMerma(r.monthKey,r.mIdx);setDelConf(null);}} style={{fontSize:11,color:"white",background:"#A32D2D",border:"none",padding:"3px 8px",borderRadius:6,cursor:"pointer"}}>Sí</button>
                                  <button onClick={()=>setDelConf(null)} style={{fontSize:11,color:"#555",background:"transparent",border:"0.5px solid #ccc",padding:"3px 8px",borderRadius:6,cursor:"pointer"}}>No</button>
                                </span>
                              ):(
                                <button onClick={()=>setDelConf(`m_${i}`)} style={{fontSize:12,color:"#A32D2D",background:"transparent",border:"0.5px solid #F09595",padding:"3px 10px",borderRadius:6,cursor:"pointer"}}>Eliminar</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
