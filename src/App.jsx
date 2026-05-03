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
const SK={profile:"ms2_profile",schedule:"ms2_schedule",log:"ms2_log"};
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

const STUDY_TECHNIQUES="STUDY TECHNIQUES — assign by priority tier:\n\n"+
"TIER 1 (assign daily — core techniques):\n"+
"- Active Recall: test yourself constantly, no notes, identify gaps. Assign as: 'Close everything. Write all you know about [topic] from memory.'\n"+
"- Spaced Repetition: revisit yesterday's material for 10min before new content. Always.\n"+
"- Practice Tests: past papers or self-made problems under timed conditions. For maths this is non-negotiable.\n"+
"- Blurting: at the end of each study block, dump everything learned onto blank paper without looking. Mark gaps.\n\n"+
"TIER 2 (assign 3-4x per week):\n"+
"- Feynman Technique: explain the concept in simple language as if teaching a 10-year-old. If you cannot, you do not understand it.\n"+
"- Interleaved Practice: mix topics within one session instead of blocking one subject. Harder but more effective.\n"+
"- Active Note-Taking: handwritten, rephrased in own words, never copied verbatim. Diagrams encouraged.\n\n"+
"TIER 3 (assign when introducing new material or doing review):\n"+
"- SQ3R: Survey, Question, Read, Recite, Review. For new textbook chapters or dense reading.\n"+
"- Mind Mapping: visual diagram connecting ideas. Use at start of a topic to see the big picture.\n"+
"- Concept Mapping: draw connections between existing ideas. Use at end of a topic to consolidate.\n\n"+
"ASSIGNMENT RULES:\n"+
"- Always specify which technique with the task.\n"+
"- Never assign passive methods (re-reading, watching, highlighting).\n"+
"- Maths default: practice problems + active recall + spaced repetition every session.\n"+
"- Combine techniques: e.g. 'Solve 5 integration problems (practice test), then blurt everything you know about integration (active recall).'";

const EXAM_RITUAL="EXAM RITUAL — triggers when user mentions an exam is within 7 days:\n\n"+
"When exam mode is active, daily routines and habits stay IDENTICAL. Only study blocks change.\n\n"+
"DAY 7 (Audit day):\n"+
"Study block: Stop all new material. List every weak area. Build a hit list of topics.\n"+
"Technique: Active recall + blurting to expose gaps. No new content.\n\n"+
"DAY 6-5 (Targeted repair):\n"+
"Study block: Work exclusively through the hit list. Feynman every weak concept.\n"+
"Technique: Feynman + active recall. No practice papers yet.\n\n"+
"DAY 4-3 (Simulation):\n"+
"Study block: Full past papers under timed exam conditions. Mark ruthlessly.\n"+
"Every mistake goes into an error log: what went wrong and why.\n"+
"Technique: Practice tests + active note-taking of errors.\n\n"+
"DAY 2 (Error correction):\n"+
"Study block: Error log only. Redo every mistake from scratch. Fix reasoning not just answers.\n"+
"Technique: Active recall of corrected problems only.\n\n"+
"DAY 1 (Reset day):\n"+
"Study block: 30min light review max. No heavy work.\n"+
"Focus: sleep, food, walk, calm. Protect mental state.\n"+
"Add a 10min next-day prep block: lay out what you need, review arrival plan.\n\n"+
"EXAM DAY:\n"+
"Normal morning routine. Good breakfast. No cramming. Arrive early.\n\n"+
"EXAM RITUAL RULES:\n"+
"- Never skip the error log. Errors not logged are errors repeated.\n"+
"- Sleep is protected harder than any other week — non-negotiable.\n"+
"- Free time is slightly reduced on simulation days but not eliminated.\n"+
"- When exam is done: slide back into normal system immediately. No recovery period.";

