import { useState, useEffect, useRef } from "react";

const CLAUDE_API = "/api/generate";
const GROQ_API   = "/api/groq";

// ── Utils ──────────────────────────────────────────────
function todayStr() { return new Date().toDateString(); }
function timeStr() { return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function dateStr() { return new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"}); }
function getMode() {
  const h=new Date().getHours();
  if(h<12) return "morning";
  if(h<20) return "executing";
  return "audit";
}
function toMins(t) { const [h,m]=t.split(":").map(Number); return h*60+m; }
function nowMins() { const n=new Date(); return n.getHours()*60+n.getMinutes(); }
function getCurIdx(blocks) {
  const now=nowMins(); let idx=-1;
  for(let i=0;i<blocks.length;i++) { if(toMins(blocks[i].time)<=now) idx=i; else break; }
  return idx;
}

// ── Storage ────────────────────────────────────────────
const SK={ profile:"v11_profile", schedule:"v11_schedule", auditLog:"v11_auditlog" };
async function sGet(k) { try { const r=await window.storage.get(k); return r?JSON.parse(r.value):null; } catch { return null; } }
async function sSet(k,v) { try { await window.storage.set(k,JSON.stringify(v)); } catch(e) { console.error(e); } }

// ── The Floor ──────────────────────────────────────────
const FLOOR = `NON-NEGOTIABLE FLOOR: Every day must include at least one period of real mathematical thinking — active problem-solving, not passive review. This cannot be removed, shortened below 25 minutes, or replaced with reading/watching. If the user's constraints make this impossible, push back before finalising the schedule.`;

// ── System Prompts ─────────────────────────────────────
function morningSystem(profile, auditLog) {
  const recentLogs=auditLog?.slice(-7)||[];
  const patternCtx=recentLogs.length?`Recent audit log (last ${recentLogs.length} days):\n`+recentLogs.map(l=>`  ${l.date}: floor=${l.floorHit?"✓":"✗"}, realThinking=${l.realThinking?"✓":"✗"}, constraints="${l.constraints}", patterns="${l.patterns}"`).join("\n"):"No audit history yet.";
  const patterns=detectPatterns(recentLogs);

  return `You are a mathematical work coach. Your job: structure the user's time and allocate the right work for today.

${FLOOR}

USER PROFILE:
Name: ${profile?.name||"Student"}
Subjects: ${profile?.subjects?.join(", ")||"Mathematics"}
Current focus week: ${profile?.weekMode||"Active Recall"}

PATTERN MEMORY:
${patternCtx}
${patterns.length?`\nACTIVE PATTERNS TO ADDRESS:\n${patterns.map(p=>`  ⚠ ${p}`).join("\n")}`:""}

YOUR THREE JOBS FOR THIS MESSAGE:
1. SCHEDULE TIME
   - Parse their day dump. Extract constraints (time available, fixed events, energy).
   - Output realistic time blocks. No overplanning. No undercommitting.
   - Always include the non-negotiable floor block (min 25min real problem-solving).
   - If constraints seem off or inconsistent, ask ONE clarifying question before proceeding.
   - Format blocks as: HH:MM – HH:MM | [Block title]

2. ALLOCATE WORK
   - For each study block, decide: depth-focused / breadth-focused / light engagement
   - Decide difficulty: easy / medium / hard problems
   - State HOW MANY problems or how much material
   - Base this on: available time, energy signals, recent patterns, week mode
   - Be specific. Not "do some calculus" — "solve 4 medium integration problems, no solutions until you've attempted each"

3. FLAG PATTERNS (if any)
   - If active patterns exist, address them in today's allocation. Don't just note them — act on them.
   - e.g. if user has avoided hard problems 3 days → assign hard problems today, explain why

RESPONSE FORMAT:
- Start with the schedule blocks
- Then the work allocation per block
- Keep it tight. No fluff. Direct.
- Ask a clarifying question ONLY if something is genuinely unclear or inconsistent.

OUTPUT a JSON block at the end of your response for the app to parse:
<SCHEDULE>
[{"time":"HH:MM","end":"HH:MM","title":"Block title","type":"deep|light|break|fixed","work":"specific work instruction","difficulty":"easy|medium|hard|none"}]
</SCHEDULE>`;
}

function auditSystem(profile, auditLog) {
  const recentLogs=auditLog?.slice(-7)||[];
  const patterns=detectPatterns(recentLogs);
  return `You are auditing ${profile?.name||"the user"}'s day. Be direct and honest. No comfort if they underperformed.

${FLOOR}

AUDIT LOG (last ${recentLogs.length} days):
${recentLogs.length?recentLogs.map(l=>`  ${l.date}: floor=${l.floorHit?"✓":"✗"}, realThinking=${l.realThinking?"✓":"✗"}, notes="${l.patterns}"`).join("\n"):"None yet."}
${patterns.length?`\nACTIVE PATTERNS:\n${patterns.map(p=>`  ⚠ ${p}`).join("\n")}`:""}

ASK THESE FOUR QUESTIONS (one message, numbered):
1. Did you hit your floor? (at least one real problem-solving session, min 25min)
2. Was it real thinking — active problem-solving — or passive work like reading/watching?
3. Were your constraints today legitimate, or did you create friction that wasn't there?
4. Looking at your week — do you notice anything about how you've been working?

After they answer, evaluate honestly:
- Call out avoidance, excuses, or passive work masquerading as studying
- Acknowledge genuine constraints without being soft about it
- If a pattern is confirmed (3+ days): name it explicitly and state what changes tomorrow
- Log the result as JSON at the end:
<AUDIT>
{"date":"${todayStr()}","floorHit":true|false,"realThinking":true|false,"constraints":"brief note","patterns":"observation or none"}
</AUDIT>`;
}

function coachSystem(profile) {
  return `You are a direct mathematical work coach for ${profile?.name||"the user"}.
${FLOOR}
Keep responses under 3 sentences. If they ask to remove the floor or skip problem-solving: refuse. Non-negotiable.
For schedule tweaks: SCHEDULE_UPDATE:{"index":<n>,"time":"HH:MM","end":"HH:MM","title":"...","work":"..."}
For rebuild: REBUILD_NEEDED`;
}

// ── Pattern detection ──────────────────────────────────
function detectPatterns(logs) {
  if(!logs.length) return [];
  const patterns=[];
  const last3=logs.slice(-3);
  if(last3.length>=3&&last3.every(l=>!l.floorHit))
    patterns.push("Floor missed 3+ days in a row — floor block must be prioritised today");
  if(last3.length>=3&&last3.every(l=>!l.realThinking))
    patterns.push("3+ days of passive work — today must include hard problems, no passive review allowed");
  const avoidHard=logs.filter(l=>l.patterns?.toLowerCase().includes("avoid")).length;
  if(avoidHard>=3)
    patterns.push("Consistent avoidance of hard problems detected — assign hard difficulty today");
  const inconsistent=logs.filter(l=>!l.floorHit).length;
  if(inconsistent>=3&&logs.length>=5)
    patterns.push("Inconsistent execution pattern — review whether schedule is realistic");
  return patterns;
}

// ── Components ─────────────────────────────────────────
function Header({ mode }) {
  const [now,setNow]=useState(timeStr());
  useEffect(()=>{ const t=setInterval(()=>setNow(timeStr()),1000); return()=>clearInterval(t); },[]);
  const modeLabel={ morning:"Morning — Plan your day", executing:"Executing", audit:"Evening Audit" };
  const modeColor={ morning:"#2a2a00", executing:"#001a00", audit:"#1a001a" };
  return (
    <div style={{padding:"14px 18px 10px",borderBottom:"1px solid #141414",background:modeColor[mode],display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{color:"#444",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>{dateStr()}</div>
        <div style={{color:"#666",fontSize:11,letterSpacing:1,marginTop:3}}>{modeLabel[mode]}</div>
      </div>
      <div style={{color:"#555",fontSize:18,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{now}</div>
    </div>
  );
}

function ScheduleBlock({ block, state }) {
  const isCur=state==="current", isPast=state==="past";
  const typeColor={ deep:"#1a1a00", light:"#001010", break:"transparent", fixed:"#0d0010" };
  const typeBorder={ deep:"#2a2a00", light:"#002020", break:"#141414", fixed:"#1a0020" };
  return (
    <div style={{margin:"0 4px 3px",padding:isCur?"11px 14px":"9px 14px",borderRadius:7,background:isCur?"#1a1a1a":typeColor[block.type]||"transparent",borderLeft:`2px solid ${isCur?"#fff":typeBorder[block.type]||"#141414"}`,opacity:isPast?0.25:1}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{color:isCur?"#888":"#444",fontSize:11,minWidth:80,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{block.time}–{block.end}</span>
        <span style={{color:isCur?"#fff":isPast?"#444":"#ccc",fontSize:isCur?14:13,fontWeight:isCur?600:400,flex:1}}>{block.title}</span>
        {isCur&&<span style={{color:"#000",background:"#fff",fontSize:8,fontWeight:700,letterSpacing:1.5,padding:"2px 5px",borderRadius:3,flexShrink:0}}>NOW</span>}
        {!isCur&&!isPast&&block.type==="deep"&&<span style={{color:"#3a3a00",fontSize:8,letterSpacing:1,flexShrink:0}}>DEEP</span>}
      </div>
      {block.work&&block.work!=="none"&&!isPast&&(
        <div style={{marginTop:5,marginLeft:90,color:isCur?"#666":"#2a2a2a",fontSize:11,lineHeight:1.5,fontStyle:"italic"}}>{block.work}</div>
      )}
    </div>
  );
}

function ScheduleList({ blocks }) {
  const ref=useRef(null);
  const ci=getCurIdx(blocks);
  useEffect(()=>{
    if(ref.current&&ci>=0){
      const els=ref.current.querySelectorAll("[data-idx]");
      if(els[ci]) els[ci].scrollIntoView({block:"center",behavior:"smooth"});
    }
  },[ci,blocks.length]);
  if(!blocks.length) return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
      <div style={{color:"#222",fontSize:13}}>No schedule yet.</div>
      <div style={{color:"#1e1e1e",fontSize:11}}>Dump your day below ↓</div>
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

function MessageBubble({ msg }) {
  const isUser=msg.role==="user";
  return (
    <div style={{alignSelf:isUser?"flex-end":"flex-start",background:isUser?"#1e1e1e":"#161616",border:`1px solid ${isUser?"#2a2a2a":"#1e1e1e"}`,color:isUser?"#e0e0e0":"#aaa",fontSize:13,lineHeight:1.6,padding:"8px 12px",borderRadius:8,maxWidth:"85%",whiteSpace:"pre-wrap"}}>
      {msg.text}
    </div>
  );
}

function ChatFeed({ messages, loading, feedRef }) {
  return (
    <div ref={feedRef} style={{height:180,overflowY:"auto",padding:"8px 18px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #141414"}}>
      {!messages.length&&<div style={{color:"#222",fontSize:12,margin:"auto",textAlign:"center"}}>Tell me about your day.</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&<MessageBubble msg={{role:"ai",text:"…"}}/>}
    </div>
  );
}

function InputBar({ value, onChange, onSend, disabled }) {
  return (
    <div style={{display:"flex",gap:8,padding:"10px 18px 14px",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
      <input style={{flex:1,background:"#111",border:"1px solid #222",borderRadius:7,color:"#fff",padding:"9px 13px",fontSize:14,outline:"none",fontFamily:"inherit"}}
        placeholder={getMode()==="morning"?"Dump your day here…":getMode()==="audit"?"Report in…":"Talk to your coach…"}
        value={value} onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&onSend()} disabled={disabled}/>
      <button onClick={onSend} disabled={disabled} style={{background:"#fff",color:"#000",border:"none",borderRadius:7,width:38,fontSize:16,fontWeight:700,cursor:"pointer",opacity:disabled?0.4:1}}>↑</button>
    </div>
  );
}

// ── Setup ──────────────────────────────────────────────
function Setup({ onComplete }) {
  const [name,setName]=useState("");
  const [subjects,setSubjects]=useState("");
  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:10,padding:"28px 24px",width:"100%",maxWidth:380,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{color:"#fff",fontSize:16,fontWeight:700}}>Set up your system</div>
        <div style={{color:"#444",fontSize:12,lineHeight:1.7}}>Three jobs: schedule your time, allocate your work, audit your execution. Every day includes real mathematical thinking. No exceptions.</div>
        <label style={{color:"#333",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Your name</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name"
          style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:6,color:"#fff",padding:"9px 12px",fontSize:13,outline:"none"}}/>
        <label style={{color:"#333",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Subjects (comma separated)</label>
        <input value={subjects} onChange={e=>setSubjects(e.target.value)} placeholder="e.g. Calculus, Linear Algebra, Stats"
          style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:6,color:"#fff",padding:"9px 12px",fontSize:13,outline:"none"}}/>
        <button onClick={()=>{
          if(!name.trim()) return;
          const profile={ name:name.trim(), subjects:subjects.split(",").map(s=>s.trim()).filter(Boolean), weekMode:"Active Recall" };
          sSet(SK.profile,profile).then(()=>onComplete(profile));
        }} style={{background:"#fff",color:"#000",border:"none",borderRadius:6,padding:"11px",fontSize:14,fontWeight:600,cursor:"pointer",marginTop:4}}>
          Start →
        </button>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────
function MainScreen({ profile: initProfile }) {
  const [profile]=useState(initProfile);
  const [schedule,setSchedule]=useState([]);
  const [auditLog,setAuditLog]=useState([]);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [mode,setMode]=useState(getMode());
  const [auditStarted,setAuditStarted]=useState(false);
  const feedRef=useRef(null);
  const convHistory=useRef([]);

  useEffect(()=>{ const t=setInterval(()=>setMode(getMode()),60000); return()=>clearInterval(t); },[]);
  useEffect(()=>{ if(feedRef.current) feedRef.current.scrollTop=feedRef.current.scrollHeight; },[messages,loading]);

  useEffect(()=>{
    Promise.all([sGet(SK.schedule),sGet(SK.auditLog)]).then(([s,a])=>{
      if(s?.date===todayStr()&&s.blocks?.length) setSchedule(s.blocks);
      if(a) setAuditLog(a);
      // Auto-start audit prompt in evening
      if(getMode()==="audit"&&a&&!a.find(l=>l.date===todayStr())) {
        triggerAudit(a||[]);
      } else if(getMode()==="morning") {
        setMessages([{role:"ai",text:`Morning, ${initProfile.name}. What's your day looking like? Dump it all — constraints, fixed events, energy, anything relevant.`}]);
      }
    });
  },[]);

  async function claudeCall(prompt, sys) {
    const body={model:"claude-sonnet-4-5",max_tokens:1500,messages:[{role:"user",content:prompt}]};
    if(sys) body.system=sys;
    const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();
    return d.content?.map(c=>c.text||"").join("")||"";
  }

  async function triggerAudit(log) {
    setAuditStarted(true);
    setLoading(true);
    try {
      const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:600,system:auditSystem(profile,log),
          messages:[{role:"user",content:"Run the audit."}]})});
      const d=await r.json();
      const raw=d.content?.map(c=>c.text||"").join("")||"";
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
        // Morning: schedule + allocate
        const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:1500,system:morningSystem(profile,auditLog),messages:convHistory.current})});
        const d=await r.json();
        const raw=d.content?.map(c=>c.text||"").join("")||"";
        convHistory.current=[...convHistory.current,{role:"assistant",content:raw}];

        const schedMatch=raw.match(/<SCHEDULE>([\s\S]*?)<\/SCHEDULE>/);
        if(schedMatch) {
          try {
            const blocks=JSON.parse(schedMatch[1].trim());
            setSchedule(blocks);
            await sSet(SK.schedule,{date:todayStr(),blocks});
          } catch {}
        }
        const clean=raw.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g,"").trim();
        setMessages(m=>[...m,{role:"ai",text:clean}]);

      } else if(mode==="audit"||auditStarted) {
        // Audit conversation
        const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:800,system:auditSystem(profile,auditLog),messages:convHistory.current})});
        const d=await r.json();
        const raw=d.content?.map(c=>c.text||"").join("")||"";
        convHistory.current=[...convHistory.current,{role:"assistant",content:raw}];

        const auditMatch=raw.match(/<AUDIT>([\s\S]*?)<\/AUDIT>/);
        if(auditMatch) {
          try {
            const entry=JSON.parse(auditMatch[1].trim());
            const newLog=[...auditLog,entry];
            setAuditLog(newLog);
            await sSet(SK.auditLog,newLog);
          } catch {}
        }
        const clean=raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim();
        setMessages(m=>[...m,{role:"ai",text:clean}]);

      } else {
        // Mid-day: coach
        const ctx=schedule.map((b,i)=>`[${i}] ${b.time}–${b.end} ${b.title}`).join(" | ");
        const r=await fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({system:coachSystem(profile),message:`Schedule: ${ctx}\nTime: ${timeStr()}\nUser: ${msg}`})});
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
            const nb=schedule.map((b,i)=>i===o.index?{...b,...o}:b);
            setSchedule(nb); await sSet(SK.schedule,{date:todayStr(),blocks:nb});
          } catch {}
        }
        const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/REBUILD_NEEDED/g,"").trim();
        if(clean) setMessages(m=>[...m,{role:"ai",text:clean}]);
      }
    } catch { setMessages(m=>[...m,{role:"ai",text:"Error. Try again."}]); }
    setLoading(false);
  }

  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      <Header mode={mode}/>
      <ScheduleList blocks={schedule}/>
      <ChatFeed messages={messages} loading={loading} feedRef={feedRef}/>
      <InputBar value={input} onChange={setInput} onSend={send} disabled={loading}/>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────
export default function App() {
  const [state,setState]=useState(null);
  useEffect(()=>{ sGet(SK.profile).then(p=>setState(p||false)); },[]);
  if(state===null) return <div style={{height:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#222",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Loading…</div></div>;
  if(state===false) return <Setup onComplete={p=>setState(p)}/>;
  return <MainScreen profile={state}/>;
}