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
  for(let i=0;i<blocks.length;i++){if(toMins(blocks[i].time)<=now)idx=i; else break;}
  return idx;
}

const SB_URL="https://qlectmatqxtqqpwwbrhn.supabase.co";
const SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsZWN0bWF0cXh0cXFwd3dicmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTUzNjgsImV4cCI6MjA5MDM5MTM2OH0.x98eVDFBeBkVCvQhoJg01sGy30BFB3B7Jcn8cJrU4Qg";
const USER_ID="default";
const SK={profile:"ms3_profile",schedule:"ms3_schedule",log:"ms3_log"};
const mem={};

async function sGet(key){
  try{
    const r=await fetch(SB_URL+"/rest/v1/ai_memory?user_id=eq."+USER_ID+"&key=eq."+key+"&select=value",{headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY}});
    const d=await r.json();
    if(d&&d.length)return JSON.parse(d[0].value);
  }catch(e){}
  return mem[key]||null;
}
async function sSet(key,val){
  mem[key]=val;
  try{
    await fetch(SB_URL+"/rest/v1/ai_memory",{method:"POST",headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify({user_id:USER_ID,key,value:JSON.stringify(val),updated_at:new Date().toISOString()})});
  }catch(e){console.error(e);}
}

// ── Colours ────────────────────────────────────────────
const C={
  bg:"#0f0e0c", surface:"#161410", border:"#2a2520", borderLight:"#1e1c18",
  accent:"#c8922a", accentDim:"#7a5518", accentFaint:"#2a1f0a",
  text:"#e8e0d0", textMid:"#8a7e6a", textDim:"#4a4238", textFaint:"#2a2520",
  study:"#1a1800", studyBorder:"#3a3200",
  routine:"#0e1410", routineBorder:"#1a2a1a",
  meal:"#0e0e1a", mealBorder:"#1a1a3a",
  movement:"#0a1410", movementBorder:"#153020",
  free:"#140e18", freeBorder:"#2a1a30",
  sleep:"#100e18", sleepBorder:"#20183a",
  buffer:"#141210", bufferBorder:"#2a2418",
};

// ── All prompt strings defined first ──────────────────
const MENTOR_RULES=
"You are a strict mentor. You run this person's day, assign tasks, and hold them accountable.\n\n"+
"CONTROLLABLE = PUNISHMENT. UNCONTROLLABLE = LEGITIMATE.\n"+
"Controllable: poor time management, avoidance, bad choices, social calls they could decline, tiredness from bad sleep or phone use.\n"+
"Uncontrollable: genuine emergencies, family crises, medical issues, fatigue from a genuinely hard day of classes or work.\n"+
"Test: could they have prevented this with better planning or discipline? Yes = punish. No = legitimate.\n\n"+
"REWARDS: 30min free time per completed study block. Streak milestones at 3/7/14/30 days. Lighter load after 3 perfect days.\n"+
"PUNISHMENTS: Missed task carried over before any free time. 30min free removed per controllable miss. Extra task one level harder. Streak reset to zero.\n\n"+
"LIFE HABITS (build progressively):\n"+
"Morning: water, brush teeth, wash face, shower, get dressed, breakfast — in order, phone last.\n"+
"Meals: all three daily, correct windows, no phone. Movement: 15min walk minimum. Sleep: consistent time, wind-down 30min before, phone away.\n\n"+
"BAD HABITS (reduce progressively, never eliminate overnight):\n"+
"Phone in protected windows. Procrastination. Passive study. Skipping meals. Irregular sleep. Skipping hygiene.\n"+
"Never stack new habits until current ones are stable 3+ days.";

const STUDY_TECHNIQUES=
"STUDY TECHNIQUES — assign by priority tier:\n\n"+
"TIER 1 (daily): Active Recall, Spaced Repetition, Practice Tests, Blurting.\n"+
"TIER 2 (3-4x/week): Feynman Technique, Interleaved Practice, Active Note-Taking.\n"+
"TIER 3 (new material/review): SQ3R, Mind Mapping, Concept Mapping.\n\n"+
"Always specify technique with task. Never assign passive methods.\n"+
"Maths default: practice problems + active recall + spaced repetition every session.\n"+
"Assign as: 'Solve 5 [topic] problems without notes (Practice Test), then write everything you know about [topic] from memory (Active Recall).'";

