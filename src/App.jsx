import { useState, useEffect, useRef } from "react";

const CLAUDE_API = "/api/generate";
const GROQ_API   = "/api/groq";

function todayStr() { return new Date().toDateString(); }
function timeStr()  { return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function dateStr()  { return new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"}); }
function getMode()  { const h=new Date().getHours(); return h<12?"morning":h<20?"executing":"audit"; }
function toMins(t)  { const [h,m]=t.split(":").map(Number); return h*60+m; }
function nowMins()  { const n=new Date(); return n.getHours()*60+n.getMinutes(); }
function getCurIdx(blocks) {
  const now=nowMins(); let idx=-1;
  for(let i=0;i<blocks.length;i++) { if(toMins(blocks[i].time)<=now) idx=i; else break; }
  return idx;
}

// ── Storage ────────────────────────────────────────────
const SK={ profile:"v11_profile", schedule:"v11_schedule", auditLog:"v11_auditlog" };
const SB_URL="https://qlectmatqxtqqpwwbrhn.supabase.co";
const SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsZWN0bWF0cXh0cXFwd3dicmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTUzNjgsImV4cCI6MjA5MDM5MTM2OH0.x98eVDFBeBkVCvQhoJg01sGy30BFB3B7Jcn8cJrU4Qg";
const USER_ID="default";
const memStore={};

async function sGet(key) {
  try {
    const r=await fetch(SB_URL+"/rest/v1/ai_memory?user_id=eq."+USER_ID+"&key=eq."+key+"&select=value",{
      headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY}
    });
    const d=await r.json();
    if(d&&d.length) return JSON.parse(d[0].value);
  } catch {}
  return memStore[key]||null;
}

async function sSet(key,value) {
  memStore[key]=value;
  try {
    await fetch(SB_URL+"/rest/v1/ai_memory",{
      method:"POST",
      headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},
      body:JSON.stringify({user_id:USER_ID,key,value:JSON.stringify(value),updated_at:new Date().toISOString()})
    });
  } catch(e){console.error(e);}
}

// ── Floor ──────────────────────────────────────────────
const FLOOR="NON-NEGOTIABLE FLOOR: Every day must include at least one period of real mathematical thinking — active problem-solving, not passive review. Minimum 25 minutes. Cannot be removed, shortened, or replaced with reading/watching. If constraints make this impossible, push back before finalising.";

// ── Pattern detection ──────────────────────────────────
function detectPatterns(logs) {
  if(!logs||!logs.length) return [];
  const p=[];
  const l3=logs.slice(-3);
  if(l3.length>=3&&l3.every(l=>!l.floorHit)) p.push("Floor missed 3+ days — prioritise it today above everything");
  if(l3.length>=3&&l3.every(l=>!l.realThinking)) p.push("3+ days passive work — hard problems required today, no passive review");
  if(logs.filter(l=>l.patterns&&l.patterns.toLowerCase().includes("avoid")).length>=3) p.push("Consistent avoidance of hard problems — assign hard difficulty today");
  if(logs.length>=5&&logs.filter(l=>!l.floorHit).length>=3) p.push("Inconsistent execution — check if schedule is realistic");
  return p;
}

