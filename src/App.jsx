import { useState, useEffect, useRef } from "react";

const CLAUDE_API="/api/generate";
const GROQ_API="/api/groq";

function todayStr(){return new Date().toDateString();}
function timeStr(){return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});}
function dateStr(){return new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});}
function getMode(){
  const h=new Date().getHours();
  return h<12?"morning":h<20?"executing":"audit";
}
function isLateNight(){
  const h=new Date().getHours();
  return h>=20;
}
function toMins(t){const [h,m]=t.split(":").map(Number);return h*60+m;}
function nowMins(){const n=new Date();return n.getHours()*60+n.getMinutes();}
function getCurIdx(blocks){const now=nowMins();let idx=-1;for(let i=0;i<blocks.length;i++){if(toMins(blocks[i].time)<=now)idx=i;else break;}return idx;}
function getMondayStr(){const d=new Date();const day=d.getDay();d.setDate(d.getDate()-(day===0?6:day-1));return d.toDateString();}
function dayOfWeek(){return new Date().toLocaleDateString([],{weekday:"long"});}

const SK={profile:"cv5_profile",schedule:"cv5_schedule",log:"cv5_log"};
const mem={};
async function sGet(key){
  try{
    if(mem[key]!==undefined)return mem[key];
    const r=await fetch("/api/memory?key="+encodeURIComponent(key));
    const d=await r.json();
    const val=d.value?JSON.parse(d.value):null;
    mem[key]=val;return val;
  }catch(e){console.error("sGet",e);return null;}
}
async function sSet(key,val){
  mem[key]=val;
  try{await fetch("/api/memory",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,value:JSON.stringify(val)})});}
  catch(e){console.error("sSet",e);}
}

const C={
  bg:"#0f0e0c",surface:"#161410",border:"#2a2520",borderLight:"#1e1c18",
  accent:"#c8922a",accentDim:"#7a5518",accentFaint:"#2a1f0a",
  text:"#e8e0d0",textMid:"#8a7e6a",textDim:"#4a4238",textFaint:"#2a2520",
  study:"#1a1800",studyBorder:"#3a3200",
  routine:"#0e1410",routineBorder:"#1a2a1a",
  meal:"#0e0e1a",mealBorder:"#1a1a3a",
  movement:"#0a1410",movementBorder:"#153020",
  free:"#140e18",freeBorder:"#2a1a30",
  sleep:"#100e18",sleepBorder:"#20183a",
  buffer:"#141210",bufferBorder:"#2a2418",
};

const ONBOARDING_SYSTEM="You are a strict accountability coach designing a bedrock schedule for a new user. Your job: learn about their life, design a realistic schedule, let them tweak it, then lock it in as their bedrock.\n\nPHASE 1 - LEARN (ask one question at a time):\n1. Name\n2. Wake time and sleep time (what they actually do, not ideal)\n3. Peak energy window — when are they sharpest?\n4. Fixed commitments — classes, work, anything immovable\n5. What subjects or work they need to do regularly\n6. Bad habits — what works against them? For each: get baseline (e.g. hours on phone, sleep time). Set first target 10-30% better than baseline, never jump to perfect.\n7. Anything else relevant\n\nPHASE 2 - DESIGN:\nOnce you have enough info, design a full bedrock schedule. This is a daily template — the non-negotiable foundation that repeats every day.\nInclude: wake, morning routine (water brush shower dress breakfast), study blocks in peak window, meals, movement, free time, night routine, sleep.\nBe realistic — do not overload. Start conservative. User can always add more later.\nPresent it clearly as a list: TIME — BLOCK — DURATION.\n\nPHASE 3 - REFINE:\nAfter presenting, ask: What do you want to change, remove, or lock in as non-negotiable?\nMake changes based on their feedback. Repeat until they confirm.\n\nPHASE 4 - CONFIRM:\nOnce confirmed output ONLY:\n<PROFILE>\n{\"name\":\"\",\"wakeTime\":\"\",\"sleepTime\":\"\",\"peakEnergy\":\"\",\"phase\":1,\"phaseStartDate\":\"\",\"lastBedrockReview\":\"\",\"examMode\":null,\"streak\":0,\"habits\":[{\"name\":\"\",\"baseline\":\"\",\"target\":\"\",\"unit\":\"\",\"streak\":0}],\"bedrock\":[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"\",\"type\":\"routine|study|meal|movement|free|sleep\"}],\"weeklyReflectionDue\":\"\",\"bedrockReviewDue\":\"\"}\n</PROFILE>";

