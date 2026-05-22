import { useState, useEffect, useRef } from "react";

const CLAUDE_API="/api/generate";
const GROQ_API="/api/groq";

function todayStr(){return new Date().toDateString();}
function timeStr(){return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});}
function dateStr(){return new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});}
function toMins(t){const [h,m]=t.split(":").map(Number);return h*60+m;}
function nowMins(){const n=new Date();return n.getHours()*60+n.getMinutes();}
function isLateNight(){return new Date().getHours()>=21;}
function getMode(){const h=new Date().getHours();return h<12?"morning":h<20?"executing":"audit";}
function getCurIdx(blocks){const now=nowMins();let idx=-1;for(let i=0;i<blocks.length;i++){if(toMins(blocks[i].time)<=now)idx=i;else break;}return idx;}
function tomorrowStr(){const d=new Date();d.setDate(d.getDate()+1);return d.toDateString();}
function dayName(dateStr){return new Date(dateStr).toLocaleDateString([],{weekday:"long"});}

// ── Storage ────────────────────────────────────────────
const SK={profile:"cv6_profile",observations:"cv6_obs",schedule:"cv6_schedule",log:"cv6_log"};
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

// ── Colours ────────────────────────────────────────────
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
  obs:"#0a0e14",obsBorder:"#1a2a3a",
};

// ── Analysis prompt ────────────────────────────────────
function buildAnalysisPrompt(profile,observations){
  const obsStr=observations.map(o=>
    "Date: "+o.date+" ("+dayName(o.date)+")\n"+
    "  Wake: "+o.wakeTime+" | Sleep: "+o.sleepTime+" | Energy: "+o.energy+"/5\n"+
    "  Chaos: "+o.chaosLevel+"/5 | Completed planned: "+(o.completedPlanned?"yes":"no")+"\n"+
    "  Notes: "+o.notes
  ).join("\n\n");

  return "You are analysing "+profile.name+"'s behaviour data to build their personalised bedrock schedule.\n\n"+
    "OBSERVATIONS ("+observations.length+" days):\n"+obsStr+"\n\n"+
    "ANALYSE AND IDENTIFY:\n"+
    "1. Typical wake time range and optimal wake time\n"+
    "2. Typical sleep time and whether it is consistent\n"+
    "3. Peak energy window — when are they sharpest based on their reports?\n"+
    "4. Chaos level — how predictable are their days? Which days are most chaotic?\n"+
    "5. Patterns — what do they consistently do or skip?\n"+
    "6. Focus duration — based on what they report, how long can they realistically focus?\n\n"+
    "Then propose a bedrock schedule. Be realistic — base it entirely on observed behaviour, not ideal behaviour.\n"+
    "Present findings conversationally, then show the proposed bedrock as a clear list.\n"+
    "Ask: what do you want to change, remove, or lock in?\n"+
    "Once confirmed output:\n"+
    "<BEDROCK>\n"+
    "{\"wakeTime\":\"\",\"sleepTime\":\"\",\"peakEnergy\":\"\",\"chaosLevel\":3,\"focusMins\":25,\"bedrockBlocks\":[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"\",\"type\":\"routine|study|meal|movement|free|sleep\"}]}\n"+
    "</BEDROCK>";
}

function buildDayPrompt(profile,observations,log){
  const streak=profile.streak||0;
  const bedrock=(profile.bedrockBlocks||[]).map(b=>b.time+"-"+b.end+" "+b.title).join(", ");
  const habits=(profile.habits||[]).map(h=>h.name+": target "+h.target+" "+h.unit+" (streak "+h.streak+"d)").join("; ")||"none";
  const recent=(log||[]).slice(-5).map(l=>l.date+": "+l.completed+"/"+l.total+" done, "+l.punishments+" punishments").join(" | ")||"no history";
  const recentObs=(observations||[]).slice(-3).map(o=>o.date+": energy "+o.energy+"/5, chaos "+o.chaosLevel+"/5").join(" | ")||"none";
  const fixedEvents=(profile.fixedEvents||[]).map(e=>e.day+" "+e.time+" "+e.title).join(", ")||"none";
  const isLate=isLateNight();
  const targetDate=isLate?"tomorrow":"today";
  const targetDateStr=isLate?new Date(tomorrowStr()).toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"}):dateStr();

  return "Accountability coach for "+profile.name+". Time: "+timeStr()+". Building for: "+targetDateStr+".\n\n"+
    "BEDROCK: "+bedrock+"\n"+
    "FIXED EVENTS: "+fixedEvents+"\n"+
    "HABITS: "+habits+"\n"+
    "STREAK: "+streak+" days\n"+
    "RECENT HISTORY: "+recent+"\n"+
    "RECENT ENERGY/CHAOS: "+recentObs+"\n\n"+
    "RULES:\n"+
    "- Place each bedrock block at its committed time\n"+
    "- Account for fixed events — work around them\n"+
    "- Fill all gaps — no unaccounted time\n"+
    "- Study blocks: specific subject + topic + active method\n"+
    "- If recent energy is low: lighter study load, same structure\n"+
    "- If chaos is high: add buffer blocks after major transitions\n"+
    (isLate?"- Building for TOMORROW: start from wake time, full day\n":"- Building for TODAY: start from NOW ("+timeStr()+"), until sleep\n")+
    "\nOutput readable schedule first, then:\n"+
    "<SCHEDULE>[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"Block\",\"type\":\"routine|study|meal|movement|free|sleep|buffer\",\"instruction\":\"details or none\"}]</SCHEDULE>";
}

