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
function mondayStr() {
  const d=new Date(); const day=d.getDay();
  d.setDate(d.getDate()-(day===0?6:day-1));
  return d.toDateString();
}

const WEEK_MODE=["Understanding","Active Recall","Application","Error Correction"];
const WEEK_CUES=[
  "Explain why this works in your own words.",
  "Close notes and recall everything you know.",
  "Solve this without looking at solutions.",
  "Find your mistakes and fix your reasoning.",
];

// ── Storage ────────────────────────────────────────────
const SK={
  profile:"sched_v10_profile",
  days:"sched_v10_days",
  subjects:"sched_v10_subjects",
  standards:"sched_v10_standards",
  commitments:"sched_v10_commitments",
  signals:"sched_v10_signals",
};
async function sGet(k) { try { const r=await window.storage.get(k); return r?JSON.parse(r.value):null; } catch { return null; } }
async function sSet(k,v) { try { await window.storage.set(k,JSON.stringify(v)); } catch(e) { console.error(e); } }

// ── Onboarding ─────────────────────────────────────────
const ONBOARD_SYSTEM=`You are building a personal operating system for a university student. One question at a time:

1. Name
2. Current wake + sleep times — what they ACTUALLY do. If poor (sleep after 23:30, wake after 9, under 7h sleep): flag it, set a 20–30min better first target. Store as habits.
3. Peak energy window — exact times
4. Fixed events — class, work, appointments — day, time, duration
5. Bad habits (up to 3) — baseline + 10–30% better first target
6. Subjects — name + type (deep/light/practical)
7. Hobbies/outside interests — assess fit, suggest if none, assign frequency + duration
8. Weekly commitments — what MUST get done this week? Ask for specific quantities:
   e.g. "4 deep work sessions", "20 problems solved", "3 review sessions", "2 subjects covered"
   Quantify each one. These are their contract for the week.

After collecting all info, draft 4–6 Standards — principles that define how they work. Base them on everything they told you. Example standards:
- "When I work, I work fully — no half sessions, no distractions"
- "I maintain continuity — I don't restart from zero each day"
- "Deep work is protected — nothing replaces it once placed"
- "I recover deliberately — rest is scheduled, not accidental"

Show the drafted standards and ask: "These are your working principles. Anything to adjust?"
Once approved, output ONLY:
<PROFILE>
{"name":"","wakeTime":"HH:MM","sleepTime":"HH:MM","peakStart":"HH:MM","peakEnd":"HH:MM","fixedEvents":[{"time":"HH:MM","duration":60,"title":"","days":"daily|weekdays|mon,wed,fri"}],"habits":[{"habit":"sleep","baseline":"HH:MM","currentTarget":"HH:MM","unit":"time","streak":0},{"habit":"wake","baseline":"HH:MM","currentTarget":"HH:MM","unit":"time","streak":0}],"hobbies":[{"name":"","duration":30,"frequency":"daily","type":"active"}],"focusMins":25,"breakMins":5}
</PROFILE>
<STANDARDS>
[{"principle":"","description":""}]
</STANDARDS>
<COMMITMENTS>
[{"task":"","target":0,"unit":"","completed":0,"weekStart":""}]
</COMMITMENTS>
wakeTime/sleepTime = currentTarget not baseline. weekStart = current Monday date string.`;