// ── Prompts ────────────────────────────────────────────
function morningSystem(profile,auditLog) {
  const logs=auditLog?auditLog.slice(-7):[];
  const patterns=detectPatterns(logs);
  const logStr=logs.length
    ? logs.map(function(l){return "  "+l.date+": floor="+(l.floorHit?"yes":"no")+", thinking="+(l.realThinking?"real":"passive")+", notes="+l.patterns;}).join("\n")
    : "No history yet.";
  const patStr=patterns.length ? "ACTIVE PATTERNS:\n"+patterns.map(function(p){return "  - "+p;}).join("\n") : "";
  const name=profile&&profile.name?profile.name:"Student";
  const subjects=profile&&profile.subjects?profile.subjects.join(", "):"Mathematics";
  return [
    "You are a mathematical work coach. Current time: "+timeStr()+".",
    "",
    FLOOR,
    "",
    "USER: "+name+" | Subjects: "+subjects,
    "",
    "AUDIT HISTORY:\n"+logStr,
    patStr,
    "",
    "BEHAVIOUR:",
    "- User dumps their day in one message. Parse it immediately. Build the schedule. Do not ask for info they already gave.",
    "- Auto-extract all fixed blocks: pickups, classes, appointments, meals.",
    "- Only ask ONE question after presenting the schedule if something critical is truly missing.",
    "",
    "JOB 1 - SCHEDULE TIME:",
    "- Extract fixed blocks. Calculate real free time. Start from NOW ("+timeStr()+").",
    "- Always protect the floor block first (min 25min real problem-solving).",
    "- Be realistic. No overplanning.",
    "",
    "JOB 2 - ALLOCATE WORK:",
    "- Each study block: depth/breadth/light, easy/medium/hard, specific quantity.",
    "- Use actual subject names. Be specific: 'solve 4 medium integration problems' not 'do calculus'.",
    "- Match difficulty to their energy signal.",
    "",
    "JOB 3 - PATTERNS:",
    "- If active patterns exist, act on them today. Do not just note them.",
    "",
    "OUTPUT schedule JSON at the end of your response:",
    "<SCHEDULE>",
    "[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"Block title\",\"type\":\"deep|light|break|fixed\",\"work\":\"specific instruction\",\"difficulty\":\"easy|medium|hard|none\"}]",
    "</SCHEDULE>"
  ].join("\n");
}

function auditSystem(profile,auditLog) {
  const logs=auditLog?auditLog.slice(-7):[];
  const patterns=detectPatterns(logs);
  const name=profile&&profile.name?profile.name:"the user";
  const logStr=logs.length
    ? logs.map(function(l){return "  "+l.date+": floor="+(l.floorHit?"yes":"no")+", thinking="+(l.realThinking?"real":"passive")+", notes="+l.patterns;}).join("\n")
    : "None yet.";
  const patStr=patterns.length?"ACTIVE PATTERNS:\n"+patterns.map(function(p){return "  - "+p;}).join("\n"):"";
  return [
    "You are auditing "+name+"'s day. Be direct. No comfort if they underperformed.",
    "",
    FLOOR,
    "",
    "AUDIT LOG:\n"+logStr,
    patStr,
    "",
    "Ask these 4 questions in one message (numbered):",
    "1. Did you hit your floor? (real problem-solving, min 25min)",
    "2. Was it real thinking or passive work (reading/watching)?",
    "3. Were your constraints legitimate or self-created friction?",
    "4. Do you notice any patterns in how you've been working this week?",
    "",
    "After they answer:",
    "- Call out avoidance or passive work directly.",
    "- Acknowledge real constraints without softening.",
    "- If a pattern confirmed 3+ days: name it, state what changes tomorrow.",
    "",
    "Log result as JSON at the end:",
    "<AUDIT>",
    "{\"date\":\""+todayStr()+"\",\"floorHit\":true,\"realThinking\":true,\"constraints\":\"note\",\"patterns\":\"observation\"}",
    "</AUDIT>"
  ].join("\n");
}

function coachSystem(profile) {
  const name=profile&&profile.name?profile.name:"the user";
  return [
    "You are a direct mathematical work coach for "+name+".",
    FLOOR,
    "Max 3 sentences. If user asks to skip problem-solving: refuse.",
    "Schedule tweak: SCHEDULE_UPDATE:{\"index\":<n>,\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"...\",\"work\":\"...\"}",
    "Full rebuild: REBUILD_NEEDED"
  ].join("\n");
}