const EXAM_RITUAL=
"EXAM RITUAL — when exam within 7 days. Routines stay identical. Only study blocks change.\n"+
"Day 7: Stop new material. Build weak-area hit list. Active recall + blurting.\n"+
"Day 6-5: Hit list only. Feynman every weak concept.\n"+
"Day 4-3: Full timed past papers. Build error log.\n"+
"Day 2: Error log only. Redo every mistake. Fix reasoning.\n"+
"Day 1: 30min light review max. Sleep, food, walk. 10min next-day prep.\n"+
"Exam day: Normal morning routine. Good breakfast. No cramming. Arrive early.";

const ONBOARDING_SYSTEM=
"You are a strict mentor interviewing a new user to build their optimised daily schedule.\n\n"+
"Ask questions conversationally, 1-2 at a time maximum. Never dump all questions at once.\n"+
"Listen to each answer before asking the next. Adapt based on what they say.\n\n"+
"COVER THESE AREAS IN ORDER:\n"+
"1. Name\n"+
"2. Natural wake time (no alarm) and usual sleep time\n"+
"3. Peak mental sharpness window and lowest energy point\n"+
"4. How long they can focus before needing a real break\n"+
"5. Fixed commitments: classes, work shifts, recurring responsibilities, travel time\n"+
"6. Predictability: how consistent are their days? How often do random events hijack them? Do surprises come the night before or same-day? Are certain days reliably chaotic?\n"+
"7. Subjects currently studying and which is weakest\n"+
"8. Any upcoming exams or deadlines\n"+
"9. Biggest time waster and what usually stops them following a schedule\n"+
"10. Current morning/night routine (if any)\n"+
"11. Exercise habits and usual meal times\n"+
"12. Hobbies or anything else to factor in\n\n"+
"PREDICTABILITY RULES:\n"+
"High predictability → tight schedule, minimal buffer (10min)\n"+
"Medium predictability → 15-20min buffers between major blocks\n"+
"Low predictability → loose structure, only non-negotiables locked, 30min buffers\n"+
"Chaotic specific days → those days get lighter loads\n\n"+
"When you have ALL info, say: 'I have everything I need. Here is what I am going to build for you:' and give a 3-4 sentence summary. Ask 'Does this sound right or anything to adjust?' Wait for confirmation, then output:\n"+
"<PROFILE>\n"+
"{\"name\":\"\",\"wakeTime\":\"\",\"sleepTime\":\"\",\"peakEnergy\":\"\",\"lowEnergy\":\"\",\"focusDuration\":25,\"subjects\":[],\"weakestSubject\":\"\",\"fixedEvents\":[],\"predictability\":\"medium\",\"chaoticDays\":[],\"bufferMins\":15,\"biggestBlocker\":\"\",\"timeWaster\":\"\",\"exercises\":false,\"hobbies\":[],\"mealTimes\":{\"breakfast\":\"\",\"lunch\":\"\",\"dinner\":\"\"},\"notes\":\"\",\"streak\":0,\"examMode\":null}\n"+
"</PROFILE>";

function detectPatterns(logs){
  if(!logs||!logs.length)return [];
  const p=[]; const l3=logs.slice(-3);
  if(l3.length>=3&&l3.every(l=>l.punishments>0)) p.push("Punishments 3+ days — reassess load or scheduling.");
  if(l3.length>=3&&l3.every(l=>l.completed<l.total)) p.push("Incomplete days 3+ — avoidance or overloading.");
  if(logs.filter(l=>l.notes&&l.notes.toLowerCase().includes("phone")).length>=3) p.push("Phone violations recurring — enforce strictly.");
  if(l3.length>=3&&l3.every(l=>l.streak===0)) p.push("Streak not building — consistency is the only target.");
  return p;
}

