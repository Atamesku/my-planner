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

// ── Colours ────────────────────────────────────────────
const C={
  bg:"#0f0e0c",
  surface:"#161410",
  border:"#2a2520",
  borderLight:"#1e1c18",
  accent:"#c8922a",
  accentDim:"#7a5518",
  accentFaint:"#2a1f0a",
  text:"#e8e0d0",
  textMid:"#8a7e6a",
  textDim:"#4a4238",
  textFaint:"#2a2520",
  study:"#1a1800",
  studyBorder:"#3a3200",
  routine:"#0e1410",
  routineBorder:"#1a2a1a",
  meal:"#0e0e1a",
  mealBorder:"#1a1a3a",
  movement:"#0a1410",
  movementBorder:"#153020",
  free:"#140e18",
  freeBorder:"#2a1a30",
  sleep:"#100e18",
  sleepBorder:"#20183a",
};

const ONBOARDING_SYSTEM="You are a strict mentor interviewing a new user to build their optimised daily schedule.\n\n"+
"Ask questions conversationally, 1-2 at a time maximum. Never dump all questions at once.\n"+
"Listen carefully to each answer before asking the next question.\n"+
"Adapt your questions based on their answers — if they say they have no routine, don't ask what their routine looks like.\n\n"+
"COVER THESE AREAS IN ORDER:\n\n"+
"1. BASICS\n"+
"   - Name\n"+
"   - What time do they naturally wake up without an alarm?\n"+
"   - What time do they usually sleep?\n\n"+
"2. ENERGY\n"+
"   - When do they feel sharpest mentally — morning, afternoon, or evening?\n"+
"   - When do they hit their lowest energy point?\n"+
"   - How long can they focus before needing a real break?\n\n"+
"3. FIXED COMMITMENTS\n"+
"   - What classes, lectures, or work shifts do they have and when?\n"+
"   - Any recurring commitments or responsibilities at home?\n"+
"   - How much travel time between places?\n\n"+
"4. PREDICTABILITY (critical for buffer planning)\n"+
"   - How consistent are their days — do they follow a pattern or does something always come up?\n"+
"   - How often do random events hijack their day — daily, a few times a week, rarely?\n"+
"   - When something unexpected happens, does it come with notice the night before or appear same-day?\n"+
"   - Are certain days reliably chaotic vs reliably stable?\n\n"+
"5. STUDY & SUBJECTS\n"+
"   - What subjects are they currently taking?\n"+
"   - Which is their weakest right now?\n"+
"   - Any upcoming exams or deadlines?\n\n"+
"6. HABITS & BLOCKERS\n"+
"   - What is their biggest time waster right now?\n"+
"   - What usually stops them from following a schedule?\n"+
"   - Do they have any current morning or night routine?\n\n"+
"7. PHYSICAL\n"+
"   - Do they exercise at all currently? What and when?\n"+
"   - What are their usual meal times?\n\n"+
"8. LIFE\n"+
"   - Any hobbies or things they do regularly?\n"+
"   - Anything else about their life I should factor into their schedule?\n\n"+
"PREDICTABILITY RULES — use answers to set buffer level:\n"+
"High predictability (days mostly consistent, rare surprises) → tight schedule, minimal buffer\n"+
"Medium predictability (something comes up a few times a week) → 15-30min buffers between major blocks\n"+
"Low predictability (daily chaos, same-day surprises) → loose structure, only non-negotiables locked, everything else flexible\n"+
"Day-specific chaos (e.g. Tuesdays always blow up) → those days get lighter loads by default\n\n"+
"When you have collected ALL the information, output ONLY:\n"+
"<PROFILE>\n"+
"{\"name\":\"\",\"wakeTime\":\"\",\"sleepTime\":\"\",\"peakEnergy\":\"\",\"lowEnergy\":\"\",\"focusDuration\":25,\"subjects\":[],\"weakestSubject\":\"\",\"fixedEvents\":[{\"day\":\"\",\"time\":\"\",\"end\":\"\",\"title\":\"\"}],\"predictability\":\"high|medium|low\",\"chaoticDays\":[],\"bufferMins\":15,\"biggestBlocker\":\"\",\"timeWaster\":\"\",\"exercises\":false,\"hobbies\":[],\"mealTimes\":{\"breakfast\":\"\",\"lunch\":\"\",\"dinner\":\"\"},\"notes\":\"\"}\n"+
"</PROFILE>\n\n"+
"Before outputting the profile, tell them: 'I have everything I need. Here is what I am going to build for you:' and give a 3-4 sentence summary of the schedule structure you will create based on their answers. Then ask: 'Does this sound right or is there anything to adjust?' Wait for confirmation before outputting the profile tag.";