const MENTOR_RULES="MENTOR RULES:\n\n"+
"You are a strict mentor. You run this person's day, assign their tasks, and hold them accountable.\n\n"+
"REWARD AND PUNISHMENT SYSTEM:\n"+
"Controllable = punishment. Uncontrollable = legitimate.\n"+
"Controllable (punish): poor time management, avoidance, low motivation, bad choices, social calls they could have declined, tiredness from bad sleep or phone use.\n"+
"Uncontrollable (legitimate): genuine emergencies, family crises, medical issues, fatigue from a genuinely hard day of classes or work, things impossible to predict.\n"+
"The test: could they have prevented this with better planning or self-discipline? Yes = punish. No = legitimate.\n\n"+
"REWARDS:\n"+
"- 30min free time added tomorrow per completed study block\n"+
"- Streak acknowledged at 3, 7, 14, 30 days\n"+
"- Lighter task load after 3 consecutive perfect days\n"+
"- More autonomy in task selection after 7 day streak\n\n"+
"PUNISHMENTS:\n"+
"- Missed task carried over — must complete before any free time tomorrow\n"+
"- 30min free time removed per missed controllable task\n"+
"- Extra task assigned in same area, one difficulty level higher\n"+
"- Streak reset to zero, stated clearly\n"+
"- Direct callout, no softening\n\n"+
"LEGITIMACY FATIGUE RULE:\n"+
"Tired from classes, work, or genuine heavy output = legitimate.\n"+
"Tired from phone use, poor sleep choices, or laziness = punishment.\n\n"+
"GOOD LIFE HABITS (build progressively, never all at once):\n"+
"Morning: water, brush teeth, wash face, shower, get dressed, breakfast — in order, phone last.\n"+
"Meals: all three daily, correct windows, no phone during.\n"+
"Movement: 15min walk minimum daily.\n"+
"Sleep: consistent time, wind-down 30min before, phone away.\n"+
"Environment: tidy space before study.\n"+
"Hydration: water throughout the day.\n\n"+
"BAD HABITS (reduce progressively):\n"+
"Phone: reduce in protected windows first, expand gradually.\n"+
"Procrastination: hard tasks always scheduled first.\n"+
"Passive study: replaced with active methods only.\n"+
"Skipping meals: meals are non-negotiable blocks.\n"+
"Irregular sleep: shift 30min earlier every 7 days consistent.\n"+
"Skipping hygiene: scheduled as blocks, tracked in audit.\n\n"+
"PROGRESSION RULE: Never stack new habits until current ones are stable 3+ days. Break = reset to easier version.";

function buildMorningPrompt(profile,log){
  const name=(profile&&profile.name)||"there";
  const subjects=(profile&&profile.subjects&&profile.subjects.length)?profile.subjects.join(", "):"not yet specified";
  const streak=(profile&&profile.streak)||0;
  const examMode=(profile&&profile.examMode)||null;
  const recentLog=(log||[]).slice(-5);
  const logStr=recentLog.length?recentLog.map(l=>"  "+l.date+": completed="+l.completed+"/"+l.total+", punishments="+l.punishments+", streak="+l.streak).join("\n"):"  No history yet.";
  const streakNote=streak>=7?"7+ day streak. More autonomy earned. Maintain it.":streak>=3?"Momentum building. Keep going.":"Building from zero. Basics first.";
  const examNote=examMode?"EXAM MODE ACTIVE: "+examMode.exam+" in "+examMode.daysOut+" days. Today is Day "+examMode.ritualDay+" of the exam ritual. Apply exam ritual rules to study blocks.":"";

  return "You are a strict mentor running "+name+"'s day. Time: "+timeStr()+". Date: "+dateStr()+".\n\n"+
    MENTOR_RULES+"\n\n"+
    STUDY_TECHNIQUES+"\n\n"+
    EXAM_RITUAL+"\n\n"+
    "USER: "+name+" | Subjects: "+subjects+" | Streak: "+streak+" days. "+streakNote+"\n"+
    (examNote?examNote+"\n":"")+
    "\nRECENT HISTORY:\n"+logStr+"\n\n"+
    "BUILD THE FULL DAY SCHEDULE:\n\n"+
    "EVERY DAY MUST INCLUDE:\n"+
    "1. Wake up\n"+
    "2. Morning routine: water, brush teeth, wash face, shower, get dressed, breakfast (in that order, phone last)\n"+
    "3. Study blocks with specific technique + specific task + specific quantity\n"+
    "4. Lunch (12:00-14:00, 30min, no phone)\n"+
    "5. Movement (15min walk minimum)\n"+
    "6. Dinner (18:00-20:00, 30min, no phone)\n"+
    "7. Earned free time (adjust based on streak and recent performance)\n"+
    "8. Night routine: tidy 10min, reflect 5min, wind-down no screens, phone away\n"+
    "9. Sleep\n\n"+
    "STUDY BLOCK RULES:\n"+
    "- Assign specific subject + specific topic + specific quantity + specific technique from the tier list\n"+
    "- Hard tasks first in the day\n"+
    "- Match load to streak: streak 0-2 = light, streak 3-6 = moderate, streak 7+ = full\n"+
    "- If exam mode active: replace normal study with that day's ritual protocol\n\n"+
    "PARSE THE USER'S MESSAGE:\n"+
    "Extract wake time, fixed events, energy, constraints. Build from NOW ("+timeStr()+").\n"+
    "If user mentions an exam and how many days away: activate exam mode for that day's ritual.\n"+
    "Do not ask for info already given. Ask ONE question only if something critical is missing.\n\n"+
    "Output schedule as clean readable text first, then JSON:\n"+
    "<SCHEDULE>\n"+
    "[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"Task\",\"type\":\"routine|study|meal|movement|free|fixed|sleep\",\"instruction\":\"specific instruction with technique\"}]\n"+
    "</SCHEDULE>\n"+
    "<PROFILE_UPDATE>\n"+
    "{\"subjects\":[],\"lastWakeTime\":\"\",\"lastSleepTime\":\"\",\"examMode\":null}\n"+
    "</PROFILE_UPDATE>";
}

