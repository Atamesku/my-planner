import { useState, useEffect, useRef } from "react";

const CLAUDE_API = "/api/generate";
const GROQ_API   = "/api/groq";

// ── Utils ──────────────────────────────────────────────
function toMins(t) { const [h,m]=t.split(":").map(Number); return h*60+m; }
function nowMins() { const n=new Date(); return n.getHours()*60+n.getMinutes(); }
function timeStr() { return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function weekNum() { return (Math.ceil(new Date().getDate()/7)-1)%4; }
function getCurIdx(blocks) {
  const now=nowMins(); let idx=-1;
  for(let i=0;i<blocks.length;i++) { if(toMins(blocks[i].time)<=now) idx=i; else break; }
  return idx;
}
function getDayLabel(offset=0) {
  const d=new Date(); d.setDate(d.getDate()+offset);
  return d.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});
}
function getDayName(offset=0) {
  const d=new Date(); d.setDate(d.getDate()+offset);
  return d.toLocaleDateString([],{weekday:"long"});
}
function todayStr() { return new Date().toDateString(); }

const WEEK_MODE=["Understanding","Active Recall","Application","Error Correction"];
const WEEK_CUES=[
  "Explain why this works in your own words.",
  "Close notes and recall everything you know.",
  "Solve this without looking at solutions.",
  "Find your mistakes and fix your reasoning.",
];

// ── Storage ────────────────────────────────────────────
const SK = { profile:"sched_profile_v2", days:"sched_days_v2" };
async function sGet(key) {
  try { const r=await window.storage.get(key); return r?JSON.parse(r.value):null; } catch { return null; }
}
async function sSet(key,val) {
  try { await window.storage.set(key,JSON.stringify(val)); } catch(e) { console.error("storage error",e); }
}

// ── Prompts ────────────────────────────────────────────
const ONBOARD_SYSTEM=`You are a strict but warm schedule coach onboarding a new user.
Ask ONE question at a time in this exact order:
1. Name
2. Usual wake time and target sleep time
3. Peak energy window (when they focus best)
4. Fixed events (classes, work, commitments) — ask to list all with days/times
5. Bad habits (up to 3) — for each: ask current baseline, set 10-30% better first target
6. Subjects or tasks they work on regularly

When ALL info is collected, output ONLY this block with no text after it:
<PROFILE>
{"name":"","wakeTime":"HH:MM","sleepTime":"HH:MM","peakEnergy":"","fixedEvents":[{"time":"HH:MM","title":"","days":"daily|weekdays|mon,wed,fri"}],"habits":[{"habit":"","baseline":"","currentTarget":"","unit":"","streak":0}],"tasks":[],"focusMins":25,"breakMins":5}
</PROFILE>
Be concise. Never ask multiple questions at once.`;

function threeDayPrompt(profile) {
  const wk=weekNum();
  const cue=WEEK_CUES[wk];
  const days=[0,1,2].map(i=>`Day ${i+1}: ${getDayName(i)}`).join(", ");
  const fixedStr=profile.fixedEvents.map(e=>`${e.time} ${e.title} (${e.days})`).join("; ")||"none";
  const habitStr=profile.habits.map(h=>`${h.habit}: target ${h.currentTarget} ${h.unit}`).join("; ")||"none";
  return `Build a 3-day schedule for ${profile.name}.
Days: ${days}. Current time: ${timeStr()}.
Week ${wk+1} study mode: ${WEEK_MODE[wk]} — cue: "${cue}"

PROFILE:
- Wake: ${profile.wakeTime}, Sleep: ${profile.sleepTime}
- Peak energy: ${profile.peakEnergy}
- Fixed events: ${fixedStr}
- Tasks: ${profile.tasks.join(", ")||"none"}
- Focus: ${profile.focusMins}min work / ${profile.breakMins}min break
- Habit targets: ${habitStr}

RULES:
- Priority per day: fixed events (check day relevance) → sleep (never cut, min 7h) → 30-60min buffer before important events → study/tasks
- Place demanding study in peak energy window each day
- Break all study into ${profile.focusMins}min focus + ${profile.breakMins}min break blocks
- Add week cue as "cue" on study blocks only
- Enforce habit targets as named schedule blocks
- Drop low-priority tasks if time is short
- Day 1 starts from current time (${timeStr()}), Days 2-3 start from wake time

Return ONLY this exact JSON, no markdown:
{"day0":[{"time":"HH:MM","title":"...","cue":"..."}],"day1":[...],"day2":[...]}
Titles max 5 words. 24h time. 8-13 blocks per day.`;
}