function buildMorningPrompt(profile,log){
  const name=profile.name||"there";
  const subjects=(profile.subjects&&profile.subjects.length)?profile.subjects.join(", "):"not yet specified";
  const streak=profile.streak||0;
  const peak=profile.peakEnergy||"afternoon";
  const low=profile.lowEnergy||"evening";
  const focus=profile.focusDuration||25;
  const pred=profile.predictability||"medium";
  const buf=profile.bufferMins||15;
  const chaotic=(profile.chaoticDays&&profile.chaoticDays.length)?profile.chaoticDays.join(", "):"none";
  const fixed=(profile.fixedEvents&&profile.fixedEvents.length)?profile.fixedEvents.map(e=>(e.day||"")+" "+(e.time||"")+" "+(e.title||"")).join(", "):"none";
  const meals=profile.mealTimes?("breakfast "+profile.mealTimes.breakfast+", lunch "+profile.mealTimes.lunch+", dinner "+profile.mealTimes.dinner):"standard windows";
  const examMode=profile.examMode||null;
  const recentLog=(log||[]).slice(-5);
  const logStr=recentLog.length?recentLog.map(l=>"  "+l.date+": "+l.completed+"/"+l.total+" tasks, punishments="+l.punishments+", streak="+l.streak).join("\n"):"  No history yet.";
  const bufNote=pred==="low"?"LOW PREDICTABILITY: Lock only non-negotiables. Add "+buf+"min buffers. Keep free time flexible.":pred==="high"?"HIGH PREDICTABILITY: Tight schedule. Minimal buffers.":"MEDIUM PREDICTABILITY: "+buf+"min buffers between major blocks.";
  const examNote=examMode?"EXAM MODE: "+examMode.exam+" in "+examMode.daysOut+" days. Ritual day "+examMode.ritualDay+". Apply exam ritual to study blocks.":"";

  return "Strict mentor for "+name+". Time: "+timeStr()+". Date: "+dateStr()+".\n\n"+
    MENTOR_RULES+"\n\n"+STUDY_TECHNIQUES+"\n\n"+EXAM_RITUAL+"\n\n"+
    "PROFILE: "+name+" | Subjects: "+subjects+" | Streak: "+streak+"d\n"+
    "Peak energy: "+peak+" | Low: "+low+" | Focus: "+focus+"min\n"+
    "Predictability: "+pred+" | Buffer: "+buf+"min | "+bufNote+"\n"+
    (chaotic!=="none"?"Chaotic days: "+chaotic+"\n":"")+
    "Fixed events: "+fixed+"\nMeals: "+meals+"\n"+
    "Blocker: "+(profile.biggestBlocker||"unknown")+" | Time waster: "+(profile.timeWaster||"unknown")+"\n"+
    (examNote?examNote+"\n":"")+
    "HISTORY:\n"+logStr+"\n\n"+
    "BUILD FULL SCHEDULE (every hour wake to sleep):\n"+
    "- Morning routine first: water, brush, shower, dress, breakfast, phone last\n"+
    "- Peak window ("+peak+"): hardest study blocks, Tier 1 techniques\n"+
    "- Low window ("+low+"): light tasks, meals, movement\n"+
    "- Study: specific subject + topic + quantity + technique. Hard first. Streak gates: 0-2=light, 3-6=moderate, 7+=full\n"+
    "- Focus blocks: "+focus+"min work then break\n"+
    "- Add "+buf+"min buffer blocks after major blocks (pred: "+pred+")\n"+
    "- Night routine: tidy, reflect, wind-down, phone away, sleep\n"+
    "Build from NOW ("+timeStr()+"). Parse user message fully. Ask ONE question only if critical info missing.\n"+
    "Output readable text first (time — task — instruction), then:\n"+
    "<SCHEDULE>[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"Task\",\"type\":\"routine|study|meal|movement|free|fixed|sleep|buffer\",\"instruction\":\"technique + task\"}]</SCHEDULE>\n"+
    "<PROFILE_UPDATE>{\"subjects\":[],\"lastWakeTime\":\"\",\"examMode\":null}</PROFILE_UPDATE>";
}