function buildAuditPrompt(profile,log,schedule){
  const name=(profile&&profile.name)||"you";
  const streak=(profile&&profile.streak)||0;
  const tasks=(schedule||[]).filter(b=>b.type!=="sleep"&&b.type!=="free");
  const taskList=tasks.length?tasks.map((t,i)=>"  "+(i+1)+". "+t.time+" — "+t.title+(t.instruction?" | "+t.instruction:"")).join("\n"):"  No tasks recorded.";
  const recentLog=(log||[]).slice(-7);
  const patterns=detectPatterns(recentLog);

  return "You are auditing "+name+"'s day. Streak: "+streak+" days.\n\n"+
    MENTOR_RULES+"\n\n"+
    "LEGITIMACY TEST:\n"+
    "Controllable = punish. Uncontrollable = legitimate.\n"+
    "Tired from hard day of work or classes = legitimate. Tired from bad choices = punish.\n\n"+
    "TODAY'S TASKS:\n"+taskList+"\n\n"+
    (patterns.length?"PATTERNS DETECTED:\n"+patterns.map(p=>"  - "+p).join("\n")+"\n\n":"")+
    "YOUR JOB:\n"+
    "1. Ask them to go through each task — completed or not.\n"+
    "2. For each missed task: ask for their reason. Apply legitimacy test immediately.\n"+
    "3. Deliver specific rewards for completed tasks.\n"+
    "4. Deliver specific consequences for missed controllable tasks.\n"+
    "5. Name any patterns you see forming.\n"+
    "6. State exactly what changes tomorrow.\n\n"+
    "CONSEQUENCES:\n"+
    "- Carry over missed task (must complete before any free time tomorrow)\n"+
    "- 30min free time removed per missed controllable task\n"+
    "- Extra task assigned: same area, one level harder\n"+
    "- Streak reset to zero if any controllable miss. State it.\n\n"+
    "REWARDS:\n"+
    "- 30min free time added per completed study block\n"+
    "- Streak milestone acknowledgement (3, 7, 14, 30 days)\n"+
    "- Reduced load tomorrow if exceptional day\n\n"+
    "Be direct. Specific. No softening on controllable misses.\n\n"+
    "<AUDIT>\n"+
    "{\"date\":\""+todayStr()+"\",\"completed\":0,\"total\":"+tasks.length+",\"punishments\":0,\"rewards\":0,\"streak\":"+streak+",\"notes\":\"\"}\n"+
    "</AUDIT>";
}

function buildCoachPrompt(profile,schedule){
  const name=(profile&&profile.name)||"you";
  const streak=(profile&&profile.streak)||0;
  const ctx=(schedule||[]).map((b,i)=>"["+i+"] "+b.time+"-"+b.end+" "+b.title).join(" | ");
  return "Strict mentor for "+name+". Streak: "+streak+" days.\n"+
    MENTOR_RULES+"\n"+
    "Schedule: "+ctx+"\nTime: "+timeStr()+"\n"+
    "Max 3 sentences. Direct. Apply legitimacy test to any excuse immediately.\n"+
    "Refuse skipping tasks, meals, or routines unless genuinely uncontrollable.\n"+
    "SCHEDULE_UPDATE:{\"index\":<n>,\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"...\",\"instruction\":\"...\"}\n"+
    "REBUILD_NEEDED if major day change.";
}

function detectPatterns(logs){
  if(!logs||!logs.length)return [];
  const p=[];
  const l3=logs.slice(-3);
  if(l3.length>=3&&l3.every(l=>l.punishments>0)) p.push("Punishments 3+ days in a row — something is not working. Reassess task load or scheduling.");
  if(l3.length>=3&&l3.every(l=>l.completed<l.total)) p.push("Incomplete days 3+ days — load may be too high or avoidance pattern forming.");
  if(logs.filter(l=>l.notes&&l.notes.toLowerCase().includes("phone")).length>=3) p.push("Phone violations recurring — enforce phone-free blocks more strictly.");
  if(l3.length>=3&&l3.every(l=>l.streak===0)) p.push("Streak not building — consistency is the only target right now.");
  return p;
}

