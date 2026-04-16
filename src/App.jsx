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
const SK={ profile:"sched_profile_v2", days:"sched_days_v2" };
async function sGet(key) {
  try { const r=await window.storage.get(key); return r?JSON.parse(r.value):null; } catch { return null; }
}
async function sSet(key,val) {
  try { await window.storage.set(key,JSON.stringify(val)); } catch(e) { console.error(e); }
}

// ── Onboarding prompt ──────────────────────────────────
const ONBOARD_SYSTEM=`You are a strict schedule coach onboarding a new user. One question at a time, in this order:
1. Name
2. Usual wake time and sleep time
3. Peak energy window — ask for exact times (e.g. "12:00–17:00")
4. Fixed events — classes, work, appointments — ask for day, time, duration
5. Bad habits (up to 3) — for each: get current baseline, set a 10–30% better first target
6. Subjects or tasks they work on regularly (be specific — ask for names, not just "study")

When ALL collected, output ONLY:
<PROFILE>
{"name":"","wakeTime":"HH:MM","sleepTime":"HH:MM","peakStart":"HH:MM","peakEnd":"HH:MM","fixedEvents":[{"time":"HH:MM","duration":60,"title":"","days":"daily|weekdays|mon,wed,fri"}],"habits":[{"habit":"","baseline":"","currentTarget":"","unit":"","streak":0}],"tasks":[],"focusMins":25,"breakMins":5}
</PROFILE>
Be concise and direct. Never ask multiple questions at once.`;

// ── 3-day schedule prompt ──────────────────────────────
function threeDayPrompt(profile) {
  const wk=weekNum();
  const fixedStr=profile.fixedEvents?.map(e=>`${e.time} for ${e.duration||60}min — "${e.title}" (${e.days})`).join("\n  ")||"none";
  const habitStr=profile.habits?.map(h=>`• ${h.habit}: current target = ${h.currentTarget} ${h.unit} (baseline was ${h.baseline})`).join("\n  ")||"none";
  const taskStr=profile.tasks?.join(", ")||"none";
  const days=[0,1,2].map(i=>`Day${i+1}(${getDayName(i)})`).join(", ");

  return `You are building a HYPER-PERSONALISED, minute-by-minute 3-day schedule for ${profile.name}.

━━━ PROFILE ━━━
Name: ${profile.name}
Wake: ${profile.wakeTime} | Sleep: ${profile.sleepTime}
PEAK ENERGY WINDOW: ${profile.peakStart||"12:00"} → ${profile.peakEnd||"17:00"} (THIS IS SACRED — see rules)
Focus block: ${profile.focusMins}min work / ${profile.breakMins}min break
Week ${wk+1} study mode: ${WEEK_MODE[wk]}
Study cue: "${WEEK_CUES[wk]}"
Tasks/subjects: ${taskStr}

Fixed events this week:
  ${fixedStr}

Habit targets to enforce:
  ${habitStr}

━━━ HARD RULES ━━━
1. PEAK WINDOW IS LOCKED: ${profile.peakStart||"12:00"}–${profile.peakEnd||"17:00"} must contain ONLY the hardest, most demanding study/deep work blocks. No meals, no admin, no errands during this window. If a fixed event falls here, work around it tightly.
2. ZERO DEAD TIME: Every minute from ${profile.wakeTime} to ${profile.sleepTime} must be assigned. No gaps.
3. BACK-TO-BACK BLOCKS: If a block ends at 14:25, the next starts at 14:25. No rounding.
4. GRANULARITY: Use 5–15 min blocks for routines/transitions, 25–50 min for work/study, exact times always.
5. FULL DAY COVERAGE: Include wake-up routine, hygiene, meals, transitions, study, breaks, wind-down, sleep. Everything.
6. FIXED EVENTS ARE IMMOVABLE: Build around them. Add a 30-min prep block before any exam or important event.
7. SLEEP IS PROTECTED: Never schedule work after wind-down begins. Min 7h sleep.
8. HABITS ARE SCHEDULE BLOCKS: Each habit target must appear as a named block (e.g. "Phone away — max 20min screen").
9. STUDY BLOCKS: Use ${profile.focusMins}min focus + ${profile.breakMins}min break. Add the week cue as "cue" field.
10. DROP TASKS if time runs out — never compress sleep or peak window.
11. Day 1 starts from NOW (${timeStr()}). Days 2–3 start from ${profile.wakeTime}.
12. BE SPECIFIC: Use the user's actual task names. Never write "Study session" — write "Maths: derivatives" or "English: essay draft".

━━━ OUTPUT ━━━
Return ONLY raw JSON. No markdown. No explanation. No extra keys.
{"day0":[{"time":"HH:MM","title":"Exact specific title","cue":"study blocks only"}],"day1":[...],"day2":[...]}
Days: ${days}. 20–35 blocks per day. 24h time.`;
}

