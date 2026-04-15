import { useState, useEffect, useRef } from "react";

const CLAUDE_API = "/api/generate";
const GROQ_API   = "/api/groq";

// ── Utils ──────────────────────────────────────────────
function toMins(t) { const [h,m]=t.split(":").map(Number); return h*60+m; }
function nowMins() { const n=new Date(); return n.getHours()*60+n.getMinutes(); }
function timeStr() { return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function dateStr() { return new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"}); }
function weekNum() { return ((Math.ceil(new Date().getDate()/7)-1)%4); }
function getCurIdx(blocks) {
  const now=nowMins(); let idx=-1;
  for(let i=0;i<blocks.length;i++) { if(toMins(blocks[i].time)<=now) idx=i; else break; }
  return idx;
}

const WEEK_MODE=["Understanding","Active Recall","Application","Error Correction"];
const WEEK_CUES=[
  "Explain why this works in your own words.",
  "Close notes and recall everything you know.",
  "Solve this without looking at solutions.",
  "Find your mistakes and fix your reasoning.",
];

const STORAGE_KEYS = { profile:"sched_profile_v1", schedule:"sched_schedule_v1" };

async function storageGet(key) {
  try { const r=await window.storage.get(key); return r?JSON.parse(r.value):null; } catch { return null; }
}
async function storageSet(key,val) {
  try { await window.storage.set(key,JSON.stringify(val)); } catch {}
}

// ── Onboarding AI ──────────────────────────────────────
const ONBOARD_SYSTEM = `You are a strict but supportive schedule coach onboarding a new user. 
Collect this info conversationally, ONE question at a time in this order:
1. Their name
2. Wake time and target sleep time
3. Peak energy window (when they focus best)
4. Fixed events (classes, work, recurring commitments) — ask them to list all, confirm each
5. Their main bad habits (ask for up to 3, one at a time)
   - For each habit: ask for the current baseline (e.g. "how many hours on phone before bed?")
   - Set a first target that is only 10-30% better than baseline
   - Store as: {habit, baseline, currentTarget, unit}
6. Any subjects or tasks they need to study/work on regularly

When you have collected ALL info, respond with a JSON block (and nothing else after it) in this exact format:
<PROFILE>
{"name":"...","wakeTime":"HH:MM","sleepTime":"HH:MM","peakEnergy":"...","fixedEvents":[{"time":"HH:MM","title":"...","days":"daily|weekdays|weekends|mon,wed,fri etc"}],"habits":[{"habit":"...","baseline":"...","currentTarget":"...","unit":"...","streak":0}],"tasks":["..."],"focusMins":25,"breakMins":5}
</PROFILE>

Keep responses short and direct. Be warm but no fluff. Never ask multiple questions at once.`;

// ── Schedule builder prompt ────────────────────────────
function schedulePrompt(profile) {
  const wk=weekNum();
  const habitNotes=profile.habits.map(h=>`- ${h.habit}: current target is ${h.currentTarget} ${h.unit}`).join("\n");
  const fixedNotes=profile.fixedEvents.map(e=>`${e.time} ${e.title}`).join(", ");
  return `Build today's schedule for ${profile.name}.
Time: ${timeStr()}. Date: ${dateStr()}.
Week ${wk+1} study mode: ${WEEK_MODE[wk]} — cue: "${WEEK_CUES[wk]}"

PROFILE:
- Wake: ${profile.wakeTime}, Sleep target: ${profile.sleepTime}
- Peak energy: ${profile.peakEnergy}
- Fixed events today: ${fixedNotes||"none"}
- Tasks/subjects: ${profile.tasks.join(", ")||"none"}
- Focus blocks: ${profile.focusMins} min work / ${profile.breakMins} min break
- Habit targets:\n${habitNotes||"none"}

RULES:
- Priority: fixed events → sleep (never cut) → 30-60min buffers before important events → study/tasks
- Place demanding study in peak energy window
- Break all study into ${profile.focusMins}-min focus blocks + ${profile.breakMins}-min breaks
- Add week cue as "cue" field on study blocks only
- Enforce habit targets as schedule blocks (e.g. "Phone away" block before sleep)
- Drop low-priority tasks if time is short — never compress sleep
- Do not create unrealistic schedules

Return ONLY a raw JSON array, no markdown:
[{"time":"HH:MM","title":"Short title","cue":"study blocks only"}]
8–14 blocks. 24h time. Titles max 5 words.`;
}

// ── Coach system prompt ────────────────────────────────
function coachSystem(profile, schedule) {
  const wk=weekNum();
  return `You are a strict daily schedule coach for ${profile.name}.
Week ${wk+1} mode: ${WEEK_MODE[wk]}. Focus: ${profile.focusMins}/${profile.breakMins} min.
Habits in progress: ${profile.habits.map(h=>`${h.habit} (target: ${h.currentTarget} ${h.unit}, streak: ${h.streak} days)`).join("; ")||"none"}

RULES:
- Max 2 sentences. Be direct.
- Push back on excuses before changing anything.
- If user reports completing habit target → append: HABIT_SUCCESS:<habit_name>
- If user reports failing habit → append: HABIT_FAIL:<habit_name>  
- If focus is working well → append: FOCUS_UP
- If user is struggling → append: FOCUS_DOWN
- Small schedule change: SCHEDULE_UPDATE:{"index":<n>,"time":"HH:MM","title":"...","cue":"..."}
- Full rebuild needed: REBUILD_NEEDED`;
}

// ── Components ─────────────────────────────────────────
function Header({ date, mode }) {
  return (
    <div style={{padding:"13px 18px 9px",borderBottom:"1px solid #141414",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>{date}</div>
      <div style={{color:"#333",fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>Wk {weekNum()+1} · {mode}</div>
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
        <div style={{marginTop:4,marginLeft:54,color:isCur?"#666":"#3a3a3a",fontSize:11,fontStyle:"italic"}}>{block.cue}</div>
      )}
    </div>
  );
}

function ScheduleList({ blocks, curIdx }) {
  const ref=useRef(null);
  useEffect(()=>{
    if(ref.current&&curIdx>=0){
      const els=ref.current.querySelectorAll("[data-idx]");
      if(els[curIdx]) els[curIdx].scrollIntoView({block:"center",behavior:"smooth"});
    }
  },[curIdx,blocks.length]);
  return (
    <div ref={ref} style={{flex:1,overflowY:"auto",padding:"8px 4px 6px"}}>
      {blocks.length===0&&<div style={{color:"#333",fontSize:13,padding:"32px 0",textAlign:"center"}}>Building your schedule…</div>}
      {blocks.map((b,i)=>(
        <div key={i} data-idx={i}><ScheduleItem block={b} state={i===curIdx?"current":i<curIdx?"past":"future"}/></div>
      ))}
    </div>
  );
}

function EventsTab({ profile, onUpdate }) {
  const [editing,setEditing]=useState(null); // index or "new"
  const [form,setForm]=useState({time:"",title:"",days:"daily"});

  function startEdit(i) {
    const e=profile.fixedEvents[i];
    setForm({time:e.time,title:e.title,days:e.days});
    setEditing(i);
  }
  function startNew() { setForm({time:"",title:"",days:"daily"}); setEditing("new"); }
  function save() {
    if(!form.time||!form.title) return;
    let evts=[...profile.fixedEvents];
    if(editing==="new") evts.push(form);
    else evts[editing]=form;
    onUpdate({...profile,fixedEvents:evts});
    setEditing(null);
  }
  function del(i) { onUpdate({...profile,fixedEvents:profile.fixedEvents.filter((_,x)=>x!==i)}); }

  return (
    <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Fixed Events</span>
        <button onClick={startNew} style={{background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>+ Add</button>
      </div>
      {profile.fixedEvents.length===0&&<div style={{color:"#333",fontSize:13,padding:"16px 0"}}>No fixed events yet.</div>}
      {profile.fixedEvents.map((e,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #141414"}}>
          <span style={{color:"#555",fontSize:12,minWidth:42}}>{e.time}</span>
          <span style={{color:"#ccc",fontSize:14,flex:1}}>{e.title}</span>
          <span style={{color:"#333",fontSize:11}}>{e.days}</span>
          <button onClick={()=>startEdit(i)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:12}}>Edit</button>
          <button onClick={()=>del(i)} style={{background:"none",border:"none",color:"#3a2020",cursor:"pointer",fontSize:12}}>Del</button>
        </div>
      ))}
      {editing!==null&&(
        <div style={{marginTop:16,background:"#111",border:"1px solid #1e1e1e",borderRadius:8,padding:"14px"}}>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            <input value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} placeholder="HH:MM"
              style={{width:64,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 9px",fontSize:13,outline:"none"}}/>
            <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Event title"
              style={{flex:1,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 9px",fontSize:13,outline:"none"}}/>
          </div>
          <input value={form.days} onChange={e=>setForm(f=>({...f,days:e.target.value}))} placeholder="daily / weekdays / mon,wed,fri"
            style={{width:"100%",background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#ccc",padding:"7px 9px",fontSize:12,outline:"none",marginBottom:10,boxSizing:"border-box"}}/>
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
    <div ref={feedRef} style={{height:155,overflowY:"auto",padding:"8px 18px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #141414"}}>
      {messages.length===0&&<div style={{color:"#2a2a2a",fontSize:12,margin:"auto",textAlign:"center"}}>Chat with your coach</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&<MessageBubble msg={{role:"ai",text:"…"}}/>}
    </div>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <div style={{display:"flex",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
      {["Schedule","Events"].map(t=>(
        <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"10px 0",background:"none",border:"none",color:tab===t?"#fff":"#333",fontSize:12,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",borderTop:tab===t?"1px solid #fff":"1px solid transparent",marginTop:-1}}>
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
        placeholder="Talk to your coach…" value={value}
        onChange={e=>onChange(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onSend()} disabled={disabled}/>
      <button onClick={onSend} disabled={disabled} style={{background:"#fff",color:"#000",border:"none",borderRadius:7,width:38,fontSize:16,fontWeight:700,cursor:"pointer",opacity:disabled?0.4:1}}>↑</button>
      <button onClick={onRebuild} disabled={rebuilding} style={{background:"transparent",border:"1px solid #222",color:"#555",borderRadius:7,padding:"0 12px",fontSize:11,cursor:"pointer",opacity:rebuilding?0.4:1,whiteSpace:"nowrap"}}>{rebuilding?"…":"Fix"}</button>
    </div>
  );
}

// ── Onboarding screen ──────────────────────────────────
function Onboarding({ onComplete }) {
  const [messages,setMessages]=useState([{role:"ai",text:"Hey! I'm your schedule coach. Let's set you up. What's your name?"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const feedRef=useRef(null);
  const history=useRef([]);

  useEffect(()=>{ if(feedRef.current) feedRef.current.scrollTop=feedRef.current.scrollHeight; },[messages]);

  async function send() {
    if(!input.trim()||loading) return;
    const msg=input.trim(); setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]);
    history.current=[...history.current,{role:"user",content:msg}];
    setLoading(true);
    try {
      const r=await fetch(CLAUDE_API,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-5",max_tokens:600,
          system:ONBOARD_SYSTEM,
          messages:history.current
        })
      });
      const d=await r.json();
      const raw=d.content?.map(c=>c.text||"").join("")||"";
      history.current=[...history.current,{role:"assistant",content:raw}];
      const profileMatch=raw.match(/<PROFILE>([\s\S]*?)<\/PROFILE>/);
      if(profileMatch) {
        const profile=JSON.parse(profileMatch[1].trim());
        await storageSet(STORAGE_KEYS.profile,profile);
        onComplete(profile);
        return;
      }
      setMessages(m=>[...m,{role:"ai",text:raw}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Connection error. Try again."}]); }
    setLoading(false);
  }

  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      <div style={{padding:"18px 18px 10px",borderBottom:"1px solid #141414"}}>
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

// ── Main screen ────────────────────────────────────────
function MainScreen({ profile: initProfile }) {
  const [profile,setProfile]=useState(initProfile);
  const [schedule,setSchedule]=useState([]);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [rebuilding,setRebuilding]=useState(false);
  const [tab,setTab]=useState("Schedule");
  const [tick,setTick]=useState(0);
  const feedRef=useRef(null);

  useEffect(()=>{ const t=setInterval(()=>setTick(x=>x+1),60000); return()=>clearInterval(t); },[]);
  useEffect(()=>{ if(feedRef.current) feedRef.current.scrollTop=feedRef.current.scrollHeight; },[messages,loading]);
  useEffect(()=>{ loadOrBuild(); },[]);

  const ci=getCurIdx(schedule);

  async function loadOrBuild() {
    const saved=await storageGet(STORAGE_KEYS.schedule);
    const today=new Date().toDateString();
    if(saved&&saved.date===today&&saved.blocks?.length>0) {
      setSchedule(saved.blocks);
      setMessages([{role:"ai",text:`Welcome back, ${profile.name}. Schedule loaded.`}]);
    } else { await buildSchedule(); }
  }

  async function claudeCall(prompt, sys=null) {
    const body = { model:"claude-sonnet-4-5", max_tokens:1500, messages:[{role:"user",content:prompt}] };
    if(sys) body.system=sys;
    const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();
    return d.content?.map(c=>c.text||"").join("")||"";
  }

  async function buildSchedule() {
    setRebuilding(true);
    try {
      const raw=await claudeCall(schedulePrompt(profile));
      const blocks=JSON.parse(raw.replace(/```json|```/g,"").trim());
      setSchedule(blocks);
      await storageSet(STORAGE_KEYS.schedule,{date:new Date().toDateString(),blocks});
      setMessages([{role:"ai",text:`Schedule built. Week ${weekNum()+1}: ${WEEK_MODE[weekNum()]}. Let's go.`}]);
    } catch { setMessages([{role:"ai",text:"Failed to build schedule."}]); }
    setRebuilding(false);
  }

  async function rebuild() {
    setRebuilding(true);
    try {
      const ctx=`Rebuild from now (${timeStr()}). Existing: ${JSON.stringify(schedule)}.`;
      const raw=await claudeCall(schedulePrompt({...profile,rebuildCtx:ctx}));
      const blocks=JSON.parse(raw.replace(/```json|```/g,"").trim());
      setSchedule(blocks);
      await storageSet(STORAGE_KEYS.schedule,{date:new Date().toDateString(),blocks});
      setMessages(m=>[...m,{role:"ai",text:"Rebuilt. Back on track."}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Rebuild failed."}]); }
    setRebuilding(false);
  }

  async function updateProfile(newProfile) {
    setProfile(newProfile);
    await storageSet(STORAGE_KEYS.profile,newProfile);
  }

  async function send() {
    if(!input.trim()||loading) return;
    const msg=input.trim(); setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]); setLoading(true);
    const ctx=schedule.map((b,i)=>`[${i}]${b.time} ${b.title}${i===ci?" ←NOW":""}`).join(" | ");
    try {
      const r=await fetch(GROQ_API,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({system:coachSystem(profile,schedule),message:`Schedule: ${ctx}\nUser: ${msg}`})
      });
      const d=await r.json();
      const raw=d.content||"Error.";

      let newProfile={...profile};
      // Habit tracking
      const hSuccess=raw.match(/HABIT_SUCCESS:([^\s\n]+)/);
      const hFail=raw.match(/HABIT_FAIL:([^\s\n]+)/);
      if(hSuccess) {
        newProfile.habits=newProfile.habits.map(h=>{
          if(h.habit.toLowerCase().includes(hSuccess[1].toLowerCase())) {
            const streak=(h.streak||0)+1;
            const improve=streak>=3;
            return {...h,streak,currentTarget:improve?Math.round(parseFloat(h.currentTarget)*0.8*10)/10:h.currentTarget};
          }
          return h;
        });
      }
      if(hFail) {
        newProfile.habits=newProfile.habits.map(h=>{
          if(h.habit.toLowerCase().includes(hFail[1].toLowerCase()))
            return {...h,streak:0,currentTarget:h.baseline};
          return h;
        });
      }
      if(raw.includes("FOCUS_UP")) newProfile.focusMins=Math.min((newProfile.focusMins||25)+5,50);
      if(raw.includes("FOCUS_DOWN")) newProfile.focusMins=Math.max((newProfile.focusMins||25)-5,15);
      if(JSON.stringify(newProfile)!==JSON.stringify(profile)) await updateProfile(newProfile);

      if(raw.includes("REBUILD_NEEDED")) {
        setMessages(m=>[...m,{role:"ai",text:"Rebuilding your day…"}]);
        setLoading(false); await rebuild(); return;
      }
      const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
      if(upd) {
        try {
          const o=JSON.parse(upd[1]);
          const newBlocks=schedule.map((b,i)=>i===o.index?{...b,...o}:b);
          setSchedule(newBlocks);
          await storageSet(STORAGE_KEYS.schedule,{date:new Date().toDateString(),blocks:newBlocks});
        } catch {}
      }
      const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/HABIT_SUCCESS:\S+|HABIT_FAIL:\S+|FOCUS_UP|FOCUS_DOWN|REBUILD_NEEDED/g,"").trim();
      if(clean) setMessages(m=>[...m,{role:"ai",text:clean}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Groq unreachable."}]); }
    setLoading(false);
  }

  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      <Header date={dateStr()} mode={WEEK_MODE[weekNum()]}/>
      {tab==="Schedule"
        ? <ScheduleList blocks={schedule} curIdx={ci}/>
        : <EventsTab profile={profile} onUpdate={p=>{ updateProfile(p); }}/>
      }
      <ChatFeed messages={messages} loading={loading} feedRef={feedRef}/>
      <TabBar tab={tab} setTab={setTab}/>
      <InputBar value={input} onChange={setInput} onSend={send} onRebuild={rebuild} disabled={loading} rebuilding={rebuilding}/>
    </div>
  );
}

// ── App root ───────────────────────────────────────────
export default function App() {
  const [profile,setProfile]=useState(undefined);

  useEffect(()=>{ storageGet(STORAGE_KEYS.profile).then(p=>setProfile(p||null)); },[]);

  if(profile===undefined) return (
    <div style={{height:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#333",fontSize:12,letterSpacing:2}}>LOADING…</div>
    </div>
  );
  if(!profile) return <Onboarding onComplete={p=>setProfile(p)}/>;
  return <MainScreen profile={profile}/>;
}