// ── Schedule prompt ────────────────────────────────────
function buildPrompt(profile, subjects, standards, commitments, signals, extra="") {
  const wk=weekNum();
  const sleepH=profile.habits?.find(h=>h.habit==="sleep");
  const wakeH=profile.habits?.find(h=>h.habit==="wake");
  const ew=wakeH?.currentTarget||profile.wakeTime;
  const es=sleepH?.currentTarget||profile.sleepTime;
  const fixedStr=profile.fixedEvents?.map(e=>`  ${e.time} (${e.duration}min) "${e.title}" [${e.days}]`).join("\n")||"  none";
  const habitStr=profile.habits?.map(h=>`  • ${h.habit}: target ${h.currentTarget} ${h.unit} (streak ${h.streak}d)`).join("\n")||"  none";
  const deepS=subjects.filter(s=>s.type==="deep").map(s=>s.name).join(", ")||"none";
  const lightS=subjects.filter(s=>s.type==="light").map(s=>s.name).join(", ")||"none";
  const practS=subjects.filter(s=>s.type==="practical").map(s=>s.name).join(", ")||"none";
  const hobbyStr=profile.hobbies?.map(h=>`  • ${h.name} ${h.duration}min ${h.frequency} (${h.type})`).join("\n")||"  none";
  const stdStr=standards?.map(s=>`  • ${s.principle}: ${s.description}`).join("\n")||"  none";
  const commitStr=commitments?.map(c=>`  • ${c.task}: ${c.completed}/${c.target} ${c.unit} done`).join("\n")||"  none";
  const signalStr=signals ? `Energy: ${signals.energy}/5 | Clarity: ${signals.clarity}/5 | Notes: ${signals.notes||"none"}` : "No signal provided yet";
  const dayInfos=[0,1,2].map(i=>`Day${i+1}: ${getDayName(i)} (${isWeekend(i)?"WEEKEND":"WEEKDAY"})`).join(", ");

  const STUDY_TECHNIQUES={
    "Understanding":{
      techniques:["Pause every paragraph, summarise in own words","Draw concept maps linking ideas","Ask 'why does this work?' after every step","Explain as if teaching someone from scratch","Write down what you don't understand as a question"],
      label:(s,t)=>`${s}: understand ${t}`, cue:(t)=>`Explain why ${t} works in your own words. No notes.`
    },
    "Active Recall":{
      techniques:["Close all notes, write everything from memory","Flashcards — question front, answer back","Past papers before checking solutions","Blank page recall: topic at top, dump everything","Revisit yesterday's material first, then new content"],
      label:(s,t)=>`${s}: recall ${t}`, cue:(t)=>`Close everything. Write all you know about ${t} from memory.`
    },
    "Application":{
      techniques:["Solve without worked examples","Vary problem types","Work backwards from answer to method","Time yourself — simulate exam conditions","After solving: could you explain each step?"],
      label:(s,t)=>`${s}: solve ${t} problems`, cue:(t)=>`Solve ${t} problems without notes or solutions.`
    },
    "Error Correction":{
      techniques:["Go through past work, find every mistake","For each mistake: write WHY, not just the fix","Redo wrong problems from scratch","Build an error log — spot patterns","Fix reasoning, not just the answer"],
      label:(s,t)=>`${s}: fix ${t} errors`, cue:(t)=>`Find your ${t} mistakes. Write why each happened and redo from scratch.`
    }
  };
  const mode=WEEK_MODE[wk];
  const st=STUDY_TECHNIQUES[mode];
  const techList=st.techniques.map((t,i)=>`  ${i+1}. ${t}`).join("\n");

  return `You are the operating system for ${profile.name}. Build a precise 3-day schedule.

━━━ IDENTITY ━━━
${profile.name}'s Standards (non-negotiable, enforce always):
${stdStr}

━━━ PROFILE ━━━
Wake: ${ew} | Sleep: ${es}
Peak: ${profile.peakStart}–${profile.peakEnd}
Focus: ${profile.focusMins}min work / ${profile.breakMins}min break
Deep subjects: ${deepS}
Light subjects: ${lightS}
Practical: ${practS}
Hobbies:\n${hobbyStr}
Fixed events:\n${fixedStr}
Habits:\n${habitStr}

━━━ COMMITMENTS THIS WEEK ━━━
${commitStr}
These must be distributed across the 3 days. Heavier commitment days go where energy + clarity are highest.
If commitments are behind → increase intensity this week without cutting sleep.

━━━ TODAY'S SIGNALS (co-placement input) ━━━
${signalStr}
Use signals to decide Day 1 placement. High energy → front-load deep work. Low energy → ease in, build momentum.
Days 2–3 follow the master template rhythm unless signals change.

━━━ WEEK ${wk+1}: ${mode.toUpperCase()} ━━━
Techniques:
${techList}
Block label format: "${st.label("Subject","topic")}"
Cue format: "${st.cue("topic")}"
Rotate subjects + vary topics across days.

━━━ CONSISTENCY ━━━
Day 1 = master template. Days 2–3 mirror structure exactly. Only topic names change across days.
User must predict their day without checking the app.

━━━ PEAK WINDOW: ${profile.peakStart}–${profile.peakEnd} ━━━
WEEKDAYS: ONLY deep subjects using ${mode} techniques. ${profile.focusMins}+${profile.breakMins}min blocks back to back. NO meals, admin, curiosity, or light work.
WEEKENDS: ONE curiosity/exploratory block only. Fun, pressure-free, no cue. NO deep work.

━━━ OUTSIDE PEAK ━━━
Morning: light subjects, review, routine, meals
Evening: practicals, curiosity blocks ("Explore: ..."), hobbies, wind-down
Curiosity blocks on weekdays → evening low-energy slots only

━━━ WEEKEND ━━━
Same skeleton (wake/meals/sleep identical). ONE short deep block (60–90min) in morning before peak.
Peak = curiosity block. Rest = maintenance + recovery. Zero dead time.

━━━ HARD RULES ━━━
- Every minute ${ew}–${es} assigned. Zero gaps. Back-to-back.
- Never write "Study session" — use subject + specific topic always
- Wind-down 30–45min before ${es}. Nothing after.
- Fixed events immovable. 30min prep before exams.
- Drop tasks before cutting sleep or peak window.
- Day 1 starts NOW (${timeStr()}). Days 2–3 from ${ew}.
- 20–35 blocks per day.
${extra?`\nContext: ${extra}`:""}

━━━ OUTPUT ━━━
Return ONLY:
{"day0":[{"time":"HH:MM","title":"...","cue":"study only","intensity":"high|medium|low"}],"day1":[...],"day2":[...]}
No markdown. 24h time. ${dayInfos}.`;
}