// ── Coach prompt ───────────────────────────────────────
function coachSystem(profile) {
  const wk=weekNum();
  return `You are a relentless, no-excuses schedule coach for ${profile.name}.
Peak window: ${profile.peakStart||"12:00"}–${profile.peakEnd||"17:00"} — guard it fiercely.
Week ${wk+1}: ${WEEK_MODE[wk]}. Focus: ${profile.focusMins}/${profile.breakMins}min.
Habits: ${profile.habits?.map(h=>`${h.habit}(target:${h.currentTarget}${h.unit},streak:${h.streak}d)`).join("; ")||"none"}

RULES:
- 2 sentences max. Brutal honesty. No sympathy for laziness.
- Never adjust schedule for weak excuses. Push back first.
- HABIT_SUCCESS:<name> / HABIT_FAIL:<name> based on user report
- FOCUS_UP if consistent / FOCUS_DOWN if struggling
- SCHEDULE_UPDATE:{"day":<0-2>,"index":<n>,"time":"HH:MM","title":"...","cue":"..."}
- REBUILD_NEEDED only if something major changes (new fixed event, illness, etc)`;
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
  return (
    <div style={{display:"flex",borderBottom:"1px solid #141414"}}>
      {["Today","Tomorrow","Day 3"].map((l,i)=>(
        <button key={i} onClick={()=>setActive(i)} style={{flex:1,padding:"8px 0",background:"none",border:"none",color:active===i?"#fff":"#333",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",borderBottom:active===i?"1px solid #fff":"1px solid transparent",marginBottom:-1}}>
          {l}
        </button>
      ))}
    </div>
  );
}

function ScheduleItem({ block, state, isPeak, profile }) {
  const isCur=state==="current", isPast=state==="past";
  const inPeak=isPeak&&!isPast;
  return (
    <div style={{padding:isCur?"10px 14px":"7px 14px",borderRadius:6,marginBottom:1,background:isCur?"#161616":inPeak?"#111008":"transparent",borderLeft:isCur?"2px solid #fff":inPeak?"2px solid #3a3a1a":"2px solid transparent",opacity:isPast?0.22:1}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <span style={{color:isCur?"#aaa":isPast?"#2a2a2a":inPeak?"#666":"#444",fontSize:11,minWidth:42,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{block.time}</span>
        <span style={{color:isCur?"#fff":isPast?"#333":inPeak?"#ddd":"#bbb",fontSize:isCur?15:13,fontWeight:isCur?600:400,flex:1,lineHeight:1.3}}>{block.title}</span>
        {isCur&&<span style={{color:"#000",background:"#fff",fontSize:9,fontWeight:700,letterSpacing:1.5,padding:"2px 6px",borderRadius:3,flexShrink:0}}>NOW</span>}
        {inPeak&&!isCur&&<span style={{color:"#4a4a00",fontSize:9,letterSpacing:1,flexShrink:0}}>PEAK</span>}
      </div>
      {block.cue&&!isPast&&(
        <div style={{marginTop:3,marginLeft:54,color:isCur?"#555":"#2a2a2a",fontSize:11,fontStyle:"italic",lineHeight:1.4}}>{block.cue}</div>
      )}
    </div>
  );
}

function ScheduleList({ blocks, activeDay, profile }) {
  const ref=useRef(null);
  const ci=activeDay===0?getCurIdx(blocks):-1;
  const peakStart=toMins(profile.peakStart||"12:00");
  const peakEnd=toMins(profile.peakEnd||"17:00");

  useEffect(()=>{
    if(ref.current&&ci>=0){
      const els=ref.current.querySelectorAll("[data-idx]");
      if(els[ci]) els[ci].scrollIntoView({block:"center",behavior:"smooth"});
    }
  },[ci,blocks.length,activeDay]);

  return (
    <div ref={ref} style={{flex:1,overflowY:"auto",padding:"6px 4px 6px"}}>
      {blocks.length===0&&<div style={{color:"#333",fontSize:13,padding:"32px 0",textAlign:"center"}}>Building your schedule…</div>}
      {blocks.map((b,i)=>{
        const bMins=toMins(b.time);
        const inPeak=bMins>=peakStart&&bMins<peakEnd;
        return (
          <div key={i} data-idx={i}>
            <ScheduleItem block={b} state={activeDay===0?(i===ci?"current":i<ci?"past":"future"):"future"} isPeak={inPeak} profile={profile}/>
          </div>
        );
      })}
    </div>
  );
}

function EventsTab({ profile, onUpdate }) {
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({time:"",title:"",duration:"60",days:"daily"});
  function startEdit(i) { setForm({...profile.fixedEvents[i],duration:String(profile.fixedEvents[i].duration||60)}); setEditing(i); }
  function startNew() { setForm({time:"",title:"",duration:"60",days:"daily"}); setEditing("new"); }
  function save() {
    if(!form.time||!form.title) return;
    let evts=[...profile.fixedEvents];
    const e={...form,duration:parseInt(form.duration)||60};
    editing==="new"?evts.push(e):evts[editing]=e;
    onUpdate({...profile,fixedEvents:evts}); setEditing(null);
  }
  function del(i) { onUpdate({...profile,fixedEvents:profile.fixedEvents.filter((_,x)=>x!==i)}); }
  return (
    <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Fixed Events</span>
        <button onClick={startNew} style={{background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>+ Add</button>
      </div>
      {profile.fixedEvents?.length===0&&<div style={{color:"#333",fontSize:13,padding:"12px 0"}}>No fixed events.</div>}
      {profile.fixedEvents?.map((e,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 0",borderBottom:"1px solid #141414"}}>
          <span style={{color:"#555",fontSize:12,minWidth:42}}>{e.time}</span>
          <span style={{color:"#ccc",fontSize:13,flex:1}}>{e.title}</span>
          <span style={{color:"#333",fontSize:11}}>{e.duration}m</span>
          <span style={{color:"#333",fontSize:11}}>{e.days}</span>
          <button onClick={()=>startEdit(i)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:12,padding:"2px 6px"}}>Edit</button>
          <button onClick={()=>del(i)} style={{background:"none",border:"none",color:"#4a2020",cursor:"pointer",fontSize:12,padding:"2px 6px"}}>Del</button>
        </div>
      ))}
      {editing!==null&&(
        <div style={{marginTop:16,background:"#111",border:"1px solid #1e1e1e",borderRadius:8,padding:"14px",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",gap:8}}>
            <input value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} placeholder="HH:MM"
              style={{width:60,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 8px",fontSize:13,outline:"none"}}/>
            <input value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))} placeholder="mins"
              style={{width:52,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 8px",fontSize:13,outline:"none"}}/>
            <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Title"
              style={{flex:1,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 8px",fontSize:13,outline:"none"}}/>
          </div>
          <input value={form.days} onChange={e=>setForm(f=>({...f,days:e.target.value}))} placeholder="daily / weekdays / mon,wed,fri"
            style={{background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#ccc",padding:"7px 9px",fontSize:12,outline:"none",width:"100%",boxSizing:"border-box"}}/>
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
    <div ref={feedRef} style={{height:145,overflowY:"auto",padding:"8px 18px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #141414"}}>
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
  const [messages,setMessages]=useState([{role:"ai",text:"Hey. I'm your schedule coach — I'll own your calendar so you don't have to think about it. Let's set you up properly. What's your name?"}]);
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
    const body={model:"claude-sonnet-4-5",max_tokens:4000,messages:[{role:"user",content:prompt}]};
    if(sys) body.system=sys;
    const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();
    return d.content?.map(c=>c.text||"").join("")||"";
  }

  async function loadOrBuild() {
    const saved=await sGet(SK.days);
    if(saved&&saved.date===todayStr()&&saved.days?.[0]?.length>0) {
      setDays(saved.days);
      setMessages([{role:"ai",text:`Welcome back, ${profile.name}. Your plan is loaded.`}]);
    } else { await buildDays(); }
  }

  async function buildDays(extra="") {
    setRebuilding(true);
    setMessages(m=>[...m,{role:"ai",text:"Building your 3-day plan…"}]);
    try {
      const raw=await claudeCall(threeDayPrompt(profile)+(extra?`\n\nAdditional context: ${extra}`:""));
      const clean=raw.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      const newDays=[parsed.day0||[],parsed.day1||[],parsed.day2||[]];
      setDays(newDays);
      await sSet(SK.days,{date:todayStr(),days:newDays});
      setMessages(m=>[...m.filter(x=>x.text!=="Building your 3-day plan…"),
        {role:"ai",text:`Done. ${newDays[0].length} blocks today, peak window locked ${profile.peakStart||"12:00"}–${profile.peakEnd||"17:00"}.`}]);
    } catch(e) {
      console.error(e);
      setMessages(m=>[...m,{role:"ai",text:"Failed to build. Check API."}]);
    }
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
        body:JSON.stringify({system:coachSystem(profile),message:`Day ${activeDay} schedule: ${ctx}\nUser says: ${msg}`})});
      const d=await r.json();
      const raw=d.content||"Error.";

      let np={...profile,habits:[...profile.habits]};
      const hs=raw.match(/HABIT_SUCCESS:(\S+)/);
      const hf=raw.match(/HABIT_FAIL:(\S+)/);
      if(hs) np.habits=np.habits.map(h=>{
        if(!h.habit.toLowerCase().includes(hs[1].toLowerCase())) return h;
        const streak=(h.streak||0)+1;
        const tighten=streak>0&&streak%3===0;
        return {...h,streak,currentTarget:tighten?Math.round(parseFloat(h.currentTarget)*0.8*10)/10:h.currentTarget};
      });
      if(hf) np.habits=np.habits.map(h=>
        h.habit.toLowerCase().includes(hf[1].toLowerCase())?{...h,streak:0,currentTarget:h.baseline}:h
      );
      if(raw.includes("FOCUS_UP")) np.focusMins=Math.min((np.focusMins||25)+5,50);
      if(raw.includes("FOCUS_DOWN")) np.focusMins=Math.max((np.focusMins||25)-5,15);
      if(JSON.stringify(np)!==JSON.stringify(profile)) await saveProfile(np);

      if(raw.includes("REBUILD_NEEDED")) {
        setMessages(m=>[...m,{role:"ai",text:"Rebuilding your 3-day plan…"}]);
        setLoading(false); await buildDays(msg); return;
      }
      const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
      if(upd) {
        try {
          const o=JSON.parse(upd[1]);
          const di=o.day??activeDay;
          const newDays=days.map((d,idx)=>idx===di?d.map((b,i)=>i===o.index?{...b,...o}:b):d);
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
        ?<ScheduleList blocks={days[activeDay]} activeDay={activeDay} profile={profile}/>
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