const ENFORCE_RULES="You are a strict accountability coach. You designed this person's bedrock schedule. Your job is to enforce it and help them build discipline.\n\nCONTROLLABLE=PUNISHMENT. UNCONTROLLABLE=LEGITIMATE.\nControllable: poor time management, avoidance, low motivation, social calls they could decline, tiredness from bad choices.\nUncontrollable: genuine emergencies, family crises, medical issues, fatigue from a genuinely hard day of classes or work.\nTest: could they have prevented this? Yes=punish. No=legitimate.\n\nPUNISHMENTS: missed block carries over tomorrow before free time. 30min free time removed per miss. Call it out by name.\nREWARDS: acknowledge streaks at 3, 7, 14, 30 days. Lighter tone when consistent.\n\nHABIT TRACKING: streak +1 when target hit. Every 3 days consistent = tighten target 15%. Fail = reset to baseline.\n\nPHASE RULES:\nPhase 1 (days 1-14): coach builds schedule daily, enforces bedrock, tracks habits.\nPhase 2 (day 15+): coach is accountability only. No more daily schedule building unless requested. User owns their schedule.\nHandoff message at day 14: tell them they are ready to own their schedule in Excel.\n\nEXAM MODE: when active, shift audit questions to exam prep. Follow 7-day ritual: Day 7=audit weak areas, Day 6-5=targeted repair, Day 4-3=timed past papers+error log, Day 2=error correction only, Day 1=light review+rest.\n\nPATTERN DETECTION: after 3+ days of same failure, name it specifically. Flag day-specific patterns.\n\nBEDROCK REVIEW: every 21 days, prompt user to review commitments. They decide what changes.\n\nWEEKLY REFLECTION: every Monday, ask how the week went. One pattern. One suggestion.\n\nMax 3 sentences in casual chat. Direct. Push back on weak excuses immediately.";

function buildDayPrompt(profile,log){
  const streak=profile.streak||0;
  const bedrock=(profile.bedrock||[]).map(b=>b.time+"-"+b.end+" "+b.title).join(", ");
  const habits=(profile.habits||[]).map(h=>h.name+": target "+h.target+" "+h.unit+" (streak "+h.streak+"d)").join("; ")||"none";
  const recent=(log||[]).slice(-5).map(l=>l.date+": "+l.completed+"/"+l.total+" done, "+l.punishments+" punishments, streak "+l.streak).join(" | ")||"no history";
  const phase=profile.phase||1;
  const examMode=profile.examMode;
  const patterns=detectPatterns((log||[]).slice(-7));
  const examNote=examMode?"EXAM MODE: "+examMode.name+" in "+examMode.daysOut+" days. Today is ritual day "+(8-examMode.daysOut)+". Apply exam ritual protocol to study blocks.":"";
  return "Accountability coach for "+profile.name+". Time: "+timeStr()+". Date: "+dateStr()+".\n"+
    ENFORCE_RULES+"\n\n"+
    "BEDROCK: "+bedrock+"\n"+
    "HABITS: "+habits+"\n"+
    "STREAK: "+streak+" days. Phase: "+phase+".\n"+
    "HISTORY: "+recent+"\n"+
    (patterns.length?"PATTERNS: "+patterns.join(" | ")+"\n":"")+
    (examNote?examNote+"\n":"")+
    "\nBuild today's schedule from NOW ("+timeStr()+") until sleep.\n"+
    "Place each bedrock block at its time. Fill gaps with free time or buffer.\n"+
    "Study blocks: specific subject + topic + active method (never passive).\n"+
    (phase>=2?"This is Phase 2 — only build if explicitly requested. Otherwise just confirm bedrock is loaded.\n":"")+
    "Output readable schedule first, then:\n"+
    "<SCHEDULE>[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"Block\",\"type\":\"routine|study|meal|movement|free|sleep|buffer\",\"instruction\":\"details or none\"}]</SCHEDULE>";
}