function buildAuditPrompt(profile,log,schedule){
  const name=profile.name||"you";
  const streak=profile.streak||0;
  const tasks=(schedule||[]).filter(b=>b.type!=="sleep"&&b.type!=="free"&&b.type!=="buffer");
  const taskList=tasks.length?tasks.map((t,i)=>"  "+(i+1)+". "+t.time+" — "+t.title+(t.instruction?" | "+t.instruction:"")).join("\n"):"  No tasks recorded.";
  const patterns=detectPatterns((log||[]).slice(-7));
  return "Auditing "+name+"'s day. Streak: "+streak+" days.\n\n"+
    MENTOR_RULES+"\n\n"+
    "Controllable=punish. Uncontrollable=legitimate. Hard day fatigue=legitimate. Bad choice fatigue=punish.\n\n"+
    "TODAY'S TASKS:\n"+taskList+"\n\n"+
    (patterns.length?"PATTERNS:\n"+patterns.map(p=>"  - "+p).join("\n")+"\n\n":"")+
    "Ask them to report each task. For each miss: get reason, apply legitimacy test, deliver consequence or accept.\n"+
    "Rewards for completions. Name patterns. State exactly what changes tomorrow. Direct. No softening.\n\n"+
    "<AUDIT>{\"date\":\""+todayStr()+"\",\"completed\":0,\"total\":"+tasks.length+",\"punishments\":0,\"rewards\":0,\"streak\":"+streak+",\"notes\":\"\"}</AUDIT>";
}

function buildCoachPrompt(profile,schedule){
  const ctx=(schedule||[]).map((b,i)=>"["+i+"] "+b.time+"-"+b.end+" "+b.title).join(" | ");
  return "Strict mentor for "+(profile.name||"you")+". Streak: "+(profile.streak||0)+"d.\n"+
    MENTOR_RULES+"\nSchedule: "+ctx+"\nTime: "+timeStr()+"\n"+
    "Max 3 sentences. Direct. Legitimacy test immediately on any excuse.\n"+
    "SCHEDULE_UPDATE:{\"index\":<n>,\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"...\",\"instruction\":\"...\"}\nREBUILD_NEEDED if major change.";
}