function buildAuditPrompt(profile,log,schedule,observations){
  const streak=profile.streak||0;
  const bedrock=(profile.bedrockBlocks||[]).map((b,i)=>(i+1)+". "+b.time+" "+b.title).join("\n")||"none";
  const habits=(profile.habits||[]).map(h=>h.name+": target "+h.target+" "+h.unit+", streak "+h.streak+"d").join("\n")||"none";
  const recentObs=(observations||[]).slice(-7);
  const patterns=detectPatterns(log||[],recentObs);

  return "Auditing "+profile.name+"'s day. Streak: "+streak+"d.\n\n"+
    "CONTROLLABLE=PUNISHMENT. UNCONTROLLABLE=LEGITIMATE.\n"+
    "Controllable: avoidance, bad choices, tiredness from bad sleep or phone. Uncontrollable: emergencies, family, medical, genuine hard day.\n\n"+
    "BEDROCK:\n"+bedrock+"\n\n"+
    "HABITS:\n"+habits+"\n\n"+
    (patterns.length?"PATTERNS DETECTED:\n"+patterns.map(p=>"- "+p).join("\n")+"\n\n":"")+
    "1. Ask them to report against each bedrock block\n"+
    "2. For each miss: get reason, apply controllable test, punish or accept\n"+
    "3. Ask about each habit\n"+
    "4. Ask: what time did you wake up, what time are you sleeping? (for observation log)\n"+
    "5. Energy today 1-5? How chaotic was today 1-5?\n"+
    "6. State exactly what changes tomorrow\n\n"+
    "Direct. No softening on controllable misses.\n\n"+
    "<AUDIT>{\"date\":\""+todayStr()+"\",\"completed\":0,\"total\":"+(profile.bedrockBlocks||[]).length+",\"punishments\":0,\"streak\":"+streak+",\"habitUpdates\":[],\"wakeTime\":\"\",\"sleepTime\":\"\",\"energy\":3,\"chaosLevel\":3,\"notes\":\"\"}</AUDIT>";
}

function buildCoachPrompt(profile,schedule,observations){
  const bedrock=(profile.bedrockBlocks||[]).map(b=>b.time+" "+b.title).join(", ");
  const habits=(profile.habits||[]).map(h=>h.name+" target "+h.target+h.unit).join(", ");
  const ctx=(schedule||[]).map((b,i)=>"["+i+"] "+b.time+"-"+b.end+" "+b.title).join(" | ");
  const fixedEvents=(profile.fixedEvents||[]).map(e=>e.day+" "+e.time+" "+e.title).join(", ")||"none";
  const recentObs=(observations||[]).slice(-3).map(o=>o.date+": energy "+o.energy+"/5").join(", ")||"none";

  return "Accountability coach for "+(profile.name||"user")+". Streak: "+(profile.streak||0)+"d.\n"+
    "Bedrock: "+bedrock+"\nFixed events: "+fixedEvents+"\nHabits: "+habits+"\nRecent energy: "+recentObs+"\n"+
    "Schedule: "+ctx+"\nTime: "+timeStr()+"\n\n"+
    "RULES: Max 3 sentences. Direct. Push back on excuses immediately.\n"+
    "If user reports a conflict or change: readjust the schedule around it. Output full updated schedule.\n"+
    "If user mentions new fixed event or info about themselves: capture it.\n\n"+
    "PROFILE_UPDATE:{\"fixedEvents\":[{\"day\":\"\",\"time\":\"\",\"title\":\"\"}],\"notes\":\"\"} — output when you learn something new\n"+
    "SCHEDULE_UPDATE:{\"index\":<n>,\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"...\",\"instruction\":\"...\"}\n"+
    "REBUILD_NEEDED — if schedule needs full rebuild\n"+
    "HABIT_HIT:<name> or HABIT_MISS:<name>\n"+
    "EXAM_MODE:{\"name\":\"\",\"daysOut\":7} — if user mentions an exam";
}

