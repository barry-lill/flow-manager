"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Mapping = { fieldKey:string; label:string; sourceColumn:string; required:boolean };
const definitions: Record<string, Mapping[]> = {
  stock: [
    {fieldKey:"stock_code",label:"Stock code",sourceColumn:"",required:true},
    {fieldKey:"description",label:"Description",sourceColumn:"",required:true},
    {fieldKey:"quantity",label:"Actual stock",sourceColumn:"",required:true},
    {fieldKey:"target_level",label:"Target stock",sourceColumn:"",required:true},
    {fieldKey:"stock_group",label:"Stock group",sourceColumn:"",required:false},
    {fieldKey:"inactive_flag",label:"Inactive flag",sourceColumn:"",required:false}
  ],
  purchase_orders: [
    {fieldKey:"po_number",label:"PO number",sourceColumn:"",required:true},
    {fieldKey:"order_date",label:"Order date",sourceColumn:"",required:false},
    {fieldKey:"due_date",label:"Due date",sourceColumn:"",required:true},
    {fieldKey:"supplier",label:"Supplier",sourceColumn:"",required:false},
    {fieldKey:"stock_code",label:"Stock code",sourceColumn:"",required:true},
    {fieldKey:"description",label:"Description",sourceColumn:"",required:false},
    {fieldKey:"quantity",label:"Ordered quantity",sourceColumn:"",required:true},
    {fieldKey:"quantity_delivered",label:"Delivered quantity",sourceColumn:"",required:false}
  ]
};