// ── Components ─────────────────────────────────────────
function Header({mode}) {
  const [now,setNow]=useState(timeStr());
  useEffect(()=>{ const t=setInterval(()=>setNow(timeStr()),1000); return()=>clearInterval(t); },[]);
  const labels={morning:"Morning — Plan your day",executing:"Executing",audit:"Evening Audit"};
  const bg={morning:"#0d0d00",executing:"#000d00",audit:"#0d000d"};
  return (
    <div style={{padding:"14px 18px 10px",borderBottom:"1px solid #141414",background:bg[mode],display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{color:"#444",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>{dateStr()}</div>
        <div style={{color:"#555",fontSize:11,marginTop:3}}>{labels[mode]}</div>
      </div>
      <div style={{color:"#555",fontSize:20,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{now}</div>
    </div>
  );
}

function ScheduleBlock({block,state}) {
  const isCur=state==="current",isPast=state==="past";
  const bg={deep:"#0d0d00",light:"#000d0d",break:"transparent",fixed:"#0d000d"}[block.type]||"transparent";
  const bl={deep:"#1a1a00",light:"#001a1a",break:"#141414",fixed:"#1a001a"}[block.type]||"#141414";
  return (
    <div style={{margin:"0 4px 2px",padding:isCur?"11px 14px":"8px 14px",borderRadius:7,background:isCur?"#1a1a1a":bg,borderLeft:"2px solid "+(isCur?"#fff":bl),opacity:isPast?0.22:1}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{color:isCur?"#888":"#3a3a3a",fontSize:11,minWidth:90,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{block.time}–{block.end}</span>
        <span style={{color:isCur?"#fff":isPast?"#444":"#bbb",fontSize:isCur?14:13,fontWeight:isCur?600:400,flex:1}}>{block.title}</span>
        {isCur&&<span style={{color:"#000",background:"#fff",fontSize:8,fontWeight:700,letterSpacing:1.5,padding:"2px 5px",borderRadius:3}}>NOW</span>}
        {!isCur&&!isPast&&block.type==="deep"&&<span style={{color:"#3a3a00",fontSize:8,letterSpacing:1}}>DEEP</span>}
      </div>
      {block.work&&block.work!=="none"&&!isPast&&(
        <div style={{marginTop:5,marginLeft:100,color:isCur?"#555":"#2a2a2a",fontSize:11,lineHeight:1.5,fontStyle:"italic"}}>{block.work}</div>
      )}
    </div>
  );
}

function ScheduleList({blocks}) {
  const ref=useRef(null);
  const ci=getCurIdx(blocks);
  useEffect(()=>{
    if(ref.current&&ci>=0){
      const els=ref.current.querySelectorAll("[data-idx]");
      if(els[ci]) els[ci].scrollIntoView({block:"center",behavior:"smooth"});
    }
  },[ci,blocks.length]);
  if(!blocks.length) return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6}}>
      <div style={{color:"#222",fontSize:13}}>No schedule yet.</div>
      <div style={{color:"#1a1a1a",fontSize:11}}>Dump your day below ↓</div>
    </div>
  );
  return (
    <div ref={ref} style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
      {blocks.map((b,i)=>(
        <div key={i} data-idx={i}>
          <ScheduleBlock block={b} state={i===ci?"current":i<ci?"past":"future"}/>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({msg}) {
  const isUser=msg.role==="user";
  return (
    <div style={{alignSelf:isUser?"flex-end":"flex-start",background:isUser?"#1e1e1e":"#161616",border:"1px solid "+(isUser?"#2a2a2a":"#1e1e1e"),color:isUser?"#e0e0e0":"#aaa",fontSize:13,lineHeight:1.6,padding:"8px 12px",borderRadius:8,maxWidth:"85%",whiteSpace:"pre-wrap"}}>
      {msg.text}
    </div>
  );
}

function ChatFeed({messages,loading,feedRef}) {
  return (
    <div ref={feedRef} style={{height:180,overflowY:"auto",padding:"8px 18px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #141414"}}>
      {!messages.length&&<div style={{color:"#222",fontSize:12,margin:"auto",textAlign:"center"}}>Tell me about your day.</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&<MessageBubble msg={{role:"ai",text:"…"}}/>}
    </div>
  );
}

function InputBar({value,onChange,onSend,disabled,mode}) {
  const ph=mode==="morning"?"Dump your day here…":mode==="audit"?"Report in…":"Talk to your coach…";
  return (
    <div style={{display:"flex",gap:8,padding:"10px 18px 14px",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
      <input style={{flex:1,background:"#111",border:"1px solid #222",borderRadius:7,color:"#fff",padding:"9px 13px",fontSize:14,outline:"none",fontFamily:"inherit"}}
        placeholder={ph} value={value} onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&onSend()} disabled={disabled}/>
      <button onClick={onSend} disabled={disabled} style={{background:"#fff",color:"#000",border:"none",borderRadius:7,width:38,fontSize:16,fontWeight:700,cursor:"pointer",opacity:disabled?0.4:1}}>↑</button>
    </div>
  );
}

// ── Setup ──────────────────────────────────────────────
function Setup({onComplete}) {
  const [name,setName]=useState("");
  const [subjects,setSubjects]=useState("");
  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:10,padding:"28px 24px",width:"100%",maxWidth:380,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{color:"#fff",fontSize:16,fontWeight:700}}>Set up your system</div>
        <div style={{color:"#444",fontSize:12,lineHeight:1.7}}>Three jobs: schedule your time, allocate your work, audit your execution. Real mathematical thinking every day. No exceptions.</div>
        <label style={{color:"#333",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Your name</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name"
          style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:6,color:"#fff",padding:"9px 12px",fontSize:13,outline:"none"}}/>
        <label style={{color:"#333",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Subjects (comma separated)</label>
        <input value={subjects} onChange={e=>setSubjects(e.target.value)} placeholder="e.g. Calculus, Linear Algebra, Stats"
          style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:6,color:"#fff",padding:"9px 12px",fontSize:13,outline:"none"}}/>
        <button onClick={()=>{
          if(!name.trim()) return;
          const p={name:name.trim(),subjects:subjects.split(",").map(s=>s.trim()).filter(Boolean)};
          sSet(SK.profile,p).then(()=>onComplete(p));
        }} style={{background:"#fff",color:"#000",border:"none",borderRadius:6,padding:"11px",fontSize:14,fontWeight:600,cursor:"pointer",marginTop:4}}>
          Start →
        </button>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────
function MainScreen({profile:initProfile}) {
  const [schedule,setSchedule]=useState([]);
  const [auditLog,setAuditLog]=useState([]);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [mode,setMode]=useState(getMode());
  const [auditStarted,setAuditStarted]=useState(false);
  const feedRef=useRef(null);
  const convHistory=useRef([]);
  const profile=initProfile;

  useEffect(()=>{ const t=setInterval(()=>setMode(getMode()),60000); return()=>clearInterval(t); },[]);
  useEffect(()=>{ if(feedRef.current) feedRef.current.scrollTop=feedRef.current.scrollHeight; },[messages,loading]);

  useEffect(()=>{
    Promise.all([sGet(SK.schedule),sGet(SK.auditLog)]).then(([s,a])=>{
      if(s&&s.date===todayStr()&&s.blocks&&s.blocks.length) setSchedule(s.blocks);
      if(a) setAuditLog(a);
      const currentMode=getMode();
      if(currentMode==="audit"&&(!a||!a.find(l=>l.date===todayStr()))) {
        triggerAudit(a||[]);
      } else if(currentMode==="morning") {
        setMessages([{role:"ai",text:"Morning, "+profile.name+". What's your day looking like? Dump it all — constraints, fixed events, energy, anything relevant."}]);
      } else {
        setMessages([{role:"ai",text:"You're mid-session. Talk to your coach if you need to adjust."}]);
      }
    });
  },[]);

  async function claudeCall(msgs,sys) {
    const body={model:"claude-sonnet-4-5",max_tokens:1500,messages:msgs};
    if(sys) body.system=sys;
    const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();
    return d.content?d.content.map(c=>c.text||"").join(""):"";
  }

  async function triggerAudit(log) {
    setAuditStarted(true);
    setLoading(true);
    try {
      const raw=await claudeCall([{role:"user",content:"Run the audit."}],auditSystem(profile,log));
      const clean=raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim();
      convHistory.current=[{role:"user",content:"Run the audit."},{role:"assistant",content:raw}];
      setMessages([{role:"ai",text:clean}]);
    } catch { setMessages([{role:"ai",text:"Audit failed. Report in manually."}]); }
    setLoading(false);
  }

  async function send() {
    if(!input.trim()||loading) return;
    const msg=input.trim(); setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]);
    convHistory.current=[...convHistory.current,{role:"user",content:msg}];
    setLoading(true);
    try {
      if(mode==="morning"&&!schedule.length) {
        const raw=await claudeCall(convHistory.current,morningSystem(profile,auditLog));
        convHistory.current=[...convHistory.current,{role:"assistant",content:raw}];
        const match=raw.match(/<SCHEDULE>([\s\S]*?)<\/SCHEDULE>/);
        if(match) {
          try {
            const blocks=JSON.parse(match[1].trim());
            setSchedule(blocks);
            await sSet(SK.schedule,{date:todayStr(),blocks});
          } catch(e){console.error("schedule parse",e);}
        }
        const clean=raw.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g,"").trim();
        setMessages(m=>[...m,{role:"ai",text:clean}]);
      } else if(mode==="audit"||auditStarted) {
        const raw=await claudeCall(convHistory.current,auditSystem(profile,auditLog));
        convHistory.current=[...convHistory.current,{role:"assistant",content:raw}];
        const match=raw.match(/<AUDIT>([\s\S]*?)<\/AUDIT>/);
        if(match) {
          try {
            const entry=JSON.parse(match[1].trim());
            const newLog=[...auditLog,entry];
            setAuditLog(newLog);
            await sSet(SK.auditLog,newLog);
          } catch(e){console.error("audit parse",e);}
        }
        const clean=raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim();
        setMessages(m=>[...m,{role:"ai",text:clean}]);
      } else {
        const ctx=schedule.map((b,i)=>"["+i+"] "+b.time+"-"+b.end+" "+b.title).join(" | ");
        const r=await fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({system:coachSystem(profile),message:"Schedule: "+ctx+"\nTime: "+timeStr()+"\nUser: "+msg})});
        const d=await r.json();
        const raw=d.content||"";
        if(raw.includes("REBUILD_NEEDED")) {
          convHistory.current=[];
          setSchedule([]);
          await sSet(SK.schedule,{date:todayStr(),blocks:[]});
          setMessages(m=>[...m,{role:"ai",text:"Schedule cleared. Dump your updated constraints."}]);
          setLoading(false); return;
        }
        const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
        if(upd) {
          try {
            const o=JSON.parse(upd[1]);
            const nb=schedule.map((b,i)=>i===o.index?Object.assign({},b,o):b);
            setSchedule(nb);
            await sSet(SK.schedule,{date:todayStr(),blocks:nb});
          } catch(e){console.error(e);}
        }
        const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/REBUILD_NEEDED/g,"").trim();
        if(clean) setMessages(m=>[...m,{role:"ai",text:clean}]);
      }
    } catch(e) {
      console.error(e);
      setMessages(m=>[...m,{role:"ai",text:"Error. Try again."}]);
    }
    setLoading(false);
  }

  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      <Header mode={mode}/>
      <ScheduleList blocks={schedule}/>
      <ChatFeed messages={messages} loading={loading} feedRef={feedRef}/>
      <InputBar value={input} onChange={setInput} onSend={send} disabled={loading} mode={mode}/>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────
export default function App() {
  const [state,setState]=useState(null);
  useEffect(()=>{ sGet(SK.profile).then(p=>setState(p||false)); },[]);
  if(state===null) return (
    <div style={{height:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#222",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Loading…</div>
    </div>
  );
  if(state===false) return <Setup onComplete={p=>setState(p)}/>;
  return <MainScreen profile={state}/>;
}