// ── Components ─────────────────────────────────────────
function Header({mode,streak,examMode}){
  const [now,setNow]=useState(timeStr());
  useEffect(()=>{const t=setInterval(()=>setNow(timeStr()),1000);return()=>clearInterval(t);},[]);
  const modeLabel={morning:"Morning",executing:"Executing",audit:"Audit"};
  const modeBg={morning:C.accentFaint,executing:"#0a120a",audit:"#120a10"};
  return(
    <div style={{background:modeBg[mode],borderBottom:"1px solid "+C.border,padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>{modeLabel[mode]}</div>
          <div style={{color:C.textDim,fontSize:11,marginTop:2}}>{dateStr()}</div>
        </div>
        {examMode&&<div style={{background:"#2a1000",border:"1px solid #5a2a00",borderRadius:4,padding:"3px 8px",fontSize:9,color:"#c86420",letterSpacing:1,textTransform:"uppercase"}}>EXAM {examMode.daysOut}d</div>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        {streak>0&&<div style={{background:C.accentFaint,border:"1px solid "+C.accentDim,borderRadius:4,padding:"3px 8px",fontSize:11,color:C.accent}}>🔥 {streak}</div>}
        <div style={{color:C.text,fontSize:22,fontWeight:700,fontVariantNumeric:"tabular-nums",fontFamily:"monospace"}}>{now}</div>
      </div>
    </div>
  );
}

function ScheduleBlock({block,state}){
  const isCur=state==="current",isPast=state==="past";
  const ts={
    routine:{bg:C.routine,bl:C.routineBorder,lbl:"ROUTINE"},
    study:{bg:C.study,bl:C.studyBorder,lbl:"STUDY"},
    meal:{bg:C.meal,bl:C.mealBorder,lbl:"MEAL"},
    movement:{bg:C.movement,bl:C.movementBorder,lbl:"MOVE"},
    free:{bg:C.free,bl:C.freeBorder,lbl:"FREE"},
    fixed:{bg:"#0e0e14",bl:"#2a2a3a",lbl:"FIXED"},
    sleep:{bg:C.sleep,bl:C.sleepBorder,lbl:"SLEEP"},
    buffer:{bg:C.buffer,bl:C.bufferBorder,lbl:"BUFFER"},
  }[block.type]||{bg:"transparent",bl:C.borderLight,lbl:""};
  return(
    <div style={{padding:isCur?"9px 12px":"6px 12px",borderRadius:6,marginBottom:2,background:isCur?"#1e1c18":ts.bg,borderLeft:"2px solid "+(isCur?C.accent:ts.bl),opacity:isPast?0.25:1}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:isCur?C.textMid:C.textDim,fontSize:10,minWidth:85,fontVariantNumeric:"tabular-nums",fontFamily:"monospace",flexShrink:0}}>{block.time}–{block.end}</span>
        <span style={{color:isCur?C.text:isPast?C.textDim:"#c8c0b0",fontSize:isCur?13:12,fontWeight:isCur?600:400,flex:1,lineHeight:1.3}}>{block.title}</span>
        {isCur&&<span style={{background:C.accent,color:"#000",fontSize:8,fontWeight:700,letterSpacing:1,padding:"2px 6px",borderRadius:3,flexShrink:0}}>NOW</span>}
        {!isCur&&!isPast&&ts.lbl&&<span style={{color:C.textDim,fontSize:8,letterSpacing:1,flexShrink:0}}>{ts.lbl}</span>}
      </div>
      {block.instruction&&block.instruction!=="none"&&!isPast&&(
        <div style={{marginTop:4,marginLeft:93,color:isCur?C.textMid:C.textDim,fontSize:10,lineHeight:1.5,fontStyle:"italic"}}>{block.instruction}</div>
      )}
    </div>
  );
}

function SchedulePanel({blocks}){
  const ref=useRef(null);
  const ci=getCurIdx(blocks);
  useEffect(()=>{
    if(ref.current&&ci>=0){
      const els=ref.current.querySelectorAll("[data-idx]");
      if(els[ci])els[ci].scrollIntoView({block:"center",behavior:"smooth"});
    }
  },[ci,blocks.length]);
  return(
    <div style={{width:280,flexShrink:0,borderRight:"1px solid "+C.border,display:"flex",flexDirection:"column",background:C.surface}}>
      <div style={{padding:"10px 12px 6px",borderBottom:"1px solid "+C.borderLight,flexShrink:0}}>
        <span style={{color:C.textDim,fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>Today's Schedule</span>
      </div>
      <div ref={ref} style={{flex:1,overflowY:"auto",padding:"6px 4px"}}>
        {!blocks.length?(
          <div style={{padding:"20px 12px",color:C.textFaint,fontSize:11,textAlign:"center",lineHeight:1.6}}>No schedule yet.<br/>Tell the mentor about your day.</div>
        ):blocks.map((b,i)=>(
          <div key={i} data-idx={i}><ScheduleBlock block={b} state={i===ci?"current":i<ci?"past":"future"}/></div>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({msg}){
  const isUser=msg.role==="user";
  return(
    <div style={{alignSelf:isUser?"flex-end":"flex-start",maxWidth:"80%"}}>
      {!isUser&&<div style={{color:C.accentDim,fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Mentor</div>}
      <div style={{background:isUser?C.accentFaint:C.surface,border:"1px solid "+(isUser?C.accentDim:C.border),color:isUser?C.text:"#c0b8a8",fontSize:13,lineHeight:1.7,padding:"10px 14px",borderRadius:isUser?"8px 8px 2px 8px":"8px 8px 8px 2px",whiteSpace:"pre-wrap"}}>
        {msg.text}
      </div>
    </div>
  );
}

function ChatPanel({messages,loading,feedRef}){
  return(
    <div ref={feedRef} style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
      {!messages.length&&<div style={{margin:"auto",textAlign:"center",color:C.textFaint,fontSize:12,lineHeight:1.8}}>Your mentor is ready.<br/>Tell them about your day.</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&(
        <div style={{alignSelf:"flex-start"}}>
          <div style={{color:C.accentDim,fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Mentor</div>
          <div style={{background:C.surface,border:"1px solid "+C.border,color:C.textMid,fontSize:13,padding:"10px 14px",borderRadius:"8px 8px 8px 2px"}}>…</div>
        </div>
      )}
    </div>
  );
}

function InputBar({value,onChange,onSend,disabled,placeholder}){
  return(
    <div style={{borderTop:"1px solid "+C.border,padding:"12px 20px",background:C.surface,display:"flex",gap:10,flexShrink:0}}>
      <input style={{flex:1,background:C.bg,border:"1px solid "+C.border,borderRadius:8,color:C.text,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit"}}
        placeholder={placeholder||"Talk to your mentor…"} value={value}
        onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey)onSend();}}
        disabled={disabled}
        onFocus={e=>e.target.style.borderColor=C.accentDim}
        onBlur={e=>e.target.style.borderColor=C.border}/>
      <button onClick={onSend} disabled={disabled} style={{background:C.accent,color:"#000",border:"none",borderRadius:8,width:44,fontSize:16,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,flexShrink:0}}>↑</button>
    </div>
  );
}

// ── Onboarding ─────────────────────────────────────────
function Onboarding({onComplete}){
  const [messages,setMessages]=useState([{role:"ai",text:"Let's build your schedule properly. I'm going to ask you a few questions so I can optimise it around how you actually live — not a generic template.\n\nLet's start: what's your name?"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const conv=useRef([]);
  const feedRef=useRef(null);

  useEffect(()=>{if(feedRef.current)feedRef.current.scrollTop=feedRef.current.scrollHeight;},[messages,loading]);

  async function send(){
    if(!input.trim()||loading)return;
    const msg=input.trim();setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]);
    conv.current=[...conv.current,{role:"user",content:msg}];
    setLoading(true);
    try{
      const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:800,system:ONBOARDING_SYSTEM,messages:conv.current})});
      const d=await r.json();
      const raw=d.content?d.content.map(c=>c.text||"").join(""):"";
      conv.current=[...conv.current,{role:"assistant",content:raw}];
      const match=raw.match(/<PROFILE>([\s\S]*?)<\/PROFILE>/);
      if(match){
        try{
          const p=JSON.parse(match[1].trim());
          await sSet(SK.profile,p);
          onComplete(p);return;
        }catch(e){console.error("profile parse",e);}
      }
      const clean=raw.replace(/<PROFILE>[\s\S]*?<\/PROFILE>/g,"").trim();
      setMessages(m=>[...m,{role:"ai",text:clean}]);
    }catch(e){setMessages(m=>[...m,{role:"ai",text:"Connection error. Try again."}]);}
    setLoading(false);
  }

  return(
    <div style={{height:"100vh",background:C.bg,display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif"}}>
      <div style={{padding:"16px 20px",borderBottom:"1px solid "+C.border,background:C.surface,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{color:C.accent,fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Mentor System</div>
          <div style={{color:C.textMid,fontSize:12,marginTop:2}}>Building your optimised schedule</div>
        </div>
        <div style={{color:C.textDim,fontSize:11}}>{dateStr()}</div>
      </div>
      <div ref={feedRef} style={{flex:1,overflowY:"auto",padding:"20px",display:"flex",flexDirection:"column",gap:12,maxWidth:700,width:"100%",margin:"0 auto",boxSizing:"border-box"}}>
        {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
        {loading&&(
          <div style={{alignSelf:"flex-start"}}>
            <div style={{color:C.accentDim,fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Mentor</div>
            <div style={{background:C.surface,border:"1px solid "+C.border,color:C.textMid,fontSize:13,padding:"10px 14px",borderRadius:"8px 8px 8px 2px"}}>…</div>
          </div>
        )}
      </div>
      <div style={{borderTop:"1px solid "+C.border,padding:"12px 20px",background:C.surface,flexShrink:0}}>
        <div style={{maxWidth:700,margin:"0 auto",display:"flex",gap:10}}>
          <input style={{flex:1,background:C.bg,border:"1px solid "+C.border,borderRadius:8,color:C.text,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit"}}
            placeholder="Reply…" value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey)send();}} disabled={loading} autoFocus/>
          <button onClick={send} disabled={loading} style={{background:C.accent,color:"#000",border:"none",borderRadius:8,width:44,fontSize:16,fontWeight:700,cursor:loading?"not-allowed":"pointer",opacity:loading?0.5:1}}>↑</button>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────
function MainScreen({profile:initProfile}){
  const [profile,setProfile]=useState(initProfile);
  const [schedule,setSchedule]=useState([]);
  const [log,setLog]=useState([]);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [mode,setMode]=useState(getMode());
  const [auditStarted,setAuditStarted]=useState(false);
  const feedRef=useRef(null);
  const conv=useRef([]);

  useEffect(()=>{const t=setInterval(()=>setMode(getMode()),60000);return()=>clearInterval(t);},[]);
  useEffect(()=>{if(feedRef.current)feedRef.current.scrollTop=feedRef.current.scrollHeight;},[messages,loading]);

  useEffect(()=>{
    Promise.all([sGet(SK.schedule),sGet(SK.log)]).then(([s,l])=>{
      if(s&&s.date===todayStr()&&s.blocks&&s.blocks.length)setSchedule(s.blocks);
      if(l)setLog(l);
      const m=getMode();
      const alreadyAudited=l&&l.find(e=>e.date===todayStr());
      if(m==="audit"&&!alreadyAudited){
        triggerAudit(l||[],s?s.blocks:[]);
      } else if(m==="morning"){
        const en=initProfile.examMode?" You're in exam mode — "+initProfile.examMode.exam+" in "+initProfile.examMode.daysOut+" days.":"";
        setMessages([{role:"ai",text:"Morning, "+initProfile.name+"."+en+" Tell me about your day — when you woke up, what's fixed, how you're feeling, what needs to get done."}]);
      } else {
        setMessages([{role:"ai",text:"Mid-day. Stay on your schedule. Talk to me if something comes up."}]);
      }
    });
  },[]);

  async function saveProfile(p){setProfile(p);await sSet(SK.profile,p);}

  async function claudeCall(msgs,sys){
    const body={model:"claude-sonnet-4-5",max_tokens:2000,messages:msgs};
    if(sys)body.system=sys;
    const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();
    return d.content?d.content.map(c=>c.text||"").join(""):"";
  }

  async function triggerAudit(el,es){
    setAuditStarted(true);setLoading(true);
    try{
      const raw=await claudeCall([{role:"user",content:"Run the evening audit."}],buildAuditPrompt(profile,el,es));
      conv.current=[{role:"user",content:"Run the evening audit."},{role:"assistant",content:raw}];
      const clean=raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim();
      setMessages([{role:"ai",text:clean}]);
    }catch(e){setMessages([{role:"ai",text:"Audit failed. Report manually."}]);}
    setLoading(false);
  }

  async function send(){
    if(!input.trim()||loading)return;
    const msg=input.trim();setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]);
    conv.current=[...conv.current,{role:"user",content:msg}];
    setLoading(true);
    try{
      if(mode==="morning"&&!schedule.length){
        const raw=await claudeCall(conv.current,buildMorningPrompt(profile,log));
        conv.current=[...conv.current,{role:"assistant",content:raw}];
        const sm=raw.match(/<SCHEDULE>([\s\S]*?)<\/SCHEDULE>/);
        if(sm){try{const bl=JSON.parse(sm[1].trim());setSchedule(bl);await sSet(SK.schedule,{date:todayStr(),blocks:bl});}catch(e){console.error(e);}}
        const pm=raw.match(/<PROFILE_UPDATE>([\s\S]*?)<\/PROFILE_UPDATE>/);
        if(pm){try{
          const u=JSON.parse(pm[1].trim());
          const np={...profile};
          if(u.subjects&&u.subjects.length)np.subjects=[...new Set([...(np.subjects||[]),...u.subjects])];
          if(u.lastWakeTime)np.lastWakeTime=u.lastWakeTime;
          if(u.examMode)np.examMode=u.examMode;
          await saveProfile(np);
        }catch(e){console.error(e);}}
        const clean=raw.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g,"").replace(/<PROFILE_UPDATE>[\s\S]*?<\/PROFILE_UPDATE>/g,"").trim();
        setMessages(m=>[...m,{role:"ai",text:clean}]);
      } else if(mode==="audit"||auditStarted){
        const raw=await claudeCall(conv.current,buildAuditPrompt(profile,log,schedule));
        conv.current=[...conv.current,{role:"assistant",content:raw}];
        const am=raw.match(/<AUDIT>([\s\S]*?)<\/AUDIT>/);
        if(am){try{
          const entry=JSON.parse(am[1].trim());
          const nl=[...log,entry];
          setLog(nl);await sSet(SK.log,nl);
          const ns=entry.punishments===0&&entry.completed===entry.total?(profile.streak||0)+1:0;
          const np={...profile,streak:ns};
          if(np.examMode&&np.examMode.daysOut>0){np.examMode={...np.examMode,daysOut:np.examMode.daysOut-1,ritualDay:8-np.examMode.daysOut};}
          if(np.examMode&&np.examMode.daysOut<=0)np.examMode=null;
          await saveProfile(np);
        }catch(e){console.error(e);}}
        const clean=raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim();
        setMessages(m=>[...m,{role:"ai",text:clean}]);
      } else {
        const r=await fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:buildCoachPrompt(profile,schedule),message:msg})});
        const d=await r.json();
        const raw=d.content||"";
        if(raw.includes("REBUILD_NEEDED")){conv.current=[];setSchedule([]);await sSet(SK.schedule,{date:todayStr(),blocks:[]});setMessages(m=>[...m,{role:"ai",text:"Schedule cleared. Tell me what changed."}]);setLoading(false);return;}
        const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
        if(upd){try{const o=JSON.parse(upd[1]);const nb=schedule.map((b,i)=>i===o.index?{...b,...o}:b);setSchedule(nb);await sSet(SK.schedule,{date:todayStr(),blocks:nb});}catch(e){console.error(e);}}
        const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/REBUILD_NEEDED/g,"").trim();
        if(clean)setMessages(m=>[...m,{role:"ai",text:clean}]);
      }
    }catch(e){console.error(e);setMessages(m=>[...m,{role:"ai",text:"Error. Try again."}]);}
    setLoading(false);
  }

  const ph={morning:"Tell me about your day…",executing:"Talk to your mentor…",audit:"Report what you completed…"}[mode];

  return(
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column"}}>
      <Header mode={mode} streak={profile.streak||0} examMode={profile.examMode||null}/>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <SchedulePanel blocks={schedule}/>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <ChatPanel messages={messages} loading={loading} feedRef={feedRef}/>
          <InputBar value={input} onChange={setInput} onSend={send} disabled={loading} placeholder={ph}/>
        </div>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────
export default function App(){
  const [state,setState]=useState(null);
  useEffect(()=>{sGet(SK.profile).then(p=>setState(p&&p.name?p:false));},[]);
  async function handleSetup(p){await sSet(SK.profile,p);setState(p);}
  if(state===null)return(
    <div style={{height:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:C.textDim,fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Loading…</div>
    </div>
  );
  if(state===false)return <Onboarding onComplete={handleSetup}/>;
  return <MainScreen profile={state}/>;
}