export default function Settings() {
  const [orgId,setOrgId]=useState(""); const [orgName,setOrgName]=useState("");
  const [source,setSource]=useState("stock"); const [mapping,setMapping]=useState<Mapping[]>(definitions.stock);
  const [columns,setColumns]=useState<string[]>([]); const [message,setMessage]=useState(""); const [allowed,setAllowed]=useState<boolean|null>(null); const [savedMappings,setSavedMappings]=useState<any[]>([]);\n  const [hasHeaders,setHasHeaders]=useState(true); const [headerRow,setHeaderRow]=useState(1); const [dataStartRow,setDataStartRow]=useState(2); const [sourceSettings,setSourceSettings]=useState<any[]>([]);

  useEffect(()=>{supabase.auth.getSession().then(async({data})=>{
    if(!data.session){setAllowed(false);return}
    const {data:m}=await supabase.from("memberships").select("org_id,role,organizations(name)").eq("user_id",data.session.user.id).maybeSingle();
    const preview = new URLSearchParams(window.location.search).get("preview") === "1";
    const accessResponse = await fetch("/api/backoffice/access",{headers:{Authorization:"Bearer "+data.session.access_token}});
    const accessResult = accessResponse.ok ? await accessResponse.json() : {allowed:false};
    if(!m || (m.role!=="admin" && !(preview && accessResult.allowed))){setAllowed(false);return}
    const org=Array.isArray(m.organizations)?m.organizations[0]:m.organizations;
    setOrgId(m.org_id);setOrgName(org?.name||"");setAllowed(true);
    const r=await fetch("/api/settings/mappings?orgId="+m.org_id,{headers:{Authorization:"Bearer "+data.session.access_token}});
    if(r.ok){const x=await r.json(); setSavedMappings(x.mappings||[]); setSourceSettings(x.sources||[]); applySourceSettings(x.sources||[],"stock"); applyMappings("stock",x.mappings||[]);}
  })},[]);

  function applySourceSettings(sources:any[], key:string) {\n    const s=sources.find((x:any)=>x.source_key===key);\n    setHasHeaders(s?.has_headers ?? true); setHeaderRow(Number(s?.header_row ?? 1)); setDataStartRow(Number(s?.data_start_row ?? 2));\n  }\n  function applyMappings(key:string, saved:any[]) {
    setMapping(definitions[key].map(d=>({...d,sourceColumn:saved.find((x:any)=>x.source_key===key&&x.field_key===d.fieldKey)?.source_column||""})));
  }
  function changeSource(key:string){setSource(key);applyMappings(key,savedMappings);setColumns([]); applySourceSettings(sourceSettings,key);}
  function sample(file:File){
    const reader=new FileReader();
    reader.onload=()=> {
      try {
        const workbook=XLSX.read(reader.result,{type:"array",cellDates:true});
        const sheet=workbook.Sheets[workbook.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:"",range:0});
        const cols=(rows[0] as unknown[] || []).map(v=>String(v).trim()).filter(Boolean);
        setColumns(cols);
        setMapping(definitions[source].map(d=>({...d,sourceColumn:bestMatch(d,cols)||d.sourceColumn})));
      } catch { setMessage("Could not read that sample file."); }
    };
    reader.readAsArrayBuffer(file);
  }

  function columnLetter(index:number){let n=index+1,s="";while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}\n  function bestMatch(def:Mapping, cols:string[]) {
    const aliases:Record<string,string[]>={
      stock_code:["stock code","account reference","productrecord.accountreference","productaccountreference"],
      description:["description","productrecord.description","purchaseorderitem.description"],
      quantity:["quantity","quantity in stock","productrecord.quantityinstock","purchaseorderitem.quantity"],
      target_level:["target stock","reorder level","quantity reorder level","productrecord.quantityreorderlevel"],
      stock_group:["stock group","category","category name","productrecord.categoryname"],
      inactive_flag:["inactive flag","inactiveflag","productrecord.inactiveflag"],
      po_number:["po number","number","purchaseorder.number"],
      order_date:["order date","date","purchaseorder.date"],
      due_date:["due date","delivery date","datedelivery","purchaseorder.datedelivery"],
      supplier:["supplier","account name","purchaseorder.accountname"],
      quantity_delivered:["quantity delivered","delivered","purchaseorderitem.quantitydelivered"]
    };
    const wanted=[def.label.toLowerCase(),...(aliases[def.fieldKey]||[])].map(x=>x.replace(/[^a-z0-9]/g,""));
    return cols.find(c=>wanted.includes(c.toLowerCase().replace(/[^a-z0-9]/g,"")));
  }
  async function save(){
    setMessage("Saving mapping...");
    const {data}=await supabase.auth.getSession();
    const r=await fetch("/api/settings/mappings",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session?.access_token},body:JSON.stringify({orgId,sourceKey:source,hasHeaders,headerRow,dataStartRow,mappings:mapping.map(m=>({fieldKey:m.fieldKey,sourceColumn:m.sourceColumn,required:m.required}))})});
    const x=await r.json();setMessage(r.ok?"Mapping saved.":x.error||"Could not save mapping.");
  }
  if(allowed===null)return <main><section className="hero"><h2>Settings</h2><p>Checking access...</p></section></main>;
  if(!allowed)return <main><section className="card auth"><h2>Access denied</h2><p>Only the customer administrator can configure data mappings.</p></section></main>;
  return <main><header className="topbar"><div><div className="eyebrow">FLOW MANAGER · SETTINGS</div><h1>{orgName}</h1><p>Configure how your source files map into Flow Manager.</p></div><button onClick={() => {
        const preview = new URLSearchParams(window.location.search).get("preview") === "1";
        location.href = preview ? "/?preview=1&customer=" + orgId : "/";
      }}>Back to Flow Manager</button></header>
    <section className="card"><div className="section-heading"><div><h3>Data source</h3><p>Choose the export you are configuring.</p></div></div>
      <div className="chips">{["stock","purchase_orders"].map(k=><button key={k} className={source===k?"chip selected":"chip"} onClick={()=>changeSource(k)}>{k==="stock"?"Stock data":"Purchase orders"}</button>)}</div>
    </section>
    <section className="card"><div className="section-heading"><div><h3>File layout</h3><p>Tell Flow Manager where the headings and data begin in the export.</p></div></div>\n      <div className="invite-row"><label><input type="checkbox" checked={hasHeaders} onChange={e=>{setHasHeaders(e.target.checked);setColumns([]);}} /> File has column headings</label><label>Heading row <input type="number" min="1" value={headerRow} disabled={!hasHeaders} onChange={e=>setHeaderRow(Math.max(1,Number(e.target.value)||1))}/></label><label>Data starts on row <input type="number" min="1" value={dataStartRow} onChange={e=>setDataStartRow(Math.max(1,Number(e.target.value)||1))}/></label></div>\n    </section>\n    <section className="card"><div className="section-heading"><div><h3>Field mapping</h3><p>Upload a sample CSV to see its columns, then confirm the mapping.</p></div></div>
      <label className="upload secondary"><span>Upload sample file</span><input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={e=>e.target.files?.[0]&&sample(e.target.files[0])}/></label>
      {columns.length>0&&<p className="footnote">Detected {columns.length} columns from the sample.</p>}
      <div className="mapping-table"><div className="mapping-head"><span>Flow Manager field</span><span>Source column</span><span>Required</span></div>
      {mapping.map((m,i)=><div className="mapping-row" key={m.fieldKey}><strong>{m.label}</strong><select value={m.sourceColumn} onChange={e=>setMapping(a=>a.map((x,j)=>j===i?{...x,sourceColumn:e.target.value}:x))}><option value="">Not mapped</option>{columns.map(c=><option key={c} value={c}>{c}</option>)}{m.sourceColumn&&!columns.includes(m.sourceColumn)&&<option value={m.sourceColumn}>{m.sourceColumn}</option>}</select><span>{m.required?"Yes":"Optional"}</span></div>)}</div>
      <button className="primary-action" onClick={save}>Save mapping</button>{message&&<p className="footnote">{message}</p>}
    </section>
  </main>
}