"TIER 1 (assign daily):\n"+
"- Active Recall: test yourself, no notes. Assign as: Close everything. Write all you know about [topic] from memory.\n"+
"- Spaced Repetition: revisit yesterday's material 10min before new content. Always.\n"+
"- Practice Tests: past papers or problems under timed conditions. Non-negotiable for maths.\n"+
"- Blurting: end of each study block, dump everything learned onto blank paper without looking.\n\n"+
"TIER 2 (assign 3-4x per week):\n"+
"- Feynman Technique: explain in simple language as if teaching a 10-year-old. Cannot explain = do not understand.\n"+
"- Interleaved Practice: mix topics within one session. Harder but more effective than blocked practice.\n"+
"- Active Note-Taking: handwritten, rephrased in own words, never copied verbatim.\n\n"+
"TIER 3 (new material or review):\n"+
"- SQ3R: Survey Question Read Recite Review. For new textbook chapters.\n"+
"- Mind Mapping: visual diagram of connections. Use at start of a topic.\n"+
"- Concept Mapping: draw connections between existing ideas. Use at end of a topic.\n\n"+
"RULES: Always specify technique with the task. Never assign passive methods. Maths default: practice problems + active recall + spaced repetition every session.";

const STUDY_TECHNIQUES="STUDY TECHNIQUES — assign by priority tier:\n\n"+
"Day 7: Stop new material. List every weak area. Hit list only. Active recall + blurting.\n"+
"Day 6-5: Work through hit list exclusively. Feynman every weak concept.\n"+
"Day 4-3: Full past papers timed. Mark ruthlessly. Build error log.\n"+
"Day 2: Error log only. Redo every mistake from scratch. Fix reasoning.\n"+
"Day 1: 30min light review max. Sleep, food, walk. 10min next-day prep block.\n"+
"Exam day: Normal morning routine. Good breakfast. No cramming. Arrive early.\n\n"+
"Sleep protected harder this week. Free time slightly reduced on simulation days but never eliminated.";

const EXAM_RITUAL="EXAM RITUAL — when exam is within 7 days. Routines and habits stay identical. Only study blocks change.\n\n"+
"CONTROLLABLE = PUNISHMENT. UNCONTROLLABLE = LEGITIMATE.\n"+
"Controllable: poor time management, avoidance, bad choices, social calls they could decline, tiredness from bad sleep or phone use.\n"+
"Uncontrollable: genuine emergencies, family crises, medical issues, fatigue from a genuinely hard day of classes or work.\n"+
"Test: could they have prevented this with better planning or discipline? Yes = punish. No = legitimate.\n\n"+
"REWARDS: 30min free time per completed study block. Streak milestones at 3/7/14/30 days. Lighter load after 3 perfect days.\n"+
"PUNISHMENTS: Missed task carried over before any free time. 30min free time removed per controllable miss. Extra task assigned one level harder. Streak reset to zero.\n\n"+
"LIFE HABITS:\n"+
"Morning: water, brush teeth, wash face, shower, get dressed, breakfast — in order, phone last.\n"+
"Meals: all three daily, correct windows, no phone. Movement: 15min walk minimum. Sleep: consistent time, wind-down 30min before, phone away.\n\n"+
"BAD HABITS (reduce progressively, never eliminate overnight):\n"+
"Phone in protected windows. Procrastination. Passive study. Skipping meals. Irregular sleep. Skipping hygiene.\n"+
"Never stack new habits until current ones are stable 3+ days.";