function detectPatterns(log,observations){
  const p=[];
  const l3=(log||[]).slice(-3);
  if(l3.length>=3&&l3.every(l=>l.punishments>0))p.push("Punishments 3 days running — bedrock may need adjusting");
  if(l3.length>=3&&l3.every(l=>l.completed<l.total))p.push("Incomplete 3+ days — avoidance pattern");
  const dayMap={};
  (log||[]).forEach(l=>{if(l.completed<l.total){const d=new Date(l.date).toLocaleDateString([],{weekday:"long"});dayMap[d]=(dayMap[d]||0)+1;}});
  Object.entries(dayMap).forEach(([day,count])=>{if(count>=2)p.push(day+" is a recurring problem day");});
  if(observations&&observations.length>=3){
    const avgEnergy=observations.reduce((s,o)=>s+(o.energy||3),0)/observations.length;
    if(avgEnergy<2.5)p.push("Consistently low energy — schedule may be too heavy");
    const avgChaos=observations.reduce((s,o)=>s+(o.chaosLevel||3),0)/observations.length;
    if(avgChaos>3.5)p.push("High chaos average — more buffer blocks needed");
  }
  return p;
}

// ── Components ─────────────────────────────────────────
function Header({appMode,mode,streak,daysObserved,examMode}){
  const [now,setNow]=useState(timeStr());
  useEffect(()=>{const t=setInterval(()=>setNow(timeStr()),1000);return()=>clearInterval(t);},[]);
  const modeLabel={morning:"Morning",executing:"Executing",audit:"Audit"};
  const modeBg={morning:C.accentFaint,executing:"#0a120a",audit:"#120a10"};
  return(
    <div style={{background:appMode==="observing"?"#0a0e14":modeBg[mode],borderBottom:"1px solid "+C.border,padding:"13px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div>
          <div style={{color:C.accent,fontSize:11,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>
            {appMode==="observing"?"Observing":"Coach"}
          </div>
          <div style={{color:C.textDim,fontSize:11,marginTop:2}}>{dateStr()}</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {appMode==="observing"&&<div style={{background:C.obs,border:"1px solid "+C.obsBorder,borderRadius:3,padding:"2px 7px",fontSize:9,color:"#4a8aaa",letterSpacing:1}}>{"DAY "+daysObserved+" OF 7"}</div>}
          {appMode==="active"&&streak>0&&<div style={{background:C.accentFaint,border:"1px solid "+C.accentDim,borderRadius:3,padding:"2px 7px",fontSize:9,color:C.accent}}>{"🔥"+streak}</div>}
          {examMode&&<div style={{background:"#2a1000",border:"1px solid #5a2a00",borderRadius:3,padding:"2px 7px",fontSize:9,color:"#c86420",letterSpacing:1}}>{"EXAM "+examMode.daysOut+"d"}</div>}
        </div>
      </div>
      <div style={{color:C.text,fontSize:21,fontWeight:700,fontVariantNumeric:"tabular-nums",fontFamily:"monospace"}}>{now}</div>
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

function SchedulePanel({blocks,appMode}){
  const ref=useRef(null);
  const ci=getCurIdx(blocks);
  useEffect(()=>{if(ref.current&&ci>=0){const els=ref.current.querySelectorAll("[data-idx]");if(els[ci])els[ci].scrollIntoView({block:"center",behavior:"smooth"});}},[ci,blocks.length]);
  return(
    <div style={{width:270,flexShrink:0,borderRight:"1px solid "+C.border,display:"flex",flexDirection:"column",background:C.surface}}>
      <div style={{padding:"9px 12px 6px",borderBottom:"1px solid "+C.borderLight,flexShrink:0}}>
        <span style={{color:C.textDim,fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>
          {appMode==="observing"?"Observation Period":"Today's Schedule"}
        </span>
      </div>
      <div ref={ref} style={{flex:1,overflowY:"auto",padding:"6px 4px"}}>
        {appMode==="observing"?(
          <div style={{padding:"16px 12px",color:C.textDim,fontSize:11,lineHeight:1.8}}>
            <div style={{color:C.accent,fontSize:12,fontWeight:600,marginBottom:8}}>Coach is watching.</div>
            <div>No schedule yet. The coach is learning how your days actually work before building anything.</div>
            <div style={{marginTop:12,color:C.textDim}}>Check in daily. After 7 days the coach will propose your bedrock.</div>
          </div>
        ):!blocks.length?(
          <div style={{padding:"20px 12px",color:C.textFaint,fontSize:11,textAlign:"center",lineHeight:1.8}}>Building…</div>
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
    <div style={{alignSelf:isUser?"flex-end":"flex-start",maxWidth:"82%"}}>
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

// ── Check-in widget ────────────────────────────────────
function CheckIn({onSubmit,type}){
  const [wakeTime,setWakeTime]=useState("");
  const [sleepTime,setSleepTime]=useState("");
  const [energy,setEnergy]=useState(3);
  const [chaos,setChaos]=useState(3);
  const [notes,setNotes]=useState("");
  const energyLabels=["","Very low","Low","Okay","Good","Sharp"];
  const chaosLabels=["","Very stable","Mostly stable","Some disruption","Chaotic","Total chaos"];

  return(
    <div style={{background:C.surface,border:"1px solid "+C.border,borderRadius:10,padding:"16px",margin:"8px 0",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{color:C.accent,fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>{type==="morning"?"Morning Check-in":"Evening Report"}</div>
      {type==="morning"?(
        <div>
          <div style={{color:C.textDim,fontSize:11,marginBottom:6}}>What time did you wake up?</div>
          <input value={wakeTime} onChange={e=>setWakeTime(e.target.value)} placeholder="e.g. 08:30"
            style={{width:"100%",background:C.bg,border:"1px solid "+C.border,borderRadius:6,color:C.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
      ):(
        <div>
          <div style={{color:C.textDim,fontSize:11,marginBottom:6}}>What time are you sleeping?</div>
          <input value={sleepTime} onChange={e=>setSleepTime(e.target.value)} placeholder="e.g. 23:30"
            style={{width:"100%",background:C.bg,border:"1px solid "+C.border,borderRadius:6,color:C.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
        </div>
      )}
      {[["Energy",energy,setEnergy,energyLabels],["Day chaos",chaos,setChaos,chaosLabels]].map(([label,val,set,labels])=>(
        <div key={label}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:C.textDim,fontSize:11}}>{label}</span>
            <span style={{color:C.textMid,fontSize:11}}>{labels[val]}</span>
          </div>
          <div style={{display:"flex",gap:5}}>
            {[1,2,3,4,5].map(n=>(
              <button key={n} onClick={()=>set(n)} style={{flex:1,padding:"7px 0",background:val>=n?C.accent:"#1a1814",border:"1px solid "+(val>=n?C.accent:C.border),borderRadius:4,cursor:"pointer",color:val>=n?"#000":C.textDim,fontSize:12,fontWeight:600}}>{n}</button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <div style={{color:C.textDim,fontSize:11,marginBottom:6}}>Anything notable? (optional)</div>
        <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Classes, events, how you felt…"
          style={{width:"100%",background:C.bg,border:"1px solid "+C.border,borderRadius:6,color:C.text,padding:"8px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>
      <button onClick={()=>onSubmit({wakeTime,sleepTime,energy,chaosLevel:chaos,notes,date:todayStr(),type})}
        style={{background:C.accent,color:"#000",border:"none",borderRadius:6,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
        Submit
      </button>
    </div>
  );
}

// ── Setup ──────────────────────────────────────────────
function Setup({onComplete}){
  const [name,setName]=useState("");
  const [subjects,setSubjects]=useState("");
  const [context,setContext]=useState("");
  return(
    <div style={{height:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:C.surface,border:"1px solid "+C.border,borderRadius:12,padding:"32px 28px",width:"100%",maxWidth:420,display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <div style={{color:C.accent,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Coach</div>
          <div style={{color:C.text,fontSize:18,fontWeight:700}}>Let's get started.</div>
          <div style={{color:C.textMid,fontSize:12,marginTop:6,lineHeight:1.7}}>The coach will observe you for 7 days before building your schedule. Just check in daily — it does the rest.</div>
        </div>
        <div>
          <label style={{color:C.textDim,fontSize:10,letterSpacing:2,textTransform:"uppercase",display:"block",marginBottom:5}}>Your name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name" autoFocus
            style={{width:"100%",background:C.bg,border:"1px solid "+C.border,borderRadius:7,color:C.text,padding:"9px 12px",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div>
          <label style={{color:C.textDim,fontSize:10,letterSpacing:2,textTransform:"uppercase",display:"block",marginBottom:5}}>Subjects / areas of work</label>
          <input value={subjects} onChange={e=>setSubjects(e.target.value)} placeholder="e.g. Calculus, Linear Algebra, Stats"
            style={{width:"100%",background:C.bg,border:"1px solid "+C.border,borderRadius:7,color:C.text,padding:"9px 12px",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div>
          <label style={{color:C.textDim,fontSize:10,letterSpacing:2,textTransform:"uppercase",display:"block",marginBottom:5}}>Anything the coach should know upfront</label>
          <input value={context} onChange={e=>setContext(e.target.value)} placeholder="e.g. work Tues/Thurs, bad sleep habits, phone addiction"
            style={{width:"100%",background:C.bg,border:"1px solid "+C.border,borderRadius:7,color:C.text,padding:"9px 12px",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <button onClick={()=>{
          if(!name.trim())return;
          onComplete({name:name.trim(),subjects:subjects.split(",").map(s=>s.trim()).filter(Boolean),context,appMode:"observing",streak:0,habits:[],fixedEvents:[],bedrockBlocks:null,examMode:null,setupDate:todayStr()});
        }} style={{background:C.accent,color:"#000",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer",marginTop:4}}>
          Begin →
        </button>
      </div>
    </div>
  );
}

// ── Observation screen ─────────────────────────────────
function ObservationScreen({profile,observations,onUpdate}){
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [showCheckin,setShowCheckin]=useState(false);
  const [checkinType,setCheckinType]=useState("morning");
  const [analyzing,setAnalyzing]=useState(false);
  const feedRef=useRef(null);
  const conv=useRef([]);
  const todayObs=observations.find(o=>o.date===todayStr());
  const hasMorning=todayObs&&todayObs.wakeTime;
  const hasEvening=todayObs&&todayObs.sleepTime;
  const daysObserved=observations.length;
  const readyToAnalyze=daysObserved>=7;

  useEffect(()=>{
    if(feedRef.current)feedRef.current.scrollTop=feedRef.current.scrollHeight;
  },[messages,loading]);

  useEffect(()=>{
    const greeting=readyToAnalyze
      ?"I've been watching for "+daysObserved+" days. I have enough data to build your schedule. Ready when you are — just say the word."
      :"Day "+daysObserved+" of observation. "+(hasMorning&&!hasEvening?"Morning logged. Check in tonight before you sleep.":!hasMorning?"Check in below — won't take 30 seconds.":"Both check-ins done for today. See you tomorrow.");
    setMessages([{role:"ai",text:greeting}]);
  },[]);

  async function handleCheckin(data){
    setShowCheckin(false);
    const newObs=[...observations.filter(o=>o.date!==todayStr()),{...todayObs,...data}];
    await sSet(SK.observations,newObs);
    onUpdate({observations:newObs});
    setMessages(m=>[...m,{role:"ai",text:data.type==="morning"?"Morning logged. Energy "+data.energy+"/5. Chaos "+data.chaosLevel+"/5. See you tonight.":"Evening logged. Rest well. Check in tomorrow morning."}]);
  }

  async function runAnalysis(){
    setAnalyzing(true);
    setMessages(m=>[...m,{role:"ai",text:"Analysing "+daysObserved+" days of data…"}]);
    try{
      const r=await fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:1500,messages:[{role:"user",content:"Analyse my observation data and propose my bedrock schedule."}],system:buildAnalysisPrompt(profile,observations)})});
      const d=await r.json();
      const raw=d.content?d.content.map(c=>c.text||"").join(""):"";
      conv.current=[{role:"user",content:"Analyse my observation data."},{role:"assistant",content:raw}];
      const bedrockMatch=raw.match(/<BEDROCK>([\s\S]*?)<\/BEDROCK>/);
      if(bedrockMatch){
        try{
          const b=JSON.parse(bedrockMatch[1].trim());
          const updated={...profile,...b,appMode:"active",activeSince:todayStr()};
          await sSet(SK.profile,updated);
          onUpdate({profile:updated,appMode:"active"});
          return;
        }catch(e){console.error(e);}
      }
      setMessages(m=>[...m.filter(x=>x.text!=="Analysing "+daysObserved+" days of data…"),{role:"ai",text:raw.replace(/<BEDROCK>[\s\S]*?<\/BEDROCK>/g,"").trim()}]);
    }catch(e){setMessages(m=>[...m,{role:"ai",text:"Analysis failed. Try again."}]);}
    setAnalyzing(false);
  }

  async function send(){
    if(!input.trim()||loading)return;
    const msg=input.trim();setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]);
    conv.current=[...conv.current,{role:"user",content:msg}];
    if(msg.toLowerCase().includes("ready")||msg.toLowerCase().includes("build")||msg.toLowerCase().includes("go ahead")){
      await runAnalysis();return;
    }
    setLoading(true);
    try{
      const r=await fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:"You are an accountability coach in observation mode for "+profile.name+". You are observing their patterns before building a schedule. Be encouraging but brief. If they ask about schedule or say they are ready, tell them to say 'ready' or you can build now. Days observed: "+daysObserved+"/7.",message:msg})});
      const d=await r.json();
      setMessages(m=>[...m,{role:"ai",text:d.content||"Talk to me."}]);
    }catch(e){setMessages(m=>[...m,{role:"ai",text:"Error. Try again."}]);}
    setLoading(false);
  }

  return(
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column"}}>
      <Header appMode="observing" mode={getMode()} streak={0} daysObserved={daysObserved} examMode={null}/>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <SchedulePanel blocks={[]} appMode="observing"/>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div ref={feedRef} style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
            {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
            {(loading||analyzing)&&<div style={{alignSelf:"flex-start"}}><div style={{color:C.accentDim,fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Coach</div><div style={{background:C.surface,border:"1px solid "+C.border,color:C.textMid,fontSize:13,padding:"10px 14px",borderRadius:"8px 8px 8px 2px"}}>…</div></div>}
            {showCheckin&&<CheckIn onSubmit={handleCheckin} type={checkinType}/>}
            {!showCheckin&&(
              <div style={{display:"flex",gap:8,marginTop:4}}>
                {!hasMorning&&<button onClick={()=>{setCheckinType("morning");setShowCheckin(true);}} style={{background:C.accentFaint,border:"1px solid "+C.accentDim,borderRadius:6,padding:"8px 14px",fontSize:12,color:C.accent,cursor:"pointer"}}>Morning check-in</button>}
                {hasMorning&&!hasEvening&&<button onClick={()=>{setCheckinType("evening");setShowCheckin(true);}} style={{background:"#0a120a",border:"1px solid #1a3a1a",borderRadius:6,padding:"8px 14px",fontSize:12,color:"#4a8a4a",cursor:"pointer"}}>Evening report</button>}
                {readyToAnalyze&&!analyzing&&<button onClick={runAnalysis} style={{background:C.accent,border:"none",borderRadius:6,padding:"8px 14px",fontSize:12,color:"#000",fontWeight:700,cursor:"pointer"}}>Build my schedule →</button>}
              </div>
            )}
          </div>
          <InputBar value={input} onChange={setInput} onSend={send} disabled={loading||analyzing} placeholder="Talk to your coach…"/>
        </div>
      </div>
    </div>
  );
}

// ── Active screen ──────────────────────────────────────
function ActiveScreen({profile:initProfile,observations:initObs}){
  const [profile,setProfile]=useState(initProfile);
  const [observations,setObservations]=useState(initObs||[]);
  const [schedule,setSchedule]=useState([]);
  const [log,setLog]=useState([]);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [mode,setMode]=useState(getMode());
  const [auditStarted,setAuditStarted]=useState(false);
  const [showCheckin,setShowCheckin]=useState(false);
  const feedRef=useRef(null);
  const conv=useRef([]);

  useEffect(()=>{const t=setInterval(()=>setMode(getMode()),60000);return()=>clearInterval(t);},[]);
  useEffect(()=>{if(feedRef.current)feedRef.current.scrollTop=feedRef.current.scrollHeight;},[messages,loading]);

  useEffect(()=>{
    Promise.all([sGet(SK.schedule),sGet(SK.log)]).then(([s,l])=>{
      if(l)setLog(l);
      const alreadyAudited=l&&l.find(e=>e.date===todayStr());
      const targetDate=isLateNight()?tomorrowStr():todayStr();
      const hasSchedule=s&&s.date===targetDate&&s.blocks&&s.blocks.length;
      if(mode==="audit"&&!alreadyAudited&&!isLateNight()){triggerAudit(l||[],s?s.blocks:[]);}
      else if(hasSchedule){setSchedule(s.blocks);setMessages([{role:"ai",text:"Schedule loaded. "+timeStr()+" — "+getCurrentBlockMsg(s.blocks)}]);}
      else{autoBuild(l||[]);}
    });
  },[]);

  function getCurrentBlockMsg(blocks){
    const ci=getCurIdx(blocks);
    if(ci<0)return "Nothing scheduled yet today.";
    const cur=blocks[ci];const next=blocks[ci+1];
    return "You should be: "+cur.title+(next?". Up next: "+next.title:".");
  }

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
    const late=isLateNight();
    setMessages([{role:"ai",text:late?"Building tomorrow's schedule…":"Building your schedule…"}]);
    try{
      const prompt=late?"Build tomorrow's schedule. Date: "+new Date(tomorrowStr()).toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"})+". Start from my wake time. Full day.":"Build today's schedule. Time: "+timeStr()+". Date: "+dateStr()+". Start from now until sleep.";
      const raw=await claudeCall([{role:"user",content:prompt}],buildDayPrompt(profile,observations,existingLog));
      const sm=raw.match(/<SCHEDULE>([\s\S]*?)<\/SCHEDULE>/);
      const targetDate=late?tomorrowStr():todayStr();
      if(sm){try{const bl=JSON.parse(sm[1].trim());setSchedule(bl);await sSet(SK.schedule,{date:targetDate,blocks:bl});}catch(e){console.error(e);}}
      const clean=raw.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g,"").trim();
      setMessages([{role:"ai",text:clean||(late?"Tomorrow is set.":"Schedule built. Stay on it.")}]);
    }catch(e){console.error(e);setMessages([{role:"ai",text:"Failed to build. Talk to me."}]);}
    setLoading(false);
  }

  async function triggerAudit(el,es){
    setAuditStarted(true);setLoading(true);
    try{
      const raw=await claudeCall([{role:"user",content:"Run the evening audit."}],buildAuditPrompt(profile,el,es,observations));
      conv.current=[{role:"user",content:"Run the evening audit."},{role:"assistant",content:raw}];
      setMessages([{role:"ai",text:raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim()}]);
    }catch(e){setMessages([{role:"ai",text:"Audit failed. Report manually."}]);}
    setLoading(false);
  }

  async function handleCheckin(data){
    setShowCheckin(false);
    const newObs=[...observations.filter(o=>o.date!==todayStr()),{...(observations.find(o=>o.date===todayStr())||{date:todayStr()}),...data}];
    setObservations(newObs);
    await sSet(SK.observations,newObs);
    setMessages(m=>[...m,{role:"ai",text:"Logged. Energy "+data.energy+"/5."}]);
  }

  async function send(){
    if(!input.trim()||loading)return;
    const msg=input.trim();setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]);
    conv.current=[...conv.current,{role:"user",content:msg}];
    setLoading(true);
    try{
      if(mode==="audit"||auditStarted){
        const raw=await claudeCall(conv.current,buildAuditPrompt(profile,log,schedule,observations));
        conv.current=[...conv.current,{role:"assistant",content:raw}];
        const am=raw.match(/<AUDIT>([\s\S]*?)<\/AUDIT>/);
        if(am){
          try{
            const entry=JSON.parse(am[1].trim());
            const nl=[...log,entry];setLog(nl);await sSet(SK.log,nl);
            const allGood=entry.completed>=entry.total&&entry.punishments===0;
            const ns=allGood?(profile.streak||0)+1:0;
            const np={...profile,streak:ns};
            if(entry.wakeTime||entry.sleepTime||entry.energy){
              const newObs=[...observations.filter(o=>o.date!==todayStr()),{date:todayStr(),wakeTime:entry.wakeTime||"",sleepTime:entry.sleepTime||"",energy:entry.energy||3,chaosLevel:entry.chaosLevel||3,notes:entry.notes||""}];
              setObservations(newObs);await sSet(SK.observations,newObs);
            }
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
        const r=await fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:buildCoachPrompt(profile,schedule,observations),message:msg})});
        const d=await r.json();
        const raw=d.content||"";
        const np={...profile};let changed=false;
        const pu=raw.match(/PROFILE_UPDATE:(\{[\s\S]*?\}(?=\s|$))/);
        if(pu){try{const u=JSON.parse(pu[1]);if(u.fixedEvents){np.fixedEvents=[...(np.fixedEvents||[]),...u.fixedEvents];}if(u.notes)np.notes=(np.notes||"")+". "+u.notes;changed=true;}catch(e){console.error(e);}}
        const em=raw.match(/EXAM_MODE:(\{[^}]+\})/);
        if(em){try{np.examMode=JSON.parse(em[1]);changed=true;}catch(e){console.error(e);}}
        const hh=raw.match(/HABIT_HIT:(\S+)/),hm=raw.match(/HABIT_MISS:(\S+)/);
        if(hh||hm){np.habits=(np.habits||[]).map(h=>{if(hh&&h.name.toLowerCase().includes(hh[1].toLowerCase())){const s=(h.streak||0)+1;return {...h,streak:s};}if(hm&&h.name.toLowerCase().includes(hm[1].toLowerCase()))return {...h,streak:0,target:h.baseline};return h;});changed=true;}
        if(changed)await saveProfile(np);
        if(raw.includes("REBUILD_NEEDED")){conv.current=[];await sSet(SK.schedule,{date:isLateNight()?tomorrowStr():todayStr(),blocks:[]});setMessages(m=>[...m,{role:"ai",text:isLateNight()?"Rebuilding tomorrow…":"Rebuilding…"}]);setLoading(false);await autoBuild(log);return;}
        const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
        if(upd){try{const o=JSON.parse(upd[1]);const nb=schedule.map((b,i)=>i===o.index?{...b,...o}:b);setSchedule(nb);await sSet(SK.schedule,{date:isLateNight()?tomorrowStr():todayStr(),blocks:nb});}catch(e){console.error(e);}}
        const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/PROFILE_UPDATE:[^\n]*/g,"").replace(/EXAM_MODE:[^\n]*/g,"").replace(/HABIT_HIT:\S+|HABIT_MISS:\S+|REBUILD_NEEDED/g,"").trim();
        if(clean)setMessages(m=>[...m,{role:"ai",text:clean}]);
      }
    }catch(e){console.error(e);setMessages(m=>[...m,{role:"ai",text:"Error. Try again."}]);}
    setLoading(false);
  }

  const todayObs=observations.find(o=>o.date===todayStr());
  const ph=mode==="audit"?"Report in…":"Talk to your coach…";

  return(
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column"}}>
      <Header appMode="active" mode={mode} streak={profile.streak||0} daysObserved={0} examMode={profile.examMode||null}/>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <SchedulePanel blocks={schedule} appMode="active"/>
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div ref={feedRef} style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
            {!messages.length&&<div style={{margin:"auto",textAlign:"center",color:C.textFaint,fontSize:12,lineHeight:1.8}}>Your coach is ready.</div>}
            {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
            {loading&&<div style={{alignSelf:"flex-start"}}><div style={{color:C.accentDim,fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Coach</div><div style={{background:C.surface,border:"1px solid "+C.border,color:C.textMid,fontSize:13,padding:"10px 14px",borderRadius:"8px 8px 8px 2px"}}>…</div></div>}
            {showCheckin&&<CheckIn onSubmit={handleCheckin} type={mode==="morning"?"morning":"evening"}/>}
            {!showCheckin&&!todayObs&&mode==="morning"&&(
              <button onClick={()=>setShowCheckin(true)} style={{alignSelf:"flex-start",background:C.accentFaint,border:"1px solid "+C.accentDim,borderRadius:6,padding:"8px 14px",fontSize:12,color:C.accent,cursor:"pointer"}}>Quick check-in</button>
            )}
          </div>
          <InputBar value={input} onChange={setInput} onSend={send} disabled={loading} placeholder={ph}/>
        </div>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────
export default function App(){
  const [state,setState]=useState(null);

  useEffect(()=>{
    Promise.all([sGet(SK.profile),sGet(SK.observations)]).then(([p,o])=>{
      if(!p)setState({appMode:"setup"});
      else setState({profile:p,observations:o||[],appMode:p.appMode||"observing"});
    });
  },[]);

  async function handleSetup(p){
    await sSet(SK.profile,p);
    setState({profile:p,observations:[],appMode:"observing"});
  }

  function handleObsUpdate({observations,profile,appMode}){
    setState(s=>({...s,observations:observations||s.observations,profile:profile||s.profile,appMode:appMode||s.appMode}));
  }

  if(state===null)return(
    <div style={{height:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:C.textDim,fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Loading…</div>
    </div>
  );
  if(state.appMode==="setup")return <Setup onComplete={handleSetup}/>;
  if(state.appMode==="observing")return <ObservationScreen profile={state.profile} observations={state.observations} onUpdate={handleObsUpdate}/>;
  return <ActiveScreen profile={state.profile} observations={state.observations}/>;
}