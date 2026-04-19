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
function getDayLabel(off=0) {
  const d=new Date(); d.setDate(d.getDate()+off);
  return d.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});
}
function getDayName(off=0) {
  const d=new Date(); d.setDate(d.getDate()+off);
  return d.toLocaleDateString([],{weekday:"long"});
}
function isWeekend(off=0) {
  const d=new Date(); d.setDate(d.getDate()+off);
  return d.getDay()===0||d.getDay()===6;
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
const SK={ profile:"sched_profile_v3", days:"sched_days_v3", subjects:"sched_subjects_v1" };
async function sGet(k) { try { const r=await window.storage.get(k); return r?JSON.parse(r.value):null; } catch { return null; } }
async function sSet(k,v) { try { await window.storage.set(k,JSON.stringify(v)); } catch(e) { console.error(e); } }

// ── Prompts ────────────────────────────────────────────
const ONBOARD_SYSTEM=`You are a strict schedule coach onboarding a new university student. One question at a time:
1. Name
2. Current wake time and sleep time — ask what they ACTUALLY do, not what they wish they did
   - If sleep is after 23:30 or wake is after 9:00 or total sleep is under 7h: flag it directly
   - Say something like: "That's not enough sleep. We'll fix it gradually."
   - Set a first target that is 20–30 min better than their current baseline (e.g. if they sleep at 3am, first target is 2:30am)
   - Add sleep and wake as habits with baseline, currentTarget, unit ("time"), streak 0
3. Peak energy window — ask for exact times (e.g. "12:00–17:00")
4. Fixed events — classes, work, appointments — day, time, duration
5. Other bad habits (up to 3) — baseline + 10–30% better first target
6. Current semester subjects — name and type (deep/light/practical)
7. Hobbies and outside interests:
   - Ask what they currently do for fun or what they'd like to learn outside of university
   - If they have hobbies: assess if each one is realistic given their schedule (time-intensive vs low-effort)
   - If they have no hobbies or seem unsure: suggest 2–3 options that match their personality and schedule
     (e.g. if they study maths heavily → suggest chess, music, or a physical sport for balance)
   - For each hobby: assign a frequency (daily/2x week/weekend) and rough duration (15–60min)
   - Hobbies are NOT optional fillers — they are scheduled blocks just like study

When ALL collected, output ONLY:
<PROFILE>
{"name":"","wakeTime":"HH:MM","sleepTime":"HH:MM","peakStart":"HH:MM","peakEnd":"HH:MM","fixedEvents":[{"time":"HH:MM","duration":60,"title":"","days":"daily|weekdays|mon,wed,fri"}],"habits":[{"habit":"sleep","baseline":"HH:MM","currentTarget":"HH:MM","unit":"time","streak":0},{"habit":"wake","baseline":"HH:MM","currentTarget":"HH:MM","unit":"time","streak":0}],"hobbies":[{"name":"","duration":30,"frequency":"daily|2x week|weekend","type":"active|creative|social|cognitive"}],"focusMins":25,"breakMins":5}
</PROFILE>
wakeTime and sleepTime must reflect currentTarget, not baseline.
Be concise. Never ask multiple questions at once.`;

function buildPrompt(profile, subjects, extra="") {
  const wk=weekNum();
  const sleepHabit=profile.habits?.find(h=>h.habit==="sleep");
  const wakeHabit=profile.habits?.find(h=>h.habit==="wake");
  const effectiveWake=wakeHabit?.currentTarget||profile.wakeTime;
  const effectiveSleep=sleepHabit?.currentTarget||profile.sleepTime;
  const fixedStr=profile.fixedEvents?.map(e=>`  ${e.time} (${e.duration}min) — "${e.title}" [${e.days}]`).join("\n")||"  none";
  const habitStr=profile.habits?.map(h=>`  • ${h.habit}: target ${h.currentTarget} ${h.unit} (baseline: ${h.baseline}, streak: ${h.streak}d)`).join("\n")||"  none";
  const deepSubjects=subjects.filter(s=>s.type==="deep").map(s=>s.name).join(", ")||"none";
  const lightSubjects=subjects.filter(s=>s.type==="light").map(s=>s.name).join(", ")||"none";
  const practicalSubjects=subjects.filter(s=>s.type==="practical").map(s=>s.name).join(", ")||"none";
  const allSubjects=subjects.map(s=>s.name).join(", ")||"none";
  const hobbyStr=profile.hobbies?.map(h=>`  • ${h.name} — ${h.duration}min, ${h.frequency} (${h.type})`).join("\n")||"  none";

  return `You are building a HYPER-PERSONALISED 3-day schedule for ${profile.name}, a university student.

━━━ PROFILE ━━━
Name: ${profile.name}
Wake: ${effectiveWake} (baseline: ${profile.wakeTime}) | Sleep: ${effectiveSleep} (baseline: ${profile.sleepTime})
Peak energy: ${profile.peakStart} → ${profile.peakEnd} [SACRED — see rules]
Focus: ${profile.focusMins}min work / ${profile.breakMins}min break
Week ${wk+1} mode: ${WEEK_MODE[wk]} | Cue: "${WEEK_CUES[wk]}"

Subjects this semester:
  Deep work: ${deepSubjects}
  Light: ${lightSubjects}
  Practical: ${practicalSubjects}

Fixed events:
${fixedStr}

Habit targets:
${habitStr}

Days to build: ${dayInfos}
${extra?`\nExtra context: ${extra}`:""}

━━━ CONSISTENCY RULES (MOST IMPORTANT) ━━━
1. Build Day 1 (${getDayName(0)}) as the MASTER TEMPLATE.
2. Days 2 and 3 MUST mirror Day 1's block structure exactly — same time slots, same block types, same sequence.
3. Only the specific topic/task name within a subject changes across days (e.g. always 12:00 deep work, but Mon=derivatives, Tue=integration).
4. The user must be able to predict exactly what they're doing at any time without checking the app.

━━━ PEAK WINDOW RULES (NON-NEGOTIABLE) ━━━
PEAK WINDOW = ${profile.peakStart} to ${profile.peakEnd}. This is the user's highest cognitive performance window.

WEEKDAYS — peak window must contain:
  ✓ ONLY deep work subjects (from the deep list above)
  ✓ Focus blocks: ${profile.focusMins}min work + ${profile.breakMins}min break, back to back
  ✗ NO exploratory/fun/curiosity blocks (those go in low-energy slots outside peak)
  ✗ NO meals, admin, errands, chores, light subjects, or recovery
  ✗ NO "interesting" or "playful" content of any kind

WEEKENDS — peak window must contain:
  ✓ ONLY ONE exploratory/curiosity block (fun, pressure-free, interest-driven)
  ✓ Pick one subject and a curiosity angle (e.g. "Explore: why does i exist?")
  ✗ NO deep work, no performance pressure, no week cue
  ✗ NO meals, admin, or errands

If you put exploratory content in the peak window on a weekday = CRITICAL ERROR.
If you put deep work in the peak window on a weekend = CRITICAL ERROR.
These are the two most important rules in this entire prompt.

━━━ WEEKDAY RULES ━━━
- Every minute ${profile.wakeTime}–${profile.sleepTime} assigned. Zero gaps. Back-to-back.
- 5–15min granularity for routines, 25–50min for work/study.
- Include: wake routine, hygiene, meals, transitions, study, breaks, wind-down.
- Light subjects and exploratory/curiosity blocks go in LOW-energy slots (after meals, early morning, evening) — never during peak.
- Habit targets appear as named blocks at consistent times each day.
- Add week cue as "cue" on study blocks only.
- Never write "Study session" — use actual subject names and specific topics.

━━━ WEEKEND RULES ━━━
- Keep the SAME skeleton: wake time, meal times, wind-down, sleep — identical to weekdays.
- ONE short deep work block (60–90min max) placed in a MORNING slot BEFORE peak window.
- Peak window = exploratory block only (see peak rules above).
- Rest of day: maintenance (chores, laundry, meal prep, admin) + recovery (walk, rest, low-stimulation). Label specifically.
- Still structured — no dead time — lighter intensity only outside peak.

━━━ HARD RULES ━━━
- Sleep is protected. Never schedule work after wind-down.
- Fixed events are immovable. Add 30min prep before exams/important events.
- Drop tasks if time runs short — never compress sleep or peak window.
- 20–35 blocks per day.

━━━ OUTPUT ━━━
Return ONLY raw JSON. No markdown. No explanation.
{"day0":[{"time":"HH:MM","title":"Specific title","cue":"study blocks only"}],"day1":[...],"day2":[...]}
24h time. ${dayInfos}.`;
}

function coachSys(profile, subjects) {
  const wk=weekNum();
  return `You are a relentless, no-excuses schedule coach for ${profile.name}.
Peak: ${profile.peakStart}–${profile.peakEnd}. Week ${wk+1}: ${WEEK_MODE[wk]}.
Subjects: ${subjects.map(s=>s.name).join(", ")||"none"}.
Habits: ${profile.habits?.map(h=>`${h.habit}(target:${h.currentTarget}${h.unit},streak:${h.streak}d)`).join("; ")||"none"}
Focus: ${profile.focusMins}/${profile.breakMins}min.
RULES: Max 2 sentences. Brutal. Push back before changing anything.
Sleep/wake habits are treated like any other habit — enforce the current target, progress gradually.
If user says they slept past their target: HABIT_FAIL:sleep. If they hit it: HABIT_SUCCESS:sleep.
HABIT_SUCCESS:<n> / HABIT_FAIL:<n> / FOCUS_UP / FOCUS_DOWN
SCHEDULE_UPDATE:{"day":<0-2>,"index":<n>,"time":"HH:MM","title":"...","cue":"..."}
REBUILD_NEEDED only for major changes (new fixed event, illness, new subjects).`;
}

// ── UI Components ──────────────────────────────────────
function Header({ dayLabel, mode }) {
  return (
    <div style={{padding:"13px 18px 9px",borderBottom:"1px solid #141414",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>{dayLabel}</div>
      <div style={{color:"#333",fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>Wk {weekNum()+1} · {mode}</div>
    </div>
  );
}

function DayTabs({ active, setActive, days }) {
  const labels=["Today","Tomorrow","Day 3"];
  return (
    <div style={{display:"flex",borderBottom:"1px solid #141414"}}>
      {labels.map((l,i)=>(
        <button key={i} onClick={()=>setActive(i)} style={{flex:1,padding:"7px 0",background:"none",border:"none",color:active===i?"#fff":"#333",fontSize:11,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",borderBottom:active===i?"1px solid #fff":"1px solid transparent",marginBottom:-1}}>
          {l}{isWeekend(i)?<span style={{color:"#2a2a1a",fontSize:9,marginLeft:4}}>WKD</span>:null}
        </button>
      ))}
    </div>
  );
}

function ScheduleItem({ block, state, inPeak }) {
  const isCur=state==="current", isPast=state==="past";
  return (
    <div style={{padding:isCur?"10px 14px":"7px 14px",borderRadius:6,marginBottom:1,background:isCur?"#161616":inPeak&&!isPast?"#111008":"transparent",borderLeft:isCur?"2px solid #fff":inPeak&&!isPast?"2px solid #2a2a00":"2px solid transparent",opacity:isPast?0.22:1}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <span style={{color:isCur?"#aaa":isPast?"#2a2a2a":inPeak?"#666":"#444",fontSize:11,minWidth:42,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{block.time}</span>
        <span style={{color:isCur?"#fff":isPast?"#333":inPeak?"#ddd":"#bbb",fontSize:isCur?15:13,fontWeight:isCur?600:400,flex:1,lineHeight:1.3}}>{block.title}</span>
        {isCur&&<span style={{color:"#000",background:"#fff",fontSize:9,fontWeight:700,letterSpacing:1.5,padding:"2px 6px",borderRadius:3}}>NOW</span>}
        {inPeak&&!isCur&&!isPast&&<span style={{color:"#3a3a00",fontSize:9,letterSpacing:1,flexShrink:0}}>PEAK</span>}
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
  const ps=toMins(profile.peakStart||"12:00"), pe=toMins(profile.peakEnd||"17:00");
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
        const bm=toMins(b.time);
        return (
          <div key={i} data-idx={i}>
            <ScheduleItem block={b} state={activeDay===0?(i===ci?"current":i<ci?"past":"future"):"future"} inPeak={bm>=ps&&bm<pe}/>
          </div>
        );
      })}
    </div>
  );
}

// ── Events Tab ─────────────────────────────────────────
function EventsTab({ profile, onUpdate }) {
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({time:"",title:"",duration:"60",days:"daily"});
  const save=()=>{
    if(!form.time||!form.title) return;
    let evts=[...profile.fixedEvents];
    const e={...form,duration:parseInt(form.duration)||60};
    editing==="new"?evts.push(e):evts[editing]=e;
    onUpdate({...profile,fixedEvents:evts}); setEditing(null);
  };
  return (
    <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Fixed Events</span>
        <button onClick={()=>{setForm({time:"",title:"",duration:"60",days:"daily"});setEditing("new");}} style={{background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>+ Add</button>
      </div>
      {!profile.fixedEvents?.length&&<div style={{color:"#333",fontSize:13}}>No fixed events.</div>}
      {profile.fixedEvents?.map((e,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 0",borderBottom:"1px solid #141414"}}>
          <span style={{color:"#555",fontSize:12,minWidth:42}}>{e.time}</span>
          <span style={{color:"#ccc",fontSize:13,flex:1}}>{e.title}</span>
          <span style={{color:"#333",fontSize:11}}>{e.duration}m · {e.days}</span>
          <button onClick={()=>{setForm({...e,duration:String(e.duration)});setEditing(i);}} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:12,padding:"2px 6px"}}>Edit</button>
          <button onClick={()=>onUpdate({...profile,fixedEvents:profile.fixedEvents.filter((_,x)=>x!==i)})} style={{background:"none",border:"none",color:"#4a2020",cursor:"pointer",fontSize:12,padding:"2px 6px"}}>Del</button>
        </div>
      ))}
      {editing!==null&&(
        <div style={{marginTop:16,background:"#111",border:"1px solid #1e1e1e",borderRadius:8,padding:"14px",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",gap:8}}>
            <input value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} placeholder="HH:MM" style={{width:60,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 8px",fontSize:13,outline:"none"}}/>
            <input value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))} placeholder="mins" style={{width:52,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 8px",fontSize:13,outline:"none"}}/>
            <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Title" style={{flex:1,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 8px",fontSize:13,outline:"none"}}/>
          </div>
          <input value={form.days} onChange={e=>setForm(f=>({...f,days:e.target.value}))} placeholder="daily / weekdays / mon,wed,fri" style={{background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#ccc",padding:"7px 9px",fontSize:12,outline:"none",width:"100%",boxSizing:"border-box"}}/>
          <div style={{display:"flex",gap:8}}>
            <button onClick={save} style={{flex:1,background:"#fff",color:"#000",border:"none",borderRadius:5,padding:"8px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Save</button>
            <button onClick={()=>setEditing(null)} style={{flex:1,background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"8px",fontSize:13,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subjects Tab ───────────────────────────────────────
const SUBJECT_TYPES=["deep","light","practical"];
function SubjectsTab({ subjects, onUpdate }) {
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({name:"",type:"deep"});
  const [semester,setSemester]=useState("");
  const save=()=>{
    if(!form.name.trim()) return;
    let s=[...subjects];
    editing==="new"?s.push({...form}):s[editing]={...form};
    onUpdate(s); setEditing(null);
  };
  return (
    <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <span style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Subjects</span>
        <button onClick={()=>{setForm({name:"",type:"deep"});setEditing("new");}} style={{background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>+ Add</button>
      </div>
      <input value={semester} onChange={e=>setSemester(e.target.value)} placeholder="Semester label (e.g. Sem 1 2025)"
        style={{width:"100%",background:"#0d0d0d",border:"1px solid #1a1a1a",borderRadius:5,color:"#555",padding:"6px 10px",fontSize:11,outline:"none",marginBottom:12,boxSizing:"border-box"}}/>
      {!subjects.length&&<div style={{color:"#333",fontSize:13}}>No subjects added.</div>}
      {subjects.map((s,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 0",borderBottom:"1px solid #141414"}}>
          <span style={{color:"#ccc",fontSize:13,flex:1}}>{s.name}</span>
          <span style={{color:"#333",fontSize:10,letterSpacing:1,textTransform:"uppercase",padding:"2px 6px",border:"1px solid #222",borderRadius:3}}>{s.type}</span>
          <button onClick={()=>{setForm({name:s.name,type:s.type});setEditing(i);}} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:12,padding:"2px 6px"}}>Edit</button>
          <button onClick={()=>onUpdate(subjects.filter((_,x)=>x!==i))} style={{background:"none",border:"none",color:"#4a2020",cursor:"pointer",fontSize:12,padding:"2px 6px"}}>Del</button>
        </div>
      ))}
      {subjects.length>0&&(
        <button onClick={()=>{ if(window.confirm("Clear all subjects for new semester?")) onUpdate([]); }}
          style={{marginTop:16,background:"transparent",border:"1px solid #2a1a1a",color:"#4a2020",borderRadius:5,padding:"7px 12px",fontSize:11,cursor:"pointer",width:"100%"}}>
          New Semester — Clear All
        </button>
      )}
      {editing!==null&&(
        <div style={{marginTop:16,background:"#111",border:"1px solid #1e1e1e",borderRadius:8,padding:"14px",display:"flex",flexDirection:"column",gap:8}}>
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Subject name"
            style={{background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"8px 10px",fontSize:13,outline:"none"}}/>
          <div style={{display:"flex",gap:6}}>
            {SUBJECT_TYPES.map(t=>(
              <button key={t} onClick={()=>setForm(f=>({...f,type:t}))} style={{flex:1,background:form.type===t?"#fff":"transparent",color:form.type===t?"#000":"#555",border:"1px solid #222",borderRadius:5,padding:"6px 0",fontSize:11,cursor:"pointer",textTransform:"uppercase",letterSpacing:1}}>
                {t}
              </button>
            ))}
          </div>
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
    <div ref={feedRef} style={{height:140,overflowY:"auto",padding:"8px 18px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #141414"}}>
      {!messages.length&&<div style={{color:"#2a2a2a",fontSize:12,margin:"auto",textAlign:"center"}}>Chat with your coach</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&<MessageBubble msg={{role:"ai",text:"…"}}/>}
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  return (
    <div style={{display:"flex",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
      {["Schedule","Events","Subjects"].map(t=>(
        <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"9px 0",background:"none",border:"none",color:tab===t?"#fff":"#333",fontSize:10,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",borderTop:tab===t?"1px solid #fff":"1px solid transparent",marginTop:-1}}>
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
  const [messages,setMessages]=useState([{role:"ai",text:"Hey. I'm your schedule coach — I own your calendar so you can focus on what matters. Let's set you up. What's your name?"}]);
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
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:700,system:ONBOARD_SYSTEM,messages:history.current})});
      const d=await r.json();
      const raw=d.content?.map(c=>c.text||"").join("")||"";
      history.current=[...history.current,{role:"assistant",content:raw}];
      const match=raw.match(/<PROFILE>([\s\S]*?)<\/PROFILE>/);
      if(match) {
        const p=JSON.parse(match[1].trim());
        await sSet(SK.profile,p);
        onComplete(p,[]); return;
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
function MainScreen({ profile: initP, subjects: initS }) {
  const [profile,setProfile]=useState(initP);
  const [subjects,setSubjects]=useState(initS||[]);
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

  async function claudeCall(prompt) {
    const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:4000,messages:[{role:"user",content:prompt}]})});
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

  async function buildDays(extra="") {
    setRebuilding(true);
    setMessages(m=>[...m,{role:"ai",text:"Building your 3-day plan…"}]);
    try {
      const raw=await claudeCall(buildPrompt(profile,subjects,extra));
      const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());
      const newDays=[parsed.day0||[],parsed.day1||[],parsed.day2||[]];
      setDays(newDays);
      await sSet(SK.days,{date:todayStr(),days:newDays});
      setMessages(m=>[...m.filter(x=>x.text!=="Building your 3-day plan…"),
        {role:"ai",text:`Done. ${newDays[0].length} blocks today. Peak ${profile.peakStart}–${profile.peakEnd} locked.`}]);
    } catch(e) {
      console.error(e);
      setMessages(m=>[...m,{role:"ai",text:"Failed to build. Check API."}]);
    }
    setRebuilding(false);
  }

  async function saveProfile(p) { setProfile(p); await sSet(SK.profile,p); }
  async function saveSubjects(s) { setSubjects(s); await sSet(SK.subjects,s); }

  async function send() {
    if(!input.trim()||loading) return;
    const msg=input.trim(); setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]); setLoading(true);
    const ctx=days[activeDay].map((b,i)=>`[${i}]${b.time} ${b.title}${activeDay===0&&i===ci?" ←NOW":""}`).join(" | ");
    try {
      const r=await fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({system:coachSys(profile,subjects),message:`Day ${activeDay}: ${ctx}\nUser: ${msg}`})});
      const d=await r.json();
      const raw=d.content||"Error.";

      let np={...profile,habits:[...(profile.habits||[])]};
      const hs=raw.match(/HABIT_SUCCESS:(\S+)/), hf=raw.match(/HABIT_FAIL:(\S+)/);
      if(hs) np.habits=np.habits.map(h=>{
        if(!h.habit.toLowerCase().includes(hs[1].toLowerCase())) return h;
        const streak=(h.streak||0)+1;
        return {...h,streak,currentTarget:streak%3===0?Math.round(parseFloat(h.currentTarget)*0.8*10)/10:h.currentTarget};
      });
      if(hf) np.habits=np.habits.map(h=>h.habit.toLowerCase().includes(hf[1].toLowerCase())?{...h,streak:0,currentTarget:h.baseline}:h);
      if(raw.includes("FOCUS_UP")) np.focusMins=Math.min((np.focusMins||25)+5,50);
      if(raw.includes("FOCUS_DOWN")) np.focusMins=Math.max((np.focusMins||25)-5,15);
      if(JSON.stringify(np)!==JSON.stringify(profile)) await saveProfile(np);

      if(raw.includes("REBUILD_NEEDED")) {
        setMessages(m=>[...m,{role:"ai",text:"Rebuilding 3-day plan…"}]);
        setLoading(false); await buildDays(msg); return;
      }
      const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
      if(upd) {
        try {
          const o=JSON.parse(upd[1]); const di=o.day??activeDay;
          const nd=days.map((d,i)=>i===di?d.map((b,j)=>j===o.index?{...b,...o}:b):d);
          setDays(nd); await sSet(SK.days,{date:todayStr(),days:nd});
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
      {tab==="Schedule"&&<ScheduleList blocks={days[activeDay]} activeDay={activeDay} profile={profile}/>}
      {tab==="Events"&&<EventsTab profile={profile} onUpdate={p=>saveProfile(p)}/>}
      {tab==="Subjects"&&<SubjectsTab subjects={subjects} onUpdate={s=>saveSubjects(s)} profile={profile} onUpdateProfile={p=>saveProfile(p)}/>}
      <ChatFeed messages={messages} loading={loading} feedRef={feedRef}/>
      <BottomNav tab={tab} setTab={setTab}/>
      <InputBar value={input} onChange={setInput} onSend={send} onRebuild={()=>buildDays()} disabled={loading} rebuilding={rebuilding}/>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────
export default function App() {
  const [state,setState]=useState(null); // null=loading, {profile,subjects}=ready, false=onboard
  useEffect(()=>{
    Promise.all([sGet(SK.profile),sGet(SK.subjects)]).then(([p,s])=>{
      if(p) setState({profile:p,subjects:s||[]});
      else setState(false);
    });
  },[]);
  if(state===null) return <div style={{height:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#333",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Loading…</div></div>;
  if(state===false) return <Onboarding onComplete={(p,s)=>setState({profile:p,subjects:s})}/>;
  return <MainScreen profile={state.profile} subjects={state.subjects}/>;
}