function buildMorningPrompt(profile,log){
  const name=(profile&&profile.name)||"there";
  const subjects=(profile&&profile.subjects&&profile.subjects.length)?profile.subjects.join(", "):"not yet specified";
  const streak=(profile&&profile.streak)||0;
  const examMode=(profile&&profile.examMode)||null;
  const recentLog=(log||[]).slice(-5);
  const logStr=recentLog.length?recentLog.map(l=>"  "+l.date+": "+l.completed+"/"+l.total+" tasks, punishments="+l.punishments+", streak="+l.streak).join("\n"):"  No history yet.";
  const examNote=examMode?"EXAM MODE ACTIVE: "+examMode.exam+" in "+examMode.daysOut+" days. Ritual day "+examMode.ritualDay+". Apply exam ritual protocol to study blocks.":"";
  return "You are a strict mentor for "+name+". Time: "+timeStr()+". Date: "+dateStr()+".\n\n"+
    MENTOR_RULES+"\n\n"+STUDY_TECHNIQUES+"\n\n"+EXAM_RITUAL+"\n\n"+
    "USER: "+name+" | Subjects: "+subjects+" | Streak: "+streak+" days.\n"+(examNote?examNote+"\n":"")+
    "RECENT HISTORY:\n"+logStr+"\n\n"+
    "BUILD FULL DAY SCHEDULE:\n"+
    "Include every day: wake, morning routine (water/brush/shower/dress/breakfast/phone last), study blocks, lunch, movement, dinner, free time, night routine, sleep.\n"+
    "Study blocks: specific subject + topic + quantity + technique from tier list. Hard tasks first. Streak gates load (0-2=light, 3-6=moderate, 7+=full).\n"+
    "Parse the user's message. Extract everything. Build from NOW ("+timeStr()+"). Ask ONE question only if something critical is missing.\n"+
    "If user mentions exam and days away: activate exam mode in profile update.\n\n"+
    "Output clean readable schedule first, then:\n"+
    "<SCHEDULE>[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"Task\",\"type\":\"routine|study|meal|movement|free|fixed|sleep\",\"instruction\":\"technique + specific task\"}]</SCHEDULE>\n"+
    "<PROFILE_UPDATE>{\"subjects\":[],\"lastWakeTime\":\"\",\"lastSleepTime\":\"\",\"examMode\":null}</PROFILE_UPDATE>";
}

function buildAuditPrompt(profile,log,schedule){
  const name=(profile&&profile.name)||"you";
  const streak=(profile&&profile.streak)||0;
  const tasks=(schedule||[]).filter(b=>b.type!=="sleep"&&b.type!=="free");
  const taskList=tasks.length?tasks.map((t,i)=>"  "+(i+1)+". "+t.time+" — "+t.title+(t.instruction?" | "+t.instruction:"")).join("\n"):"  No tasks recorded.";
  const recentLog=(log||[]).slice(-7);
  const patterns=detectPatterns(recentLog);
  return "Auditing "+name+"'s day. Streak: "+streak+" days.\n\n"+
    MENTOR_RULES+"\n\n"+
    "LEGITIMACY: Controllable=punish. Uncontrollable=legitimate. Tired from hard day=legitimate. Tired from bad choices=punish.\n\n"+
    "TODAY'S TASKS:\n"+taskList+"\n\n"+
    (patterns.length?"PATTERNS:\n"+patterns.map(p=>"  - "+p).join("\n")+"\n\n":"")+
    "Ask them to report each task. For each miss: get reason, apply legitimacy test, deliver consequence or accept.\n"+
    "Deliver rewards for completions. Name patterns. State exactly what changes tomorrow.\n"+
    "Direct. Specific. No softening on controllable misses.\n\n"+
    "<AUDIT>{\"date\":\""+todayStr()+"\",\"completed\":0,\"total\":"+tasks.length+",\"punishments\":0,\"rewards\":0,\"streak\":"+streak+",\"notes\":\"\"}</AUDIT>";
}

function buildCoachPrompt(profile,schedule){
  const name=(profile&&profile.name)||"you";
  const ctx=(schedule||[]).map((b,i)=>"["+i+"] "+b.time+"-"+b.end+" "+b.title).join(" | ");
  return "Strict mentor for "+name+". Streak: "+(profile&&profile.streak||0)+" days.\n"+
    MENTOR_RULES+"\nSchedule: "+ctx+"\nTime: "+timeStr()+"\n"+
    "Max 3 sentences. Direct. Apply legitimacy test immediately to any excuse.\n"+
    "SCHEDULE_UPDATE:{\"index\":<n>,\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"...\",\"instruction\":\"...\"}\nREBUILD_NEEDED if major change.";
}