function buildAuditPrompt(profile,log,schedule){
  const streak=profile.streak||0;
  const phase=profile.phase||1;
  const bedrock=(profile.bedrock||[]).map((b,i)=>(i+1)+". "+b.time+" "+b.title).join("\n")||"none";
  const habits=(profile.habits||[]).map(h=>h.name+": target "+h.target+" "+h.unit+", streak "+h.streak+"d").join("\n")||"none";
  const patterns=detectPatterns((log||[]).slice(-7));
  const isMonday=dayOfWeek()==="Monday";
  const reviewDue=profile.bedrockReviewDue&&new Date()>=new Date(profile.bedrockReviewDue);
  const examMode=profile.examMode;
  const daysInPhase1=Math.floor((new Date()-new Date(profile.phaseStartDate||todayStr()))/(1000*60*60*24));
  const handoff=phase===1&&daysInPhase1>=14;
  return "Auditing "+profile.name+"'s day. Streak: "+streak+"d. Phase: "+phase+".\n"+
    ENFORCE_RULES+"\n\n"+
    "BEDROCK:\n"+bedrock+"\n\n"+
    "HABITS:\n"+habits+"\n\n"+
    (patterns.length?"PATTERNS:\n"+patterns.map(p=>"- "+p).join("\n")+"\n\n":"")+
    (examMode?"EXAM MODE: "+examMode.name+" in "+examMode.daysOut+" days. Focus audit on exam prep.\n\n":"")+
    (isMonday?"TODAY IS MONDAY: Start with a brief weekly reflection — how did last week go? One pattern. One suggestion.\n\n":"")+
    (reviewDue?"BEDROCK REVIEW DUE: Ask if their commitments still make sense. Let them decide what changes.\n\n":"")+
    (handoff?"HANDOFF: User has been in Phase 1 for 14+ days. Tell them they are ready to own their schedule. Explain Phase 2.\n\n":"")+
    "Ask them to report against each bedrock block. For each miss: get reason, apply controllable test, punish or accept.\n"+
    "Ask about each habit — did they hit their target?\n"+
    "State exactly what changes tomorrow.\n\n"+
    "<AUDIT>{\"date\":\""+todayStr()+"\",\"completed\":0,\"total\":"+(profile.bedrock||[]).length+",\"punishments\":0,\"streak\":"+streak+",\"habitUpdates\":[],\"advancePhase\":false,\"notes\":\"\"}</AUDIT>";
}

function buildCoachPrompt(profile,schedule){
  const bedrock=(profile.bedrock||[]).map(b=>b.time+" "+b.title).join(", ");
  const habits=(profile.habits||[]).map(h=>h.name+" target "+h.target+h.unit).join(", ");
  const ctx=(schedule||[]).map((b,i)=>"["+i+"] "+b.time+"-"+b.end+" "+b.title).join(" | ");
  const examMode=profile.examMode;
  const fixedEvents=(profile.fixedEvents||[]).map(e=>e.day+" "+e.time+" "+e.title).join(", ")||"none";
  return "Accountability coach for "+(profile.name||"user")+". Streak: "+(profile.streak||0)+"d. Phase: "+(profile.phase||1)+".\n"+
    ENFORCE_RULES+"\n"+
    "Bedrock: "+bedrock+"\nHabits: "+habits+"\nFixed events: "+fixedEvents+"\n"+
    (examMode?"Exam mode: "+examMode.name+" in "+examMode.daysOut+" days.\n":"")+
    "Schedule: "+ctx+"\nTime: "+timeStr()+"\n"+
    "Max 3 sentences. Push back on excuses immediately.\n\n"+
    "IMPORTANT — PROFILE UPDATES:\n"+
    "If the user tells you anything new about their life (work days, class times, fixed events, new habits, schedule changes) — capture it and output:\n"+
    "PROFILE_UPDATE:{\"fixedEvents\":[{\"day\":\"monday\",\"time\":\"HH:MM\",\"title\":\"Work\"}],\"notes\":\"anything else learned\"}\n"+
    "Always output this when you learn something new. Never silently discard information.\n\n"+
    "If user says they have an exam and days away: EXAM_MODE:{\"name\":\"subject\",\"daysOut\":7}\n"+
    "SCHEDULE_UPDATE:{\"index\":<n>,\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"...\",\"instruction\":\"...\"}\n"+
    "HABIT_HIT:<name> or HABIT_MISS:<name>\n"+
    "REBUILD_NEEDED if major change or user asks to build/rebuild schedule.\n"+
    "BEDROCK_UPDATE:[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"\",\"type\":\"\"}] if user wants to change bedrock.";
}