// ── Components ─────────────────────────────────────────
function Header({mode,streak,examMode}){
  const [now,setNow]=useState(timeStr());
  useEffect(()=>{const t=setInterval(()=>setNow(timeStr()),1000);return()=>clearInterval(t);},[]);
  const labels={morning:"Morning — build your day",executing:"Executing",audit:"Evening Audit"};
  const bg={morning:"#0a0800",executing:"#000a00",audit:"#0a0008"};
  return(
    <div style={{padding:"13px 18px 9px",borderBottom:"1px solid #141414",background:bg[mode],display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{color:"#444",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>{dateStr()}</div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2}}>
          <div style={{color:"#444",fontSize:11}}>{labels[mode]}</div>
          {examMode&&<div style={{color:"#4a2000",fontSize:9,letterSpacing:1,textTransform:"uppercase",border:"1px solid #2a1000",padding:"1px 5px",borderRadius:3}}>EXAM -{examMode.daysOut}d</div>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        {streak>0&&<div style={{color:"#2a2000",fontSize:10}}>{"🔥"+streak}</div>}
        <div style={{color:"#555",fontSize:20,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{now}</div>
      </div>
    </div>
  );
}

function ScheduleBlock({block,state}){
  const isCur=state==="current",isPast=state==="past";
  const bgs={routine:"#0a0800",study:"#0d0d00",meal:"#000a10",movement:"#000d06",free:"#080010",fixed:"#0d000d",sleep:"#06000d"};
  const bls={routine:"#1a1000",study:"#2a2a00",meal:"#001520",movement:"#001a0d",free:"#100020",fixed:"#1a001a",sleep:"#0d001a"};
  const lbl={routine:"ROUTINE",study:"STUDY",meal:"MEAL",movement:"MOVE",free:"FREE",fixed:"FIXED",sleep:"SLEEP"};
  return(
    <div style={{margin:"0 4px 2px",padding:isCur?"11px 14px":"8px 14px",borderRadius:7,background:isCur?"#1a1a1a":bgs[block.type]||"transparent",borderLeft:"2px solid "+(isCur?"#fff":bls[block.type]||"#141414"),opacity:isPast?0.2:1}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{color:isCur?"#888":"#3a3a3a",fontSize:11,minWidth:95,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{block.time}–{block.end}</span>
        <span style={{color:isCur?"#fff":isPast?"#444":"#bbb",fontSize:isCur?14:13,fontWeight:isCur?600:400,flex:1,lineHeight:1.3}}>{block.title}</span>
        {isCur&&<span style={{color:"#000",background:"#fff",fontSize:8,fontWeight:700,letterSpacing:1.5,padding:"2px 5px",borderRadius:3}}>NOW</span>}
        {!isCur&&!isPast&&lbl[block.type]&&<span style={{color:"#2a2a2a",fontSize:8,letterSpacing:1}}>{lbl[block.type]}</span>}
      </div>
      {block.instruction&&block.instruction!=="none"&&!isPast&&(
        <div style={{marginTop:5,marginLeft:105,color:isCur?"#555":"#2a2a2a",fontSize:11,lineHeight:1.5,fontStyle:"italic"}}>{block.instruction}</div>
      )}
    </div>
  );
}

function ScheduleList({blocks}){
  const ref=useRef(null);
  const ci=getCurIdx(blocks);
  useEffect(()=>{
    if(ref.current&&ci>=0){
      const els=ref.current.querySelectorAll("[data-idx]");
      if(els[ci])els[ci].scrollIntoView({block:"center",behavior:"smooth"});
    }
  },[ci,blocks.length]);
  if(!blocks.length)return(
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6}}>
      <div style={{color:"#222",fontSize:13}}>No schedule yet.</div>
      <div style={{color:"#1a1a1a",fontSize:11}}>Tell me about your day ↓</div>
    </div>
  );
  return(
    <div ref={ref} style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
      {blocks.map((b,i)=>(
        <div key={i} data-idx={i}><ScheduleBlock block={b} state={i===ci?"current":i<ci?"past":"future"}/></div>
      ))}
    </div>
  );
}

function MessageBubble({msg}){
  const isUser=msg.role==="user";
  return(
    <div style={{alignSelf:isUser?"flex-end":"flex-start",background:isUser?"#1e1e1e":"#161616",border:"1px solid "+(isUser?"#2a2a2a":"#1e1e1e"),color:isUser?"#e0e0e0":"#aaa",fontSize:13,lineHeight:1.6,padding:"8px 12px",borderRadius:8,maxWidth:"85%",whiteSpace:"pre-wrap"}}>
      {msg.text}
    </div>
  );
}

function ChatFeed({messages,loading,feedRef}){
  return(
    <div ref={feedRef} style={{height:190,overflowY:"auto",padding:"8px 18px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #141414"}}>
      {!messages.length&&<div style={{color:"#1e1e1e",fontSize:12,margin:"auto",textAlign:"center"}}>Tell me about your day.</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&<MessageBubble msg={{role:"ai",text:"…"}}/>}
    </div>
  );
}

function InputBar({value,onChange,onSend,disabled,mode}){
  const ph=mode==="morning"?"Tell me about your day…":mode==="audit"?"Report what you completed…":"Talk to your mentor…";
  return(
    <div style={{display:"flex",gap:8,padding:"10px 18px 14px",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
      <input style={{flex:1,background:"#111",border:"1px solid #222",borderRadius:7,color:"#fff",padding:"9px 13px",fontSize:14,outline:"none",fontFamily:"inherit"}}
        placeholder={ph} value={value} onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey)onSend();}} disabled={disabled}/>
      <button onClick={onSend} disabled={disabled} style={{background:"#fff",color:"#000",border:"none",borderRadius:7,width:38,fontSize:16,fontWeight:700,cursor:"pointer",opacity:disabled?0.4:1}}>↑</button>
    </div>
  );
}

function Setup({onComplete}){
  const [name,setName]=useState("");
  const go=()=>{if(name.trim())onComplete({name:name.trim(),streak:0,subjects:[],punishments:0,examMode:null});};
  return(
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:10,padding:"28px 24px",width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{color:"#fff",fontSize:16,fontWeight:700}}>What's your name?</div>
        <div style={{color:"#333",fontSize:12,lineHeight:1.7}}>Your mentor builds your day, assigns your tasks, and holds you accountable. Complete tasks and earn rewards. Miss them and face consequences.</div>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" autoFocus
          onKeyDown={e=>{if(e.key==="Enter")go();}}
          style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:6,color:"#fff",padding:"10px 12px",fontSize:14,outline:"none"}}/>
        <button onClick={go} style={{background:"#fff",color:"#000",border:"none",borderRadius:6,padding:"11px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Start →</button>
      </div>
    </div>
  );
}

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
      if(m==="audit"&&(!l||!l.find(e=>e.date===todayStr()))){
        triggerAudit(l||[],s?s.blocks:[]);
      } else if(m==="morning"){
        const examNote=initProfile.examMode?" You're in exam mode — "+initProfile.examMode.exam+" in "+initProfile.examMode.daysOut+" days.":"";
        setMessages([{role:"ai",text:"Morning, "+initProfile.name+"."+examNote+" Tell me about your day — when you woke up, what's fixed, how you're feeling, what you need to get done."}]);
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

  async function triggerAudit(existingLog,existingSchedule){
    setAuditStarted(true);setLoading(true);
    try{
      const raw=await claudeCall([{role:"user",content:"Run the evening audit."}],buildAuditPrompt(profile,existingLog,existingSchedule));
      const clean=raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim();
      conv.current=[{role:"user",content:"Run the evening audit."},{role:"assistant",content:raw}];
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
          if(u.lastSleepTime)np.lastSleepTime=u.lastSleepTime;
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
          const newStreak=entry.punishments===0&&entry.completed===entry.total?(profile.streak||0)+1:0;
          const np={...profile,streak:newStreak};
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

  return(
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      <Header mode={mode} streak={profile.streak||0} examMode={profile.examMode||null}/>
      <ScheduleList blocks={schedule}/>
      <ChatFeed messages={messages} loading={loading} feedRef={feedRef}/>
      <InputBar value={input} onChange={setInput} onSend={send} disabled={loading} mode={mode}/>
    </div>
  );
}

export default function App(){
  const [state,setState]=useState(null);
  useEffect(()=>{sGet(SK.profile).then(p=>setState(p&&p.name?p:false));},[]);
  async function handleSetup(p){await sSet(SK.profile,p);setState(p);}
  if(state===null)return <div style={{height:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#222",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Loading…</div></div>;
  if(state===false)return <Setup onComplete={handleSetup}/>;
  return <MainScreen profile={state}/>;
}