function coachSystem(profile) {
  const wk=weekNum();
  return `You are a strict daily schedule coach for ${profile.name}.
Week ${wk+1}: ${WEEK_MODE[wk]}. Focus: ${profile.focusMins}/${profile.breakMins}min.
Habits: ${profile.habits.map(h=>`${h.habit} (target:${h.currentTarget}${h.unit}, streak:${h.streak}d)`).join("; ")||"none"}
RULES:
- Max 2 sentences. Direct.
- Push back before changing anything.
- HABIT_SUCCESS:<name> if user hit habit target
- HABIT_FAIL:<name> if user failed
- FOCUS_UP if doing well, FOCUS_DOWN if struggling
- SCHEDULE_UPDATE:{"day":<0-2>,"index":<n>,"time":"HH:MM","title":"...","cue":"..."}
- REBUILD_NEEDED for full rebuild`;
}

// ── Components ─────────────────────────────────────────
function Header({ dayLabel, mode }) {
  return (
    <div style={{padding:"13px 18px 9px",borderBottom:"1px solid #141414",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>{dayLabel}</div>
      <div style={{color:"#333",fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>Wk {weekNum()+1} · {mode}</div>
    </div>
  );
}

function DayTabs({ active, setActive }) {
  const labels=["Today","Tomorrow","Day 3"];
  return (
    <div style={{display:"flex",borderBottom:"1px solid #141414"}}>
      {labels.map((l,i)=>(
        <button key={i} onClick={()=>setActive(i)} style={{flex:1,padding:"8px 0",background:"none",border:"none",color:active===i?"#fff":"#333",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",borderBottom:active===i?"1px solid #fff":"1px solid transparent",marginBottom:-1}}>
          {l}
        </button>
      ))}
    </div>
  );
}

function ScheduleItem({ block, state }) {
  const isCur=state==="current", isPast=state==="past";
  return (
    <div style={{padding:isCur?"11px 14px":"8px 14px",borderRadius:7,marginBottom:2,background:isCur?"#161616":"transparent",borderLeft:isCur?"2px solid #fff":"2px solid transparent",opacity:isPast?0.28:1}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <span style={{color:isCur?"#aaa":isPast?"#333":"#555",fontSize:12,minWidth:42,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{block.time}</span>
        <span style={{color:isCur?"#fff":isPast?"#444":"#ccc",fontSize:isCur?15:14,fontWeight:isCur?600:400,flex:1}}>{block.title}</span>
        {isCur&&<span style={{color:"#000",background:"#fff",fontSize:9,fontWeight:700,letterSpacing:1.5,padding:"2px 6px",borderRadius:3}}>NOW</span>}
      </div>
      {block.cue&&!isPast&&(
        <div style={{marginTop:4,marginLeft:54,color:isCur?"#555":"#333",fontSize:11,fontStyle:"italic",lineHeight:1.4}}>{block.cue}</div>
      )}
    </div>
  );
}

function ScheduleList({ blocks, activeDay }) {
  const ref=useRef(null);
  const ci=activeDay===0?getCurIdx(blocks):-1;
  useEffect(()=>{
    if(ref.current&&ci>=0){
      const els=ref.current.querySelectorAll("[data-idx]");
      if(els[ci]) els[ci].scrollIntoView({block:"center",behavior:"smooth"});
    }
  },[ci,blocks.length,activeDay]);
  return (
    <div ref={ref} style={{flex:1,overflowY:"auto",padding:"8px 4px 6px"}}>
      {blocks.length===0&&<div style={{color:"#333",fontSize:13,padding:"32px 0",textAlign:"center"}}>Building…</div>}
      {blocks.map((b,i)=>(
        <div key={i} data-idx={i}>
          <ScheduleItem block={b} state={activeDay===0?(i===ci?"current":i<ci?"past":"future"):"future"}/>
        </div>
      ))}
    </div>
  );
}

function EventsTab({ profile, onUpdate }) {
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({time:"",title:"",days:"daily"});
  function startEdit(i) { setForm({...profile.fixedEvents[i]}); setEditing(i); }
  function startNew() { setForm({time:"",title:"",days:"daily"}); setEditing("new"); }
  function save() {
    if(!form.time||!form.title) return;
    let evts=[...profile.fixedEvents];
    editing==="new"?evts.push(form):evts[editing]=form;
    onUpdate({...profile,fixedEvents:evts}); setEditing(null);
  }
  function del(i) { onUpdate({...profile,fixedEvents:profile.fixedEvents.filter((_,x)=>x!==i)}); }
  return (
    <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Fixed Events</span>
        <button onClick={startNew} style={{background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>+ Add</button>
      </div>
      {profile.fixedEvents.length===0&&<div style={{color:"#333",fontSize:13,padding:"12px 0"}}>No fixed events yet.</div>}
      {profile.fixedEvents.map((e,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #141414"}}>
          <span style={{color:"#555",fontSize:12,minWidth:42}}>{e.time}</span>
          <span style={{color:"#ccc",fontSize:14,flex:1}}>{e.title}</span>
          <span style={{color:"#333",fontSize:11}}>{e.days}</span>
          <button onClick={()=>startEdit(i)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:12,padding:"2px 6px"}}>Edit</button>
          <button onClick={()=>del(i)} style={{background:"none",border:"none",color:"#4a2020",cursor:"pointer",fontSize:12,padding:"2px 6px"}}>Del</button>
        </div>
      ))}
      {editing!==null&&(
        <div style={{marginTop:16,background:"#111",border:"1px solid #1e1e1e",borderRadius:8,padding:"14px",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",gap:8}}>
            <input value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} placeholder="HH:MM"
              style={{width:64,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 9px",fontSize:13,outline:"none"}}/>
            <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Title"
              style={{flex:1,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 9px",fontSize:13,outline:"none"}}/>
          </div>
          <input value={form.days} onChange={e=>setForm(f=>({...f,days:e.target.value}))} placeholder="daily / weekdays / mon,wed,fri"
            style={{background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#ccc",padding:"7px 9px",fontSize:12,outline:"none",boxSizing:"border-box",width:"100%"}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={save} style={{flex:1,background:"#fff",color:"#000",border:"none",borderRadius:5,padding:"8px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Save</button>
            <button onClick={()=>setEditing(null)} style={{flex:1,background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"8px",fontSize:13,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser=msg.role==="user";
  return (
    <div style={{alignSelf:isUser?"flex-end":"flex-start",background:isUser?"#1e1e1e":"#161616",border:`1px solid ${isUser?"#2a2a2a":"#1e1e1e"}`,color:isUser?"#e0e0e0":"#aaa",fontSize:13,lineHeight:1.55,padding:"8px 12px",borderRadius:8,maxWidth:"82%"}}>
      {msg.text}
    </div>
  );
}

function ChatFeed({ messages, loading, feedRef }) {
  return (
    <div ref={feedRef} style={{height:150,overflowY:"auto",padding:"8px 18px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #141414"}}>
      {messages.length===0&&<div style={{color:"#2a2a2a",fontSize:12,margin:"auto",textAlign:"center"}}>Chat with your coach</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&<MessageBubble msg={{role:"ai",text:"…"}}/>}
    </div>
  );
}

function BottomTabs({ tab, setTab }) {
  return (
    <div style={{display:"flex",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
      {["Schedule","Events"].map(t=>(
        <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"9px 0",background:"none",border:"none",color:tab===t?"#fff":"#333",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",borderTop:tab===t?"1px solid #fff":"1px solid transparent",marginTop:-1}}>
          {t}
        </button>
      ))}
    </div>
  );
}

function InputBar({ value, onChange, onSend, onRebuild, disabled, rebuilding }) {
  return (
    <div style={{display:"flex",gap:8,padding:"10px 18px 13px",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
      <input style={{flex:1,background:"#111",border:"1px solid #222",borderRadius:7,color:"#fff",padding:"9px 13px",fontSize:14,outline:"none",fontFamily:"inherit"}}
        placeholder="Talk to your coach…" value={value} onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&onSend()} disabled={disabled}/>
      <button onClick={onSend} disabled={disabled} style={{background:"#fff",color:"#000",border:"none",borderRadius:7,width:38,fontSize:16,fontWeight:700,cursor:"pointer",opacity:disabled?0.4:1}}>↑</button>
      <button onClick={onRebuild} disabled={rebuilding} style={{background:"transparent",border:"1px solid #222",color:"#555",borderRadius:7,padding:"0 12px",fontSize:11,cursor:"pointer",opacity:rebuilding?0.4:1,whiteSpace:"nowrap"}}>{rebuilding?"…":"Fix"}</button>
    </div>
  );
}

// ── Onboarding ─────────────────────────────────────────
function Onboarding({ onComplete }) {
  const [messages,setMessages]=useState([{role:"ai",text:"Hey! I'm your schedule coach. Let's get you set up. What's your name?"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const history=useRef([]);
  const feedRef=useRef(null);
  useEffect(()=>{ if(feedRef.current) feedRef.current.scrollTop=feedRef.current.scrollHeight; },[messages]);

  async function send() {
    if(!input.trim()||loading) return;
    const msg=input.trim(); setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]);
    history.current=[...history.current,{role:"user",content:msg}];
    setLoading(true);
    try {
      const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:600,system:ONBOARD_SYSTEM,messages:history.current})});
      const d=await r.json();
      const raw=d.content?.map(c=>c.text||"").join("")||"";
      history.current=[...history.current,{role:"assistant",content:raw}];
      const match=raw.match(/<PROFILE>([\s\S]*?)<\/PROFILE>/);
      if(match) {
        const p=JSON.parse(match[1].trim());
        await sSet(SK.profile,p);
        onComplete(p); return;
      }
      setMessages(m=>[...m,{role:"ai",text:raw}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Connection error. Try again."}]); }
    setLoading(false);
  }

  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      <div style={{padding:"16px 18px 10px",borderBottom:"1px solid #141414"}}>
        <div style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Schedule Coach · Setup</div>
      </div>
      <div ref={feedRef} style={{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:8}}>
        {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
        {loading&&<MessageBubble msg={{role:"ai",text:"…"}}/>}
      </div>
      <div style={{display:"flex",gap:8,padding:"12px 18px 16px",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
        <input style={{flex:1,background:"#111",border:"1px solid #222",borderRadius:7,color:"#fff",padding:"9px 13px",fontSize:14,outline:"none",fontFamily:"inherit"}}
          placeholder="Reply…" value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&send()} disabled={loading} autoFocus/>
        <button onClick={send} disabled={loading} style={{background:"#fff",color:"#000",border:"none",borderRadius:7,width:38,fontSize:16,fontWeight:700,cursor:"pointer",opacity:loading?0.4:1}}>↑</button>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────
function MainScreen({ profile: init }) {
  const [profile,setProfile]=useState(init);
  const [days,setDays]=useState([[],[],[]]);
  const [activeDay,setActiveDay]=useState(0);
  const [tab,setTab]=useState("Schedule");
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [rebuilding,setRebuilding]=useState(false);
  const [tick,setTick]=useState(0);
  const feedRef=useRef(null);

  useEffect(()=>{ const t=setInterval(()=>setTick(x=>x+1),60000); return()=>clearInterval(t); },[]);
  useEffect(()=>{ if(feedRef.current) feedRef.current.scrollTop=feedRef.current.scrollHeight; },[messages,loading]);
  useEffect(()=>{ loadOrBuild(); },[]);

  const ci=getCurIdx(days[0]);

  async function claudeCall(prompt,sys) {
    const body={model:"claude-sonnet-4-5",max_tokens:2000,messages:[{role:"user",content:prompt}]};
    if(sys) body.system=sys;
    const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();
    return d.content?.map(c=>c.text||"").join("")||"";
  }

  async function loadOrBuild() {
    const saved=await sGet(SK.days);
    if(saved&&saved.date===todayStr()&&saved.days?.[0]?.length>0) {
      setDays(saved.days);
      setMessages([{role:"ai",text:`Welcome back, ${profile.name}.`}]);
    } else { await buildDays(); }
  }

  async function buildDays(ctx="") {
    setRebuilding(true);
    try {
      const prompt=threeDayPrompt(profile)+(ctx?`\nExtra context: ${ctx}`:"");
      const raw=await claudeCall(prompt);
      const clean=raw.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      const newDays=[parsed.day0||[],parsed.day1||[],parsed.day2||[]];
      setDays(newDays);
      await sSet(SK.days,{date:todayStr(),days:newDays});
      setMessages(m=>[...m,{role:"ai",text:`3-day plan built. Week ${weekNum()+1}: ${WEEK_MODE[weekNum()]}. Let's go.`}]);
    } catch(e) { setMessages(m=>[...m,{role:"ai",text:"Failed to build schedule. Check API."}]); console.error(e); }
    setRebuilding(false);
  }

  async function saveProfile(p) { setProfile(p); await sSet(SK.profile,p); }

  async function send() {
    if(!input.trim()||loading) return;
    const msg=input.trim(); setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]); setLoading(true);
    const ctx=days[activeDay].map((b,i)=>`[${i}]${b.time} ${b.title}${activeDay===0&&i===ci?" ←NOW":""}`).join(" | ");
    try {
      const r=await fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({system:coachSystem(profile),message:`Viewing day ${activeDay}. Schedule: ${ctx}\nUser: ${msg}`})});
      const d=await r.json();
      const raw=d.content||"Error.";

      let np={...profile};
      const hs=raw.match(/HABIT_SUCCESS:(\S+)/); const hf=raw.match(/HABIT_FAIL:(\S+)/);
      if(hs) np.habits=np.habits.map(h=>h.habit.toLowerCase().includes(hs[1].toLowerCase())?{...h,streak:(h.streak||0)+1,currentTarget:(h.streak+1)>=3?Math.round(parseFloat(h.currentTarget)*0.8*10)/10:h.currentTarget}:h);
      if(hf) np.habits=np.habits.map(h=>h.habit.toLowerCase().includes(hf[1].toLowerCase())?{...h,streak:0,currentTarget:h.baseline}:h);
      if(raw.includes("FOCUS_UP")) np.focusMins=Math.min((np.focusMins||25)+5,50);
      if(raw.includes("FOCUS_DOWN")) np.focusMins=Math.max((np.focusMins||25)-5,15);
      if(JSON.stringify(np)!==JSON.stringify(profile)) await saveProfile(np);

      if(raw.includes("REBUILD_NEEDED")) {
        setMessages(m=>[...m,{role:"ai",text:"Rebuilding 3-day plan…"}]);
        setLoading(false); await buildDays(); return;
      }
      const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
      if(upd) {
        try {
          const o=JSON.parse(upd[1]);
          const dayIdx=o.day??activeDay;
          const newDays=days.map((d,di)=>di===dayIdx?d.map((b,i)=>i===o.index?{...b,...o}:b):d);
          setDays(newDays);
          await sSet(SK.days,{date:todayStr(),days:newDays});
        } catch {}
      }
      const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/HABIT_SUCCESS:\S+|HABIT_FAIL:\S+|FOCUS_UP|FOCUS_DOWN|REBUILD_NEEDED/g,"").trim();
      if(clean) setMessages(m=>[...m,{role:"ai",text:clean}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Groq unreachable."}]); }
    setLoading(false);
  }

  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      <Header dayLabel={getDayLabel(activeDay)} mode={WEEK_MODE[weekNum()]}/>
      {tab==="Schedule"&&<DayTabs active={activeDay} setActive={setActiveDay}/>}
      {tab==="Schedule"
        ?<ScheduleList blocks={days[activeDay]} activeDay={activeDay}/>
        :<EventsTab profile={profile} onUpdate={p=>saveProfile(p)}/>
      }
      <ChatFeed messages={messages} loading={loading} feedRef={feedRef}/>
      <BottomTabs tab={tab} setTab={setTab}/>
      <InputBar value={input} onChange={setInput} onSend={send} onRebuild={()=>buildDays()} disabled={loading} rebuilding={rebuilding}/>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────
export default function App() {
  const [profile,setProfile]=useState(undefined);
  useEffect(()=>{ sGet(SK.profile).then(p=>setProfile(p||null)); },[]);
  if(profile===undefined) return (
    <div style={{height:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#333",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Loading…</div>
    </div>
  );
  if(!profile) return <Onboarding onComplete={p=>setProfile(p)}/>;
  return <MainScreen profile={profile}/>;
}