function detectPatterns(logs){
  if(!logs||!logs.length)return [];
  const p=[],l3=logs.slice(-3);
  if(l3.length>=3&&l3.every(l=>l.punishments>0))p.push("Punishments 3 days running — check if bedrock is realistic");
  if(l3.length>=3&&l3.every(l=>l.completed<l.total))p.push("Incomplete 3+ days — avoidance pattern forming");
  if(l3.length>=3&&l3.every(l=>l.streak===0))p.push("Streak at zero — focus on single most important block only");
  const dayMap={};
  logs.forEach(l=>{if(l.completed<l.total){const d=new Date(l.date).toLocaleDateString([],{weekday:"long"});dayMap[d]=(dayMap[d]||0)+1;}});
  Object.entries(dayMap).forEach(([day,count])=>{if(count>=2)p.push(day+" is a recurring problem day");});
  return p;
}

function Header({mode,streak,phase,examMode}){
  const [now,setNow]=useState(timeStr());
  useEffect(()=>{const t=setInterval(()=>setNow(timeStr()),1000);return()=>clearInterval(t);},[]);
  const modeLabel={morning:"Morning",executing:"Executing",audit:"Audit"};
  const modeBg={morning:C.accentFaint,executing:"#0a120a",audit:"#120a10"};
  return(
    <div style={{background:modeBg[mode],borderBottom:"1px solid "+C.border,padding:"13px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>{modeLabel[mode]}</div>
          <div style={{color:C.textDim,fontSize:11,marginTop:2}}>{dateStr()}</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <div style={{background:"#1a1400",border:"1px solid "+C.accentDim,borderRadius:3,padding:"2px 7px",fontSize:9,color:C.accentDim,letterSpacing:1}}>{"P"+phase}</div>
          {examMode&&<div style={{background:"#2a1000",border:"1px solid #5a2a00",borderRadius:3,padding:"2px 7px",fontSize:9,color:"#c86420",letterSpacing:1}}>{"EXAM "+examMode.daysOut+"d"}</div>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        {streak>0&&<div style={{background:C.accentFaint,border:"1px solid "+C.accentDim,borderRadius:4,padding:"3px 8px",fontSize:11,color:C.accent}}>{"🔥"+streak}</div>}
        <div style={{color:C.text,fontSize:21,fontWeight:700,fontVariantNumeric:"tabular-nums",fontFamily:"monospace"}}>{now}</div>
      </div>
    </div>
  );
}

function ScheduleBlock({block,state}){
  const isCur=state==="current",isPast=state==="past";
  const ts={routine:{bg:C.routine,bl:C.routineBorder,lbl:"ROUTINE"},study:{bg:C.study,bl:C.studyBorder,lbl:"STUDY"},meal:{bg:C.meal,bl:C.mealBorder,lbl:"MEAL"},movement:{bg:C.movement,bl:C.movementBorder,lbl:"MOVE"},free:{bg:C.free,bl:C.freeBorder,lbl:"FREE"},sleep:{bg:C.sleep,bl:C.sleepBorder,lbl:"SLEEP"},buffer:{bg:C.buffer,bl:C.bufferBorder,lbl:""}}[block.type]||{bg:"transparent",bl:C.borderLight,lbl:""};
  return(
    <div style={{padding:isCur?"9px 12px":"6px 12px",borderRadius:6,marginBottom:2,background:isCur?"#1e1c18":ts.bg,borderLeft:"2px solid "+(isCur?C.accent:ts.bl),opacity:isPast?0.25:1}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:isCur?C.textMid:C.textDim,fontSize:10,minWidth:85,fontVariantNumeric:"tabular-nums",fontFamily:"monospace",flexShrink:0}}>{block.time}{"–"}{block.end}</span>
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
  useEffect(()=>{if(ref.current&&ci>=0){const els=ref.current.querySelectorAll("[data-idx]");if(els[ci])els[ci].scrollIntoView({block:"center",behavior:"smooth"});}},[ci,blocks.length]);
  return(
    <div style={{width:270,flexShrink:0,borderRight:"1px solid "+C.border,display:"flex",flexDirection:"column",background:C.surface}}>
      <div style={{padding:"9px 12px 6px",borderBottom:"1px solid "+C.borderLight,flexShrink:0}}>
        <span style={{color:C.textDim,fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>Bedrock Schedule</span>
      </div>
      <div ref={ref} style={{flex:1,overflowY:"auto",padding:"6px 4px"}}>
        {!blocks.length
          ?<div style={{padding:"20px 12px",color:C.textFaint,fontSize:11,textAlign:"center",lineHeight:1.8}}>Building…</div>
          :blocks.map((b,i)=><div key={i} data-idx={i}><ScheduleBlock block={b} state={i===ci?"current":i<ci?"past":"future"}/></div>)
        }
      </div>
    </div>
  );
}

function MessageBubble({msg}){
  const isUser=msg.role==="user";
  return(
    <div style={{alignSelf:isUser?"flex-end":"flex-start",maxWidth:"80%"}}>
      {!isUser&&<div style={{color:C.accentDim,fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Coach</div>}
      <div style={{background:isUser?C.accentFaint:C.surface,border:"1px solid "+(isUser?C.accentDim:C.border),color:isUser?C.text:"#c0b8a8",fontSize:13,lineHeight:1.7,padding:"10px 14px",borderRadius:isUser?"8px 8px 2px 8px":"8px 8px 8px 2px",whiteSpace:"pre-wrap"}}>{msg.text}</div>
    </div>
  );
}

function ChatPanel({messages,loading,feedRef}){
  return(
    <div ref={feedRef} style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
      {!messages.length&&<div style={{margin:"auto",textAlign:"center",color:C.textFaint,fontSize:12,lineHeight:1.8}}>Your coach is ready.</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&<div style={{alignSelf:"flex-start"}}><div style={{color:C.accentDim,fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Coach</div><div style={{background:C.surface,border:"1px solid "+C.border,color:C.textMid,fontSize:13,padding:"10px 14px",borderRadius:"8px 8px 8px 2px"}}>…</div></div>}
    </div>
  );
}

function InputBar({value,onChange,onSend,disabled,placeholder}){
  return(
    <div style={{borderTop:"1px solid "+C.border,padding:"12px 20px",background:C.surface,display:"flex",gap:10,flexShrink:0}}>
      <input style={{flex:1,background:C.bg,border:"1px solid "+C.border,borderRadius:8,color:C.text,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit"}}
        placeholder={placeholder||"Talk to your coach…"} value={value}
        onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey)onSend();}}
        disabled={disabled}
        onFocus={e=>e.target.style.borderColor=C.accentDim}
        onBlur={e=>e.target.style.borderColor=C.border}/>
      <button onClick={onSend} disabled={disabled} style={{background:C.accent,color:"#000",border:"none",borderRadius:8,width:44,fontSize:16,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,flexShrink:0}}>↑</button>
    </div>
  );
}

function Onboarding({onComplete}){
  const [messages,setMessages]=useState([{role:"ai",text:"Let's build your bedrock. I'll learn about your life, design a schedule, and you tell me what stays and what changes.\n\nWhat's your name?"}]);
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
      const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:1000,system:ONBOARDING_SYSTEM,messages:conv.current})});
      const d=await r.json();
      const raw=d.content?d.content.map(c=>c.text||"").join(""):"";
      conv.current=[...conv.current,{role:"assistant",content:raw}];
      const match=raw.match(/<PROFILE>([\s\S]*?)<\/PROFILE>/);
      if(match){
        try{
          const p=JSON.parse(match[1].trim());
          p.phaseStartDate=todayStr();
          p.weeklyReflectionDue=getMondayStr();
          const reviewDate=new Date();reviewDate.setDate(reviewDate.getDate()+21);
          p.bedrockReviewDue=reviewDate.toDateString();
          await sSet(SK.profile,p);
          onComplete(p);return;
        }catch(e){console.error("profile parse",e);}
      }
      setMessages(m=>[...m,{role:"ai",text:raw.replace(/<PROFILE>[\s\S]*?<\/PROFILE>/g,"").trim()}]);
    }catch(e){setMessages(m=>[...m,{role:"ai",text:"Connection error. Try again."}]);}
    setLoading(false);
  }

  return(
    <div style={{height:"100vh",background:C.bg,display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif"}}>
      <div style={{padding:"16px 20px",borderBottom:"1px solid "+C.border,background:C.surface,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{color:C.accent,fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Coach</div><div style={{color:C.textMid,fontSize:12,marginTop:2}}>Designing your bedrock</div></div>
        <div style={{color:C.textDim,fontSize:11}}>{dateStr()}</div>
      </div>
      <div ref={feedRef} style={{flex:1,overflowY:"auto",padding:"20px",display:"flex",flexDirection:"column",gap:12,maxWidth:700,width:"100%",margin:"0 auto",boxSizing:"border-box"}}>
        {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
        {loading&&<div style={{alignSelf:"flex-start"}}><div style={{color:C.accentDim,fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Coach</div><div style={{background:C.surface,border:"1px solid "+C.border,color:C.textMid,fontSize:13,padding:"10px 14px",borderRadius:"8px 8px 8px 2px"}}>…</div></div>}
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
      if(l)setLog(l);
      const m=getMode();
      const alreadyAudited=l&&l.find(e=>e.date===todayStr());
      const tomorrow=(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.toDateString();})();
      const hasSchedule=s&&(s.date===todayStr()||s.date===tomorrow)&&s.blocks&&s.blocks.length;
      if(m==="audit"&&!alreadyAudited&&!isLateNight()){triggerAudit(l||[],s?s.blocks:[]);}
      else if(hasSchedule){setSchedule(s.blocks);setMessages([{role:"ai",text:"Schedule loaded. Stay on it."}]);}
      else if((initProfile.phase||1)===1){autoBuild(l||[]);}
      else{setMessages([{role:"ai",text:"Phase 2 — you own your schedule. Talk to me if you need anything."}]);}
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

  async function autoBuild(existingLog){
    setLoading(true);
    const buildingTomorrow=isLateNight();
    const targetDate=buildingTomorrow?(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.toDateString();})():todayStr();
    const targetDateStr=buildingTomorrow?(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});})():dateStr();
    setMessages([{role:"ai",text:buildingTomorrow?"Building tomorrow's schedule…":"Building your schedule…"}]);
    try{
      const prompt=buildingTomorrow
        ?"Build tomorrow's schedule ("+targetDateStr+"). Start from wake time. Use my bedrock and fixed events."
        :"Build today's schedule. Time: "+timeStr()+". Date: "+dateStr()+". Use my bedrock. Build from now until sleep.";
      const raw=await claudeCall([{role:"user",content:prompt}],buildDayPrompt(initProfile,existingLog));
      const sm=raw.match(/<SCHEDULE>([\s\S]*?)<\/SCHEDULE>/);
      if(sm){try{const bl=JSON.parse(sm[1].trim());setSchedule(bl);await sSet(SK.schedule,{date:targetDate,blocks:bl});}catch(e){console.error(e);}}
      const clean=raw.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g,"").trim();
      setMessages([{role:"ai",text:clean||(buildingTomorrow?"Tomorrow's schedule is set.":"Schedule built. Stay on it.")}]);
    }catch(e){console.error(e);setMessages([{role:"ai",text:"Failed to build. Talk to me."}]);}
    setLoading(false);
  }

  async function triggerAudit(el,es){
    setAuditStarted(true);setLoading(true);
    try{
      const raw=await claudeCall([{role:"user",content:"Run the evening audit."}],buildAuditPrompt(profile,el,es));
      conv.current=[{role:"user",content:"Run the evening audit."},{role:"assistant",content:raw}];
      setMessages([{role:"ai",text:raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim()}]);
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
      if(mode==="audit"||auditStarted){
        const raw=await claudeCall(conv.current,buildAuditPrompt(profile,log,schedule));
        conv.current=[...conv.current,{role:"assistant",content:raw}];
        const am=raw.match(/<AUDIT>([\s\S]*?)<\/AUDIT>/);
        if(am){
          try{
            const entry=JSON.parse(am[1].trim());
            const nl=[...log,entry];setLog(nl);await sSet(SK.log,nl);
            const allGood=entry.completed>=entry.total&&entry.punishments===0;
            const ns=allGood?(profile.streak||0)+1:0;
            const np={...profile,streak:ns};
            if(entry.advancePhase&&np.phase===1)np.phase=2;
            if(np.examMode&&np.examMode.daysOut>0){np.examMode={...np.examMode,daysOut:np.examMode.daysOut-1};}
            if(np.examMode&&np.examMode.daysOut<=0)np.examMode=null;
            if(entry.habitUpdates&&entry.habitUpdates.length){
              np.habits=(np.habits||[]).map(h=>{
                const u=entry.habitUpdates.find(x=>x.name===h.name);
                if(!u)return h;
                if(u.hit){const s=(h.streak||0)+1;return {...h,streak:s,target:s%3===0?String(Math.round(parseFloat(h.target)*0.85*10)/10):h.target};}
                return {...h,streak:0,target:h.baseline};
              });
            }
            await saveProfile(np);
          }catch(e){console.error(e);}
        }
        setMessages(m=>[...m,{role:"ai",text:raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim()}]);
      } else {
        const r=await fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:buildCoachPrompt(profile,schedule),message:msg})});
        const d=await r.json();
        const raw=d.content||"";
        const np={...profile};
        let changed=false;
        const em=raw.match(/EXAM_MODE:(\{[^}]+\})/);
        if(em){try{np.examMode=JSON.parse(em[1]);changed=true;}catch(e){console.error(e);}}
        const bu=raw.match(/BEDROCK_UPDATE:(\[[\s\S]*?\])/);
        if(bu){try{np.bedrock=JSON.parse(bu[1]);changed=true;}catch(e){console.error(e);}}
        const hh=raw.match(/HABIT_HIT:(\S+)/),hm=raw.match(/HABIT_MISS:(\S+)/);
        if(hh||hm){
          np.habits=(np.habits||[]).map(h=>{
            if(hh&&h.name.toLowerCase().includes(hh[1].toLowerCase())){const s=(h.streak||0)+1;return {...h,streak:s,target:s%3===0?String(Math.round(parseFloat(h.target)*0.85*10)/10):h.target};}
            if(hm&&h.name.toLowerCase().includes(hm[1].toLowerCase()))return {...h,streak:0,target:h.baseline};
            return h;
          });
          changed=true;
        }
        const pu=raw.match(/PROFILE_UPDATE:(\{[\s\S]*?\})/);
        if(pu){
          try{
            const u=JSON.parse(pu[1]);
            const np2={...np};
            if(u.fixedEvents){np2.fixedEvents=[...new Set([...(np2.fixedEvents||[]),...u.fixedEvents])];}
            if(u.notes)np2.notes=(np2.notes?np2.notes+". ":"")+u.notes;
            Object.assign(np,np2);
            changed=true;
          }catch(e){console.error("profile update parse",e);}
        }
        if(changed)await saveProfile(np);
        if(raw.includes("REBUILD_NEEDED")){
          conv.current=[];
          const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
          const buildDate=isLateNight()?tomorrow.toDateString():todayStr();
          await sSet(SK.schedule,{date:buildDate,blocks:[]});
          const msg2=isLateNight()?"Building tomorrow's schedule…":"Rebuilding…";
          setMessages(m=>[...m,{role:"ai",text:msg2}]);
          setLoading(false);await autoBuild(log);return;
        }
        const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
        if(upd){try{const o=JSON.parse(upd[1]);const nb=schedule.map((b,i)=>i===o.index?{...b,...o}:b);setSchedule(nb);await sSet(SK.schedule,{date:todayStr(),blocks:nb});}catch(e){console.error(e);}}
        const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/EXAM_MODE:[^\n]*/g,"").replace(/BEDROCK_UPDATE:[\s\S]*?\]/g,"").replace(/HABIT_HIT:\S+|HABIT_MISS:\S+|REBUILD_NEEDED/g,"").trim();
        if(clean)setMessages(m=>[...m,{role:"ai",text:clean}]);
      }
    }catch(e){console.error(e);setMessages(m=>[...m,{role:"ai",text:"Error. Try again."}]);}
    setLoading(false);
  }

  const ph=mode==="audit"?"Report in…":"Talk to your coach…";
  return(
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column"}}>
      <Header mode={mode} streak={profile.streak||0} phase={profile.phase||1} examMode={profile.examMode||null}/>
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

export default function App(){
  const [state,setState]=useState(null);
  useEffect(()=>{sGet(SK.profile).then(p=>setState(p&&p.name?p:false));},[]);
  async function handleSetup(p){await sSet(SK.profile,p);setState(p);}
  if(state===null)return <div style={{height:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:C.textDim,fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Loading…</div></div>;
  if(state===false)return <Onboarding onComplete={handleSetup}/>;
  return <MainScreen profile={state}/>;
}