function detectPatterns(logs){
  if(!logs||!logs.length)return [];
  const p=[]; const l3=logs.slice(-3);
  if(l3.length>=3&&l3.every(l=>l.punishments>0)) p.push("Punishments 3+ days — reassess load or scheduling.");
  if(l3.length>=3&&l3.every(l=>l.completed<l.total)) p.push("Incomplete days 3+ — avoidance or overloading.");
  if(logs.filter(l=>l.notes&&l.notes.toLowerCase().includes("phone")).length>=3) p.push("Phone violations recurring — enforce strictly.");
  if(l3.length>=3&&l3.every(l=>l.streak===0)) p.push("Streak not building — consistency is the only target.");
  return p;
}

// ── Components ─────────────────────────────────────────
function Header({mode,streak,examMode}){
  const [now,setNow]=useState(timeStr());
  useEffect(()=>{const t=setInterval(()=>setNow(timeStr()),1000);return()=>clearInterval(t);},[]);
  const modeLabel={morning:"Morning",executing:"Executing",audit:"Audit"};
  const modeColor={morning:C.accentFaint,executing:"#0a120a",audit:"#120a10"};
  return(
    <div style={{background:modeColor[mode],borderBottom:"1px solid "+C.border,padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>{modeLabel[mode]}</div>
          <div style={{color:C.textDim,fontSize:11,marginTop:2}}>{dateStr()}</div>
        </div>
        {examMode&&(
          <div style={{background:"#2a1000",border:"1px solid #5a2a00",borderRadius:4,padding:"3px 8px",fontSize:9,color:"#c86420",letterSpacing:1,textTransform:"uppercase"}}>
            EXAM {examMode.daysOut}d
          </div>
        )}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        {streak>0&&(
          <div style={{background:C.accentFaint,border:"1px solid "+C.accentDim,borderRadius:4,padding:"3px 8px",fontSize:11,color:C.accent}}>
            🔥 {streak}
          </div>
        )}
        <div style={{color:C.text,fontSize:22,fontWeight:700,fontVariantNumeric:"tabular-nums",fontFamily:"monospace"}}>{now}</div>
      </div>
    </div>
  );
}

function ScheduleBlock({block,state}){
  const isCur=state==="current",isPast=state==="past";
  const typeStyle={
    routine:{bg:C.routine,border:C.routineBorder,label:"ROUTINE",lc:"#2a4a2a"},
    study:{bg:C.study,border:C.studyBorder,label:"STUDY",lc:C.accentDim},
    meal:{bg:C.meal,border:C.mealBorder,label:"MEAL",lc:"#2a2a5a"},
    movement:{bg:C.movement,border:C.movementBorder,label:"MOVE",lc:"#1a3a2a"},
    free:{bg:C.free,border:C.freeBorder,label:"FREE",lc:"#3a2a4a"},
    fixed:{bg:"#0e0e14",border:"#2a2a3a",label:"FIXED",lc:"#2a2a4a"},
    sleep:{bg:C.sleep,border:C.sleepBorder,label:"SLEEP",lc:"#2a2040"},
  }[block.type]||{bg:"transparent",border:C.borderLight,label:"",lc:C.textDim};

  return(
    <div style={{padding:isCur?"9px 12px":"6px 12px",borderRadius:6,marginBottom:2,background:isCur?"#1e1c18":typeStyle.bg,borderLeft:"2px solid "+(isCur?C.accent:typeStyle.border),opacity:isPast?0.25:1,transition:"opacity 0.2s"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:isCur?C.textMid:C.textDim,fontSize:10,minWidth:85,fontVariantNumeric:"tabular-nums",fontFamily:"monospace",flexShrink:0}}>{block.time}–{block.end}</span>
        <span style={{color:isCur?C.text:isPast?C.textDim:"#c8c0b0",fontSize:isCur?13:12,fontWeight:isCur?600:400,flex:1,lineHeight:1.3}}>{block.title}</span>
        {isCur&&<span style={{background:C.accent,color:"#000",fontSize:8,fontWeight:700,letterSpacing:1,padding:"2px 6px",borderRadius:3,flexShrink:0}}>NOW</span>}
        {!isCur&&!isPast&&typeStyle.label&&<span style={{color:typeStyle.lc,fontSize:8,letterSpacing:1,flexShrink:0}}>{typeStyle.label}</span>}
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
          <div style={{padding:"20px 12px",color:C.textFaint,fontSize:11,textAlign:"center",lineHeight:1.6}}>
            No schedule yet.<br/>Tell the mentor about your day.
          </div>
        ):blocks.map((b,i)=>(
          <div key={i} data-idx={i}>
            <ScheduleBlock block={b} state={i===ci?"current":i<ci?"past":"future"}/>
          </div>
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
      {!messages.length&&(
        <div style={{margin:"auto",textAlign:"center",color:C.textFaint,fontSize:12,lineHeight:1.8}}>
          Your mentor is ready.<br/>Tell them about your day.
        </div>
      )}
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

function InputBar({value,onChange,onSend,disabled,mode}){
  const ph={morning:"Tell me about your day…",executing:"Talk to your mentor…",audit:"Report what you completed…"}[mode];
  return(
    <div style={{borderTop:"1px solid "+C.border,padding:"12px 20px",background:C.surface,display:"flex",gap:10,flexShrink:0}}>
      <input
        style={{flex:1,background:C.bg,border:"1px solid "+C.border,borderRadius:8,color:C.text,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit",transition:"border 0.2s"}}
        placeholder={ph} value={value} onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey)onSend();}} disabled={disabled}
        onFocus={e=>e.target.style.borderColor=C.accentDim}
        onBlur={e=>e.target.style.borderColor=C.border}
      />
      <button onClick={onSend} disabled={disabled} style={{background:disabled?C.accentFaint:C.accent,color:"#000",border:"none",borderRadius:8,width:44,fontSize:16,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,transition:"all 0.2s",flexShrink:0}}>↑</button>
    </div>
  );
}

function Onboarding({onComplete}){
  const [messages,setMessages]=useState([{role:"ai",text:"Let's build your schedule properly. I'm going to ask you a few questions so I can optimise it around how you actually live — not just a generic template.\n\nLet's start simple: what's your name?"}]);
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
      const body={model:"claude-sonnet-4-5",max_tokens:800,system:ONBOARDING_SYSTEM,messages:conv.current};
      const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();
      const raw=d.content?d.content.map(c=>c.text||"").join(""):"";
      conv.current=[...conv.current,{role:"assistant",content:raw}];
      const profileMatch=raw.match(/<PROFILE>([\s\S]*?)<\/PROFILE>/);
      if(profileMatch){
        try{
          const p=JSON.parse(profileMatch[1].trim());
          p.streak=0;p.punishments=0;p.examMode=null;
          await sSet(SK.profile,p);
          onComplete(p);return;
        }catch(e){console.error(e);}
      }
      const clean=raw.replace(/<PROFILE>[\s\S]*?<\/PROFILE>/g,"").trim();
      setMessages(m=>[...m,{role:"ai",text:clean}]);
    }catch(e){setMessages(m=>[...m,{role:"ai",text:"Connection error. Try again."}]);}
    setLoading(false);
  }

  return(
    <div style={{height:"100vh",background:C.bg,display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif"}}>
      <div style={{padding:"16px 20px",borderBottom:"1px solid "+C.border,background:C.surface,flexShrink:0}}>
        <div style={{color:C.accent,fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Mentor System</div>
        <div style={{color:C.textMid,fontSize:12,marginTop:3}}>Building your optimised schedule</div>
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
          <button onClick={send} disabled={loading} style={{background:disabled=>disabled?C.accentFaint:C.accent,background:C.accent,color:"#000",border:"none",borderRadius:8,width:44,fontSize:16,fontWeight:700,cursor:"pointer",opacity:loading?0.5:1}}>↑</button>
        </div>
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

  return(
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column"}}>
      <Header mode={mode} streak={profile.streak||0} examMode={profile.examMode||null}/>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <SchedulePanel blocks={schedule}/>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <ChatPanel messages={messages} loading={loading} feedRef={feedRef}/>
          <InputBar value={input} onChange={setInput} onSend={send} disabled={loading} mode={mode}/>
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const [state,setState]=useState(null);
  useEffect(()=>{sGet(SK.profile).then(p=>setState(p&&p.name?p:false));},[]);
  async function handleSetup(p){await sSet(SK.profile,p);setState(p);}
  if(state===null)return <div style={{height:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:C.textDim,fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Loading…</div></div>;
  if(state===false)return <Onboarding onComplete={handleSetup}/>;
  return <MainScreen profile={state}/>;
}