// ── Coach system ───────────────────────────────────────
function coachSys(profile, subjects, standards, commitments) {
  const wk=weekNum();
  const stdStr=standards?.map(s=>`"${s.principle}"`).join(", ")||"none";
  const commitStr=commitments?.map(c=>`${c.task}: ${c.completed}/${c.target} ${c.unit}`).join(", ")||"none";
  return `You are the operating system coach for ${profile.name}.

Standards to enforce (call out violations immediately):
${stdStr}

Commitments this week:
${commitStr}

Week ${wk+1}: ${WEEK_MODE[wk]}. Focus: ${profile.focusMins}/${profile.breakMins}min.
Subjects: ${subjects.map(s=>s.name).join(", ")||"none"}
Habits: ${profile.habits?.map(h=>`${h.habit}(target:${h.currentTarget}${h.unit},streak:${h.streak}d)`).join("; ")||"none"}

RULES:
- Max 3 sentences. Direct. No comfort.
- Standards violations: call them out by name. "That breaks your continuity standard."
- Check commitment progress. If behind: say so and propose adjustment.
- For placement changes: PROPOSE don't impose. "Given your signal, I'd move deep work to 14:00. Confirm?"
- HABIT_SUCCESS:<n> / HABIT_FAIL:<n>
- FOCUS_UP / FOCUS_DOWN
- COMMITMENT_UPDATE:{"index":<n>,"completed":<n>}
- SCHEDULE_UPDATE:{"day":<0-2>,"index":<n>,"time":"HH:MM","title":"...","cue":"..."}
- REBUILD_NEEDED only for major life changes
- STANDARDS_UPDATE:[{"principle":"...","description":"..."}] if user requests standard change`;
}

