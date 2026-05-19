import { useState, useEffect, useRef } from "react";

const CLAUDE_API="/api/generate";
const GROQ_API="/api/groq";

function todayStr(){return new Date().toDateString();}
function timeStr(){return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});}
function dateStr(){return new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"});}
function getMode(){const h=new Date().getHours();return h<12?"morning":h<20?"executing":"audit";}
function toMins(t){const [h,m]=t.split(":").map(Number);return h*60+m;}
function nowMins(){const n=new Date();return n.getHours()*60+n.getMinutes();}
function getCurIdx(blocks){const now=nowMins();let idx=-1;for(let i=0;i<blocks.length;i++){if(toMins(blocks[i].time)<=now)idx=i;else break;}return idx;}

const SK={profile:"ms4_profile",schedule:"ms4_schedule",log:"ms4_log"};
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

const ONBOARDING_SYSTEM="You are a strict accountability coach setting up a user's bedrock schedule. Your job is to understand what they have committed to and what bad habits they want to fix — then enforce it daily.\n\nAsk questions one at a time. Be direct and conversational. Cover:\n1. Their name\n2. Their bedrock commitments — what non-negotiable blocks do they want to stick to every day? (wake time, study sessions, meals, movement, sleep, morning routine etc). Ask them to list everything they genuinely want to commit to. Push back if it seems too ambitious — start small.\n3. Their bad habits — what do they know they do that works against them? For each habit get the current baseline (e.g. how many hours on phone, what time they sleep, etc). Set a first target that is 10-30% better than baseline — never jump to perfect.\n4. Anything else the coach should know to hold them accountable.\n\nWhen you have everything, summarise the bedrock and habits back to them. Ask: does this look right? Once confirmed output only:\n<PROFILE>\n{\"name\":\"\",\"bedrock\":[{\"time\":\"HH:MM\",\"title\":\"\",\"duration\":30,\"type\":\"routine|study|meal|movement|sleep\"}],\"habits\":[{\"name\":\"\",\"baseline\":\"\",\"target\":\"\",\"unit\":\"\",\"streak\":0}],\"streak\":0,\"notes\":\"\"}\n</PROFILE>";

const ENFORCE_RULES="You are a strict accountability coach. The user has defined their own bedrock schedule — your job is to enforce it, not redesign it.\n\nCONTROLLABLE = PUNISHMENT. UNCONTROLLABLE = LEGITIMATE.\nControllable: poor time management, avoidance, low motivation, social calls they could decline, tiredness from bad choices.\nUncontrollable: genuine emergencies, family crises, medical issues, fatigue from a genuinely hard day of classes or work.\nTest: could they have prevented this? Yes = punish. No = legitimate.\n\nPUNISHMENTS: missed block carries over tomorrow before any free time. 30min free time removed per controllable miss. Call it out directly by name.\nREWARDS: acknowledge streaks at 3, 7, 14, 30 days. Lighter tone when earning consistency.\n\nHABIT RULES: Track each bad habit. If user reports hitting their target = streak +1. Every 3 days consistent = tighten target by 10-20%. If they fail = reset to baseline, no escalation.\n\nPROGRESSIVE ENFORCEMENT: Only enforce what is in the bedrock. If user wants to add something new, phase it in — suggest starting small and building for 3+ days before it becomes enforced.\n\nBe direct. Max 3 sentences in casual chat. No fluff. Push back immediately on weak excuses.";

function buildDayPrompt(profile,log){
  const streak=profile.streak||0;
  const bedrock=(profile.bedrock||[]).map(b=>b.time+" "+b.title+" ("+b.duration+"min)").join(", ");
  const habits=(profile.habits||[]).map(h=>h.name+": target "+h.target+" "+h.unit+" (streak "+h.streak+"d)").join(", ");
  const recent=(log||[]).slice(-5).map(l=>l.date+": "+l.completed+"/"+l.total+" done, "+l.punishments+" punishments").join("; ")||"no history yet";
  return "Strict accountability coach for "+profile.name+". Time: "+timeStr()+". Date: "+dateStr()+".\n"+
    ENFORCE_RULES+"\n\n"+
    "BEDROCK (what they committed to — never change this without their request):\n"+bedrock+"\n\n"+
    "BAD HABITS being tracked:\n"+habits+"\n\n"+
    "RECENT HISTORY: "+recent+"\n\n"+
    "BUILD TODAY'S SCHEDULE:\n"+
    "Place each bedrock block at its committed time. Fill gaps with free time or buffer.\n"+
    "Start from NOW ("+timeStr()+"). Every hour accounted for until sleep.\n"+
    "Be specific on study blocks: subject + topic + method.\n"+
    "Output readable schedule first, then:\n"+
    "<SCHEDULE>[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"Block\",\"type\":\"routine|study|meal|movement|free|sleep|buffer\",\"instruction\":\"details or none\"}]</SCHEDULE>";
}

function buildAuditPrompt(profile,log,schedule){
  const streak=profile.streak||0;
  const bedrock=(profile.bedrock||[]).map((b,i)=>(i+1)+". "+b.time+" "+b.title).join("\n");
  const habits=(profile.habits||[]).map(h=>h.name+": target "+h.target+" "+h.unit+", streak "+h.streak+"d").join("\n");
  const patterns=detectPatterns((log||[]).slice(-7));
  return "Auditing "+profile.name+"'s day. Streak: "+streak+"d.\n"+
    ENFORCE_RULES+"\n\n"+
    "TODAY'S BEDROCK:\n"+bedrock+"\n\n"+
    "HABITS:\n"+habits+"\n\n"+
    (patterns.length?"PATTERNS:\n"+patterns.join("\n")+"\n\n":"")+
    "Ask them to report against each bedrock block. For each miss: get their reason, apply controllable test, punish or accept.\n"+
    "Then ask about each habit — did they hit their target today?\n"+
    "End with exactly what changes tomorrow based on today.\n"+
    "Direct. No softening on controllable misses.\n\n"+
    "<AUDIT>{\"date\":\""+todayStr()+"\",\"completed\":0,\"total\":"+(profile.bedrock||[]).length+",\"punishments\":0,\"streak\":"+streak+",\"habitUpdates\":[{\"name\":\"\",\"hit\":true}],\"notes\":\"\"}</AUDIT>";
}

function buildCoachPrompt(profile,schedule){
  const bedrock=(profile.bedrock||[]).map(b=>b.time+" "+b.title).join(", ");
  const habits=(profile.habits||[]).map(h=>h.name+" target "+h.target+h.unit).join(", ");
  const ctx=(schedule||[]).map((b,i)=>"["+i+"] "+b.time+"-"+b.end+" "+b.title).join(" | ");
  return "Accountability coach for "+profile.name+". Streak: "+(profile.streak||0)+"d.\n"+
    ENFORCE_RULES+"\n"+
    "Bedrock: "+bedrock+"\nHabits: "+habits+"\nToday: "+ctx+"\nTime: "+timeStr()+"\n"+
    "Max 3 sentences. Push back on excuses. Apply controllable test immediately.\n"+
    "SCHEDULE_UPDATE:{\"index\":<n>,\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"...\",\"instruction\":\"...\"} for small changes.\n"+
    "REBUILD_NEEDED if something major changed.\n"+
    "HABIT_HIT:<name> or HABIT_MISS:<name> if user reports on a habit.";
}

function detectPatterns(logs){
  if(!logs||!logs.length)return [];
  const p=[],l3=logs.slice(-3);
  if(l3.length>=3&&l3.every(l=>l.punishments>0))p.push("Punishments 3 days in a row — something is not working. Check if bedrock is realistic.");
  if(l3.length>=3&&l3.every(l=>l.completed<l.total))p.push("Not completing bedrock 3+ days — avoidance pattern or blocks need adjusting.");
  if(l3.length>=3&&l3.every(l=>l.streak===0))p.push("Streak at zero 3+ days — focus only on the single most important block today.");
  return p;
}

function Header({mode,streak}){
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
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        {streak>0&&<div style={{background:C.accentFaint,border:"1px solid "+C.accentDim,borderRadius:4,padding:"3px 8px",fontSize:11,color:C.accent}}>{"🔥 "+streak}</div>}
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
    sleep:{bg:C.sleep,bl:C.sleepBorder,lbl:"SLEEP"},
    buffer:{bg:C.buffer,bl:C.bufferBorder,lbl:""},
  }[block.type]||{bg:"transparent",bl:C.borderLight,lbl:""};
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
  useEffect(()=>{
    if(ref.current&&ci>=0){const els=ref.current.querySelectorAll("[data-idx]");if(els[ci])els[ci].scrollIntoView({block:"center",behavior:"smooth"});}
  },[ci,blocks.length]);
  return(
    <div style={{width:280,flexShrink:0,borderRight:"1px solid "+C.border,display:"flex",flexDirection:"column",background:C.surface}}>
      <div style={{padding:"10px 12px 6px",borderBottom:"1px solid "+C.borderLight,flexShrink:0}}>
        <span style={{color:C.textDim,fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>Bedrock Schedule</span>
      </div>
      <div ref={ref} style={{flex:1,overflowY:"auto",padding:"6px 4px"}}>
        {!blocks.length
          ?<div style={{padding:"20px 12px",color:C.textFaint,fontSize:11,textAlign:"center",lineHeight:1.8}}>Building your schedule…</div>
          :blocks.map((b,i)=>(
            <div key={i} data-idx={i}><ScheduleBlock block={b} state={i===ci?"current":i<ci?"past":"future"}/></div>
          ))
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
      {loading&&(
        <div style={{alignSelf:"flex-start"}}>
          <div style={{color:C.accentDim,fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Coach</div>
          <div style={{background:C.surface,border:"1px solid "+C.border,color:C.textMid,fontSize:13,padding:"10px 14px",borderRadius:"8px 8px 8px 2px"}}>…</div>
        </div>
      )}
    </div>
  );
}

function InputBar({value,onChange,onSend,disabled,placeholder}){
  return(
    <div style={{borderTop:"1px solid "+C.border,padding:"12px 20px",background:C.surface,display:"flex",gap:10,flexShrink:0}}>
      <input
        style={{flex:1,background:C.bg,border:"1px solid "+C.border,borderRadius:8,color:C.text,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit"}}
        placeholder={placeholder||"Talk to your coach…"}
        value={value}
        onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey)onSend();}}
        disabled={disabled}
        onFocus={e=>e.target.style.borderColor=C.accentDim}
        onBlur={e=>e.target.style.borderColor=C.border}
      />
      <button onClick={onSend} disabled={disabled} style={{background:C.accent,color:"#000",border:"none",borderRadius:8,width:44,fontSize:16,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1,flexShrink:0}}>↑</button>
    </div>
  );
}

function Onboarding({onComplete}){
  const [messages,setMessages]=useState([{role:"ai",text:"Let's set up your bedrock. I'm not going to design your schedule for you — you're going to tell me what you've committed to, and I'll hold you to it.\n\nWhat's your name?"}]);
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
        try{const p=JSON.parse(match[1].trim());await sSet(SK.profile,p);onComplete(p);return;}
        catch(e){console.error("profile parse",e);}
      }
      setMessages(m=>[...m,{role:"ai",text:raw.replace(/<PROFILE>[\s\S]*?<\/PROFILE>/g,"").trim()}]);
    }catch(e){setMessages(m=>[...m,{role:"ai",text:"Connection error. Try again."}]);}
    setLoading(false);
  }

  return(
    <div style={{height:"100vh",background:C.bg,display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif"}}>
      <div style={{padding:"16px 20px",borderBottom:"1px solid "+C.border,background:C.surface,flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{color:C.accent,fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>Coach</div>
          <div style={{color:C.textMid,fontSize:12,marginTop:2}}>Setting up your bedrock</div>
        </div>
        <div style={{color:C.textDim,fontSize:11}}>{dateStr()}</div>
      </div>
      <div ref={feedRef} style={{flex:1,overflowY:"auto",padding:"20px",display:"flex",flexDirection:"column",gap:12,maxWidth:700,width:"100%",margin:"0 auto",boxSizing:"border-box"}}>
        {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
        {loading&&(
          <div style={{alignSelf:"flex-start"}}>
            <div style={{color:C.accentDim,fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Coach</div>
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
      const hasSchedule=s&&s.date===todayStr()&&s.blocks&&s.blocks.length;
      if(m==="audit"&&!alreadyAudited){triggerAudit(l||[],s?s.blocks:[]);}
      else if(hasSchedule){setSchedule(s.blocks);setMessages([{role:"ai",text:"Your schedule is set. Stay on it."}]);}
      else{autoBuild(l||[]);}
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
    setMessages([{role:"ai",text:"Building your schedule…"}]);
    try{
      const raw=await claudeCall([{role:"user",content:"Build today's schedule. Time: "+timeStr()+". Date: "+dateStr()+". Use my bedrock commitments. Build from now until sleep."}],buildDayPrompt(initProfile,existingLog));
      const sm=raw.match(/<SCHEDULE>([\s\S]*?)<\/SCHEDULE>/);
      if(sm){try{const bl=JSON.parse(sm[1].trim());setSchedule(bl);await sSet(SK.schedule,{date:todayStr(),blocks:bl});}catch(e){console.error(e);}}
      const clean=raw.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g,"").trim();
      setMessages([{role:"ai",text:clean||"Schedule built. Stay on it."}]);
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
            const allDone=entry.completed>=entry.total&&entry.punishments===0;
            const ns=allDone?(profile.streak||0)+1:0;
            const np={...profile,streak:ns};
            if(entry.habitUpdates){
              np.habits=(np.habits||[]).map(h=>{
                const u=entry.habitUpdates.find(x=>x.name===h.name);
                if(!u)return h;
                if(u.hit){
                  const s=(h.streak||0)+1;
                  const tighten=s>0&&s%3===0;
                  return {...h,streak:s,target:tighten?Math.round(parseFloat(h.target)*0.85*10)/10:h.target};
                }
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
        if(raw.includes("REBUILD_NEEDED")){
          conv.current=[];await sSet(SK.schedule,{date:todayStr(),blocks:[]});
          setMessages(m=>[...m,{role:"ai",text:"Rebuilding…"}]);
          setLoading(false);await autoBuild(log);return;
        }
        const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
        if(upd){try{const o=JSON.parse(upd[1]);const nb=schedule.map((b,i)=>i===o.index?{...b,...o}:b);setSchedule(nb);await sSet(SK.schedule,{date:todayStr(),blocks:nb});}catch(e){console.error(e);}}
        const hh=raw.match(/HABIT_HIT:(\S+)/);const hm=raw.match(/HABIT_MISS:(\S+)/);
        if(hh||hm){
          const np={...profile,habits:(profile.habits||[]).map(h=>{
            if(hh&&h.name.toLowerCase().includes(hh[1].toLowerCase())){const s=(h.streak||0)+1;return {...h,streak:s,target:s%3===0?Math.round(parseFloat(h.target)*0.85*10)/10:h.target};}
            if(hm&&h.name.toLowerCase().includes(hm[1].toLowerCase()))return {...h,streak:0,target:h.baseline};
            return h;
          })};
          await saveProfile(np);
        }
        const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/REBUILD_NEEDED/g,"").replace(/HABIT_HIT:\S+|HABIT_MISS:\S+/g,"").trim();
        if(clean)setMessages(m=>[...m,{role:"ai",text:clean}]);
      }
    }catch(e){console.error(e);setMessages(m=>[...m,{role:"ai",text:"Error. Try again."}]);}
    setLoading(false);
  }

  const ph=mode==="audit"?"Report in…":"Talk to your coach…";
  return(
    <div style={{height:"100vh",background:C.bg,color:C.text,fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column"}}>
      <Header mode={mode} streak={profile.streak||0}/>
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