// ── Components ─────────────────────────────────────────
function Header({ dayLabel, mode, onCheckin }) {
  return (
    <div style={{padding:"12px 18px 8px",borderBottom:"1px solid #141414",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{color:"#444",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>{dayLabel}</div>
        <div style={{color:"#222",fontSize:9,letterSpacing:1,textTransform:"uppercase",marginTop:2}}>Wk {weekNum()+1} · {mode}</div>
      </div>
      <button onClick={onCheckin} style={{background:"transparent",border:"1px solid #1e1e1e",color:"#444",borderRadius:5,padding:"5px 10px",fontSize:10,cursor:"pointer",letterSpacing:1}}>CHECK IN</button>
    </div>
  );
}

function DayTabs({ active, setActive }) {
  return (
    <div style={{display:"flex",borderBottom:"1px solid #141414"}}>
      {["Today","Tomorrow","Day 3"].map((l,i)=>(
        <button key={i} onClick={()=>setActive(i)} style={{flex:1,padding:"7px 0",background:"none",border:"none",color:active===i?"#fff":"#333",fontSize:10,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",borderBottom:active===i?"1px solid #fff":"1px solid transparent",marginBottom:-1}}>
          {l}{isWeekend(i)&&<span style={{color:"#2a2a1a",fontSize:8,marginLeft:3}}>WKD</span>}
        </button>
      ))}
    </div>
  );
}

function ScheduleItem({ block, state }) {
  const isCur=state==="current", isPast=state==="past";
  const intColor={"high":"#1a1a00","medium":"#0a0a0a","low":"transparent"}[block.intensity||"medium"];
  return (
    <div style={{padding:isCur?"10px 14px":"7px 14px",borderRadius:6,marginBottom:1,background:isCur?"#161616":intColor,borderLeft:isCur?"2px solid #fff":block.intensity==="high"?"2px solid #2a2a00":"2px solid transparent",opacity:isPast?0.2:1}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <span style={{color:isCur?"#aaa":isPast?"#2a2a2a":"#444",fontSize:11,minWidth:42,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{block.time}</span>
        <span style={{color:isCur?"#fff":isPast?"#333":"#bbb",fontSize:isCur?14:13,fontWeight:isCur?600:400,flex:1,lineHeight:1.3}}>{block.title}</span>
        {isCur&&<span style={{color:"#000",background:"#fff",fontSize:8,fontWeight:700,letterSpacing:1.5,padding:"2px 5px",borderRadius:3}}>NOW</span>}
        {!isCur&&!isPast&&block.intensity==="high"&&<span style={{color:"#3a3a00",fontSize:8,letterSpacing:1}}>PEAK</span>}
      </div>
      {block.cue&&!isPast&&<div style={{marginTop:3,marginLeft:54,color:isCur?"#555":"#2a2a2a",fontSize:11,fontStyle:"italic",lineHeight:1.4}}>{block.cue}</div>}
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
    <div ref={ref} style={{flex:1,overflowY:"auto",padding:"6px 4px"}}>
      {!blocks.length&&<div style={{color:"#333",fontSize:13,padding:"32px 0",textAlign:"center"}}>Building your system…</div>}
      {blocks.map((b,i)=>(
        <div key={i} data-idx={i}>
          <ScheduleItem block={b} state={activeDay===0?(i===ci?"current":i<ci?"past":"future"):"future"}/>
        </div>
      ))}
    </div>
  );
}

// ── Check-in modal ─────────────────────────────────────
function CheckInModal({ onSubmit, onClose }) {
  const [energy,setEnergy]=useState(3);
  const [clarity,setClarity]=useState(3);
  const [notes,setNotes]=useState("");
  const labels=["","Very low","Low","Okay","Good","Sharp"];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:10,padding:"24px",width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:16}}>
        <div style={{color:"#fff",fontSize:15,fontWeight:600}}>Morning Check-in</div>
        {[["Energy",energy,setEnergy],["Clarity",clarity,setClarity]].map(([label,val,set])=>(
          <div key={label}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <span style={{color:"#555",fontSize:11,letterSpacing:1,textTransform:"uppercase"}}>{label}</span>
              <span style={{color:"#fff",fontSize:11}}>{labels[val]}</span>
            </div>
            <div style={{display:"flex",gap:6}}>
              {[1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>set(n)} style={{flex:1,padding:"8px 0",background:val>=n?"#fff":"#1a1a1a",border:"1px solid #222",borderRadius:4,cursor:"pointer",color:val>=n?"#000":"#444",fontSize:12,fontWeight:600}}>{n}</button>
              ))}
            </div>
          </div>
        ))}
        <div>
          <div style={{color:"#555",fontSize:11,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Anything to flag?</div>
          <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. tired, big exam tomorrow, slept late..."
            style={{width:"100%",background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:5,color:"#ccc",padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onSubmit({energy,clarity,notes})} style={{flex:1,background:"#fff",color:"#000",border:"none",borderRadius:6,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Confirm & Place</button>
          <button onClick={onClose} style={{flex:1,background:"transparent",border:"1px solid #222",color:"#555",borderRadius:6,padding:"10px",fontSize:13,cursor:"pointer"}}>Skip</button>
        </div>
      </div>
    </div>
  );
}

// ── Standards tab ──────────────────────────────────────
function StandardsTab({ standards }) {
  return (
    <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
      <div style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Your Standards</div>
      <div style={{color:"#333",fontSize:11,marginBottom:16,lineHeight:1.6}}>These define how you work. Adjust via chat only.</div>
      {!standards?.length&&<div style={{color:"#333",fontSize:13}}>No standards set yet.</div>}
      {standards?.map((s,i)=>(
        <div key={i} style={{padding:"12px 0",borderBottom:"1px solid #141414"}}>
          <div style={{color:"#ddd",fontSize:13,fontWeight:500,marginBottom:4}}>"{s.principle}"</div>
          <div style={{color:"#444",fontSize:12,lineHeight:1.6}}>{s.description}</div>
        </div>
      ))}
    </div>
  );
}

// ── Commitments tab ────────────────────────────────────
function CommitmentsTab({ commitments, onUpdate }) {
  return (
    <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>This Week</div>
        <div style={{color:"#333",fontSize:10}}>Resets Monday</div>
      </div>
      <div style={{color:"#333",fontSize:11,marginBottom:14,lineHeight:1.6}}>Your weekly contract. Track progress via chat.</div>
      {!commitments?.length&&<div style={{color:"#333",fontSize:13}}>No commitments set.</div>}
      {commitments?.map((c,i)=>{
        const pct=Math.min(100,Math.round((c.completed/c.target)*100));
        const done=c.completed>=c.target;
        return (
          <div key={i} style={{padding:"12px 0",borderBottom:"1px solid #141414"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{color:done?"#4a4a00":"#ccc",fontSize:13,fontWeight:done?600:400}}>{c.task}</span>
              <span style={{color:done?"#888":"#444",fontSize:11}}>{c.completed}/{c.target} {c.unit}</span>
            </div>
            <div style={{height:2,background:"#1a1a1a",borderRadius:1}}>
              <div style={{height:2,width:`${pct}%`,background:done?"#fff":"#2a2a00",borderRadius:1,transition:"width 0.3s"}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Subjects + Hobbies tab ─────────────────────────────
const STYPES=["deep","light","practical"];
const HTYPES=["active","creative","social","cognitive"];
const HFREQS=["daily","2x week","weekend"];

function SubjectsTab({ subjects, onUpdate, profile, onUpdateProfile }) {
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({name:"",type:"deep"});
  const [editH,setEditH]=useState(null);
  const [hForm,setHForm]=useState({name:"",duration:"30",frequency:"daily",type:"active"});
  const [sem,setSem]=useState("");
  const hobbies=profile.hobbies||[];
  const saveS=()=>{ if(!form.name.trim()) return; let s=[...subjects]; editing==="new"?s.push({...form}):s[editing]={...form}; onUpdate(s); setEditing(null); };
  const saveH=()=>{ if(!hForm.name.trim()) return; let h=[...hobbies]; const e={...hForm,duration:parseInt(hForm.duration)||30}; editH==="new"?h.push(e):h[editH]=e; onUpdateProfile({...profile,hobbies:h}); setEditH(null); };
  return (
    <div style={{flex:1,overflowY:"auto",padding:"10px 18px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <span style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Subjects</span>
        <button onClick={()=>{setForm({name:"",type:"deep"});setEditing("new");}} style={{background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>+ Add</button>
      </div>
      <input value={sem} onChange={e=>setSem(e.target.value)} placeholder="Semester (e.g. Sem 1 2025)"
        style={{width:"100%",background:"#0d0d0d",border:"1px solid #1a1a1a",borderRadius:5,color:"#555",padding:"6px 10px",fontSize:11,outline:"none",marginBottom:10,boxSizing:"border-box"}}/>
      {!subjects.length&&<div style={{color:"#333",fontSize:13,marginBottom:8}}>No subjects.</div>}
      {subjects.map((s,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #141414"}}>
          <span style={{color:"#ccc",fontSize:13,flex:1}}>{s.name}</span>
          <span style={{color:"#333",fontSize:9,letterSpacing:1,textTransform:"uppercase",padding:"2px 5px",border:"1px solid #1e1e1e",borderRadius:3}}>{s.type}</span>
          <button onClick={()=>{setForm({name:s.name,type:s.type});setEditing(i);}} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:11,padding:"2px 5px"}}>Edit</button>
          <button onClick={()=>onUpdate(subjects.filter((_,x)=>x!==i))} style={{background:"none",border:"none",color:"#4a2020",cursor:"pointer",fontSize:11,padding:"2px 5px"}}>Del</button>
        </div>
      ))}
      {editing!==null&&(
        <div style={{marginTop:10,background:"#111",border:"1px solid #1e1e1e",borderRadius:8,padding:"12px",display:"flex",flexDirection:"column",gap:8}}>
          <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Subject name" style={{background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 10px",fontSize:13,outline:"none"}}/>
          <div style={{display:"flex",gap:5}}>
            {STYPES.map(t=><button key={t} onClick={()=>setForm(f=>({...f,type:t}))} style={{flex:1,background:form.type===t?"#fff":"transparent",color:form.type===t?"#000":"#555",border:"1px solid #222",borderRadius:5,padding:"5px 0",fontSize:10,cursor:"pointer",textTransform:"uppercase"}}>{t}</button>)}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={saveS} style={{flex:1,background:"#fff",color:"#000",border:"none",borderRadius:5,padding:"7px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Save</button>
            <button onClick={()=>setEditing(null)} style={{flex:1,background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"7px",fontSize:13,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}
      {subjects.length>0&&<button onClick={()=>{if(window.confirm("Clear all subjects?")) onUpdate([]);}} style={{marginTop:10,background:"transparent",border:"1px solid #2a1a1a",color:"#4a2020",borderRadius:5,padding:"6px 12px",fontSize:11,cursor:"pointer",width:"100%"}}>New Semester — Clear All</button>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"20px 0 8px"}}>
        <span style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Hobbies</span>
        <button onClick={()=>{setHForm({name:"",duration:"30",frequency:"daily",type:"active"});setEditH("new");}} style={{background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>+ Add</button>
      </div>
      {!hobbies.length&&<div style={{color:"#333",fontSize:13}}>No hobbies. Ask your coach for suggestions.</div>}
      {hobbies.map((h,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #141414"}}>
          <span style={{color:"#ccc",fontSize:13,flex:1}}>{h.name}</span>
          <span style={{color:"#333",fontSize:11}}>{h.duration}m</span>
          <span style={{color:"#333",fontSize:9,letterSpacing:1,textTransform:"uppercase",padding:"2px 5px",border:"1px solid #1e1e1e",borderRadius:3}}>{h.frequency}</span>
          <button onClick={()=>{setHForm({...h,duration:String(h.duration)});setEditH(i);}} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:11,padding:"2px 5px"}}>Edit</button>
          <button onClick={()=>onUpdateProfile({...profile,hobbies:hobbies.filter((_,x)=>x!==i)})} style={{background:"none",border:"none",color:"#4a2020",cursor:"pointer",fontSize:11,padding:"2px 5px"}}>Del</button>
        </div>
      ))}
      {editH!==null&&(
        <div style={{marginTop:10,background:"#111",border:"1px solid #1e1e1e",borderRadius:8,padding:"12px",display:"flex",flexDirection:"column",gap:8}}>
          <input value={hForm.name} onChange={e=>setHForm(f=>({...f,name:e.target.value}))} placeholder="Hobby name" style={{background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 10px",fontSize:13,outline:"none"}}/>
          <div style={{display:"flex",gap:8}}>
            <input value={hForm.duration} onChange={e=>setHForm(f=>({...f,duration:e.target.value}))} placeholder="mins" style={{width:55,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#fff",padding:"7px 8px",fontSize:13,outline:"none"}}/>
            <select value={hForm.frequency} onChange={e=>setHForm(f=>({...f,frequency:e.target.value}))} style={{flex:1,background:"#0d0d0d",border:"1px solid #222",borderRadius:5,color:"#ccc",padding:"7px 8px",fontSize:12,outline:"none"}}>
              {HFREQS.map(f=><option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:5}}>
            {HTYPES.map(t=><button key={t} onClick={()=>setHForm(f=>({...f,type:t}))} style={{flex:1,background:hForm.type===t?"#fff":"transparent",color:hForm.type===t?"#000":"#555",border:"1px solid #222",borderRadius:5,padding:"5px 0",fontSize:9,cursor:"pointer",textTransform:"uppercase"}}>{t}</button>)}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={saveH} style={{flex:1,background:"#fff",color:"#000",border:"none",borderRadius:5,padding:"7px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Save</button>
            <button onClick={()=>setEditH(null)} style={{flex:1,background:"transparent",border:"1px solid #222",color:"#666",borderRadius:5,padding:"7px",fontSize:13,cursor:"pointer"}}>Cancel</button>
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
      {!messages.length&&<div style={{color:"#2a2a2a",fontSize:12,margin:"auto",textAlign:"center"}}>Report in. Coach is watching.</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&<MessageBubble msg={{role:"ai",text:"…"}}/>}
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const tabs=["Schedule","Standards","Commitments","Subjects"];
  return (
    <div style={{display:"flex",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
      {tabs.map(t=>(
        <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"8px 0",background:"none",border:"none",color:tab===t?"#fff":"#333",fontSize:9,letterSpacing:0.8,textTransform:"uppercase",cursor:"pointer",borderTop:tab===t?"1px solid #fff":"1px solid transparent",marginTop:-1}}>
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
        placeholder="Report in…" value={value} onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&onSend()} disabled={disabled}/>
      <button onClick={onSend} disabled={disabled} style={{background:"#fff",color:"#000",border:"none",borderRadius:7,width:38,fontSize:16,fontWeight:700,cursor:"pointer",opacity:disabled?0.4:1}}>↑</button>
      <button onClick={onRebuild} disabled={rebuilding} style={{background:"transparent",border:"1px solid #222",color:"#555",borderRadius:7,padding:"0 10px",fontSize:11,cursor:"pointer",opacity:rebuilding?0.4:1,whiteSpace:"nowrap"}}>{rebuilding?"…":"Fix"}</button>
    </div>
  );
}

// ── Onboarding ─────────────────────────────────────────
function Onboarding({ onComplete }) {
  const [messages,setMessages]=useState([{role:"ai",text:"Let's build your operating system. This isn't just a schedule — it's how you work. I'll ask you a few things and then draft the rules we'll hold you to. What's your name?"}]);
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
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:800,system:ONBOARD_SYSTEM,messages:history.current})});
      const d=await r.json();
      const raw=d.content?.map(c=>c.text||"").join("")||"";
      history.current=[...history.current,{role:"assistant",content:raw}];
      const pMatch=raw.match(/<PROFILE>([\s\S]*?)<\/PROFILE>/);
      const sMatch=raw.match(/<STANDARDS>([\s\S]*?)<\/STANDARDS>/);
      const cMatch=raw.match(/<COMMITMENTS>([\s\S]*?)<\/COMMITMENTS>/);
      if(pMatch&&sMatch&&cMatch) {
        const p=JSON.parse(pMatch[1].trim());
        const s=JSON.parse(sMatch[1].trim());
        const c=JSON.parse(cMatch[1].trim());
        await Promise.all([sSet(SK.profile,p),sSet(SK.standards,s),sSet(SK.commitments,c)]);
        onComplete(p,s,c,[]); return;
      }
      setMessages(m=>[...m,{role:"ai",text:raw}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Connection error. Try again."}]); }
    setLoading(false);
  }

  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      <div style={{padding:"16px 18px 10px",borderBottom:"1px solid #141414"}}>
        <div style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>System Setup</div>
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
function MainScreen({ profile:initP, standards:initSt, commitments:initC, subjects:initS }) {
  const [profile,setProfile]=useState(initP);
  const [standards,setStandards]=useState(initSt||[]);
  const [commitments,setCommitments]=useState(initC||[]);
  const [subjects,setSubjects]=useState(initS||[]);
  const [days,setDays]=useState([[],[],[]]);
  const [signals,setSignals]=useState(null);
  const [activeDay,setActiveDay]=useState(0);
  const [tab,setTab]=useState("Schedule");
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [rebuilding,setRebuilding]=useState(false);
  const [showCheckin,setShowCheckin]=useState(false);
  const [tick,setTick]=useState(0);
  const feedRef=useRef(null);

  useEffect(()=>{ const t=setInterval(()=>setTick(x=>x+1),60000); return()=>clearInterval(t); },[]);
  useEffect(()=>{ if(feedRef.current) feedRef.current.scrollTop=feedRef.current.scrollHeight; },[messages,loading]);
  useEffect(()=>{ loadOrBuild(); },[]);

  // Reset commitments on Monday
  useEffect(()=>{
    if(!commitments.length) return;
    const mon=mondayStr();
    if(commitments[0]?.weekStart&&commitments[0].weekStart!==mon) {
      const reset=commitments.map(c=>({...c,completed:0,weekStart:mon}));
      setCommitments(reset); sSet(SK.commitments,reset);
    }
  },[]);

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
      setMessages([{role:"ai",text:`System online. ${initP.name}, check in when ready.`}]);
    } else {
      setMessages([{role:"ai",text:"New day. Check in first so I can place your schedule correctly."}]);
      setShowCheckin(true);
    }
  }

  async function buildDays(sig=signals, extra="") {
    setRebuilding(true);
    setMessages(m=>[...m,{role:"ai",text:"Placing your schedule…"}]);
    try {
      const raw=await claudeCall(buildPrompt(profile,subjects,standards,commitments,sig,extra));
      const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());
      const newDays=[parsed.day0||[],parsed.day1||[],parsed.day2||[]];
      setDays(newDays);
      await sSet(SK.days,{date:todayStr(),days:newDays});
      const heavy=newDays[0].filter(b=>b.intensity==="high").length;
      setMessages(m=>[...m.filter(x=>x.text!=="Placing your schedule…"),
        {role:"ai",text:`Placed. ${heavy} high-intensity blocks today. Peak ${profile.peakStart}–${profile.peakEnd} locked.`}]);
    } catch(e) {
      console.error(e);
      setMessages(m=>[...m,{role:"ai",text:"Build failed. Check API."}]);
    }
    setRebuilding(false);
  }

  async function handleCheckin(sig) {
    setSignals(sig); setShowCheckin(false);
    await sSet(SK.signals,sig);
    await buildDays(sig);
  }

  async function saveProfile(p) { setProfile(p); await sSet(SK.profile,p); }
  async function saveSubjects(s) { setSubjects(s); await sSet(SK.subjects,s); }
  async function saveStandards(s) { setStandards(s); await sSet(SK.standards,s); }
  async function saveCommitments(c) { setCommitments(c); await sSet(SK.commitments,c); }

  async function send() {
    if(!input.trim()||loading) return;
    const msg=input.trim(); setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]); setLoading(true);
    const ctx=days[activeDay].map((b,i)=>`[${i}]${b.time} ${b.title}${activeDay===0&&i===ci?" ←NOW":""}`).join(" | ");
    const commitCtx=commitments.map(c=>`${c.task}:${c.completed}/${c.target}`).join(", ");
    try {
      const r=await fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({system:coachSys(profile,subjects,standards,commitments),
          message:`Day ${activeDay} schedule: ${ctx}\nCommitments: ${commitCtx}\nUser: ${msg}`})});
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

      const cu=raw.match(/COMMITMENT_UPDATE:(\{[^}]+\})/);
      if(cu) {
        try {
          const o=JSON.parse(cu[1]);
          const nc=commitments.map((c,i)=>i===o.index?{...c,completed:o.completed}:c);
          await saveCommitments(nc);
        } catch {}
      }
      const su=raw.match(/STANDARDS_UPDATE:(\[[\s\S]*?\])/);
      if(su) { try { await saveStandards(JSON.parse(su[1])); } catch {} }

      if(raw.includes("REBUILD_NEEDED")) {
        setMessages(m=>[...m,{role:"ai",text:"Rebuilding placement…"}]);
        setLoading(false); await buildDays(signals,msg); return;
      }
      const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
      if(upd) {
        try {
          const o=JSON.parse(upd[1]); const di=o.day??activeDay;
          const nd=days.map((d,i)=>i===di?d.map((b,j)=>j===o.index?{...b,...o}:b):d);
          setDays(nd); await sSet(SK.days,{date:todayStr(),days:nd});
        } catch {}
      }
      const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/COMMITMENT_UPDATE:[^\n]*/g,"").replace(/STANDARDS_UPDATE:[\s\S]*?\]/g,"").replace(/HABIT_SUCCESS:\S+|HABIT_FAIL:\S+|FOCUS_UP|FOCUS_DOWN|REBUILD_NEEDED/g,"").trim();
      if(clean) setMessages(m=>[...m,{role:"ai",text:clean}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Groq unreachable."}]); }
    setLoading(false);
  }

  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      {showCheckin&&<CheckInModal onSubmit={handleCheckin} onClose={()=>{setShowCheckin(false);buildDays(null);}}/>}
      <Header dayLabel={getDayLabel(activeDay)} mode={WEEK_MODE[weekNum()]} onCheckin={()=>setShowCheckin(true)}/>
      {tab==="Schedule"&&<DayTabs active={activeDay} setActive={setActiveDay}/>}
      {tab==="Schedule"&&<ScheduleList blocks={days[activeDay]} activeDay={activeDay}/>}
      {tab==="Standards"&&<StandardsTab standards={standards}/>}
      {tab==="Commitments"&&<CommitmentsTab commitments={commitments} onUpdate={saveCommitments}/>}
      {tab==="Subjects"&&<SubjectsTab subjects={subjects} onUpdate={saveSubjects} profile={profile} onUpdateProfile={saveProfile}/>}
      <ChatFeed messages={messages} loading={loading} feedRef={feedRef}/>
      <BottomNav tab={tab} setTab={setTab}/>
      <InputBar value={input} onChange={setInput} onSend={send} onRebuild={()=>buildDays(signals)} disabled={loading} rebuilding={rebuilding}/>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────
export default function App() {
  const [state,setState]=useState(null);
  useEffect(()=>{
    Promise.all([sGet(SK.profile),sGet(SK.standards),sGet(SK.commitments),sGet(SK.subjects)]).then(([p,st,c,s])=>{
      if(p) setState({profile:p,standards:st||[],commitments:c||[],subjects:s||[]});
      else setState(false);
    });
  },[]);
  if(state===null) return <div style={{height:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#333",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Loading system…</div></div>;
  if(state===false) return <Onboarding onComplete={(p,st,c,s)=>setState({profile:p,standards:st,commitments:c,subjects:s})}/>;
  return <MainScreen profile={state.profile} standards={state.standards} commitments={state.commitments} subjects={state.subjects}/>;
}