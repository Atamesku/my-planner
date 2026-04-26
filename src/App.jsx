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
const SK={profile:"v12_profile",schedule:"v12_schedule",auditLog:"v12_auditlog"};
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

const FLOOR="NON-NEGOTIABLE FLOOR: Every day must include at least one 25-minute session of active mathematical problem-solving. Not reading. Not watching. Not reviewing notes. Solving problems with full attention and no phone. Cannot be skipped, shortened, or replaced. Ever.";

const CORE="MORNING ROUTINE (exact order before anything else):\n1. Water immediately on waking before phone\n2. Brush teeth and wash face 10min\n3. Shower 10-15min daily\n4. Get dressed in real clothes\n5. Breakfast 20min no phone\nPhone stays down until all 5 done.\n\nPHONE RULES:\nFree zones: morning routine, study, meals, 30min before sleep.\nAllowed: breaks and free time only. Violation = logged and named.\n\nMEALS:\nBreakfast within 1hr of waking 20min no phone.\nLunch 12-14:00 30min no phone.\nDinner 18-20:00 30min no phone. No skipping.\n\nMOVEMENT:\n15min walk daily. Outdoors. Build only after 7 days consistent.\n\nHYGIENE:\nShower daily as block. Teeth morning and night. Face morning and night.\n\nSTUDY:\nStreak 0-2: one 25min. Streak 3-6: one 50min. Streak 7+: two sessions.\nTimer on. Phone away. Door closed. Active problems only.\n\nNIGHT ROUTINE:\nPhone away 30min before sleep. Tidy 10min. Reflect 5min. Wind-down no screens. Consistent sleep time.\n\nPROGRESSION: Never add new layer until previous stable 3+ days. Break = reset level.";

const PROBLEMS="KNOWN BASELINE PROBLEMS:\n\n1. PHONE ADDICTION\nBaseline: first thing morning last thing night all day.\nProgression: phone-free morning routine, then study, then meals, then sleep window.\n\n2. ZERO STUDY DISCIPLINE\nBaseline: no sessions pure avoidance.\nProgression: streak gates 25min 50min two sessions.\n\n3. INCONSISTENT HYGIENE\nBaseline: shower and grooming unreliable.\nTarget: daily shower teeth twice face twice all scheduled.\n\n4. NO EXERCISE\nBaseline: completely inactive.\nProgression: 15min walk daily build after 7 days.\n\n5. NO MEAL STRUCTURE\nBaseline: random eating skipping meals.\nTarget: all three meals correct windows no phone.\n\n6. FULLY UNPRODUCTIVE DAYS\nBaseline: zero output no momentum.\nMinimum: morning routine + one study session + three meals + one walk.\n\n7. SLEEP INCONSISTENCY\nBaseline: irregular times poor quality.\nProgression: find average time shift 30min earlier every 7 days consistent.\n\n8. PROCRASTINATION\nBaseline: avoidance is default for hard tasks.\nRule: hard tasks first in day. Avoidance named in audit.\n\n9. PASSIVE WORK AS STUDYING\nBaseline: reading and watching counted as study.\nRule: study means active problem-solving only. Audit asks explicitly.\n\n10. NO MORNING ROUTINE\nBaseline: phone is literally first thing.\nTarget: water brush shower dressed breakfast then phone.\n\n11. NO NIGHT ROUTINE\nBaseline: phone is last thing every night.\nTarget: tidy reflect wind-down phone away consistent sleep.\n\nCOACH RULES:\nTrack each problem individually in audit.\nCall failures as: Problem N violated - exact description.\nAfter 3+ consistent days on any problem: acknowledge then raise bar.\nAfter a few days ask if there is anything else to work on.\nNew problems mentioned: add baseline track same way.";

function detectPatterns(logs){
  if(!logs||!logs.length)return [];
  const p=[]; const l3=logs.slice(-3);
  if(l3.length>=3&&l3.every(l=>!l.floorHit)) p.push("Floor missed 3+ days - protect it first today");
  if(l3.length>=3&&l3.every(l=>!l.realThinking)) p.push("3+ days passive work - hard problems only today");
  if(l3.length>=3&&l3.every(l=>!l.wellbeing)) p.push("3+ days poor self-care - enforce all wellbeing blocks");
  if(l3.length>=3&&l3.every(l=>l.phoneViolation)) p.push("Phone violated 3+ days - strict enforcement today");
  return p;
}

function buildMorningSystem(profile,auditLog){
  const logs=(auditLog||[]).slice(-7);
  const patterns=detectPatterns(logs);
  const streak=(profile&&profile.studyStreak)||0;
  const sessionLen=streak>=7?"two 50min sessions":streak>=3?"one 50min session":"one 25min session";
  const name=(profile&&profile.name)||"there";
  const subjects=(profile&&profile.subjects&&profile.subjects.length)?profile.subjects.join(", "):"not specified yet";
  const logStr=logs.length?logs.map(l=>"  "+l.date+": floor="+(l.floorHit?"yes":"NO")+", thinking="+(l.realThinking?"real":"PASSIVE")+", wellbeing="+(l.wellbeing?"yes":"NO")+", phone="+(l.phoneViolation?"VIOLATED":"clean")).join("\n"):"  No history - day 1.";
  const patStr=patterns.length?"ACTIVE PATTERNS:\n"+patterns.map(p=>"  - "+p).join("\n"):"";
  const wakeInfo=(profile&&profile.lastWakeTime)?"Usually wakes around "+profile.lastWakeTime+".":"";
  return "You are a strict personal operating system coach. Time: "+timeStr()+". Date: "+dateStr()+".\n"+
    "Building discipline from zero. Install habits one layer at a time.\n\n"+
    FLOOR+"\n\n"+CORE+"\n\n"+PROBLEMS+"\n\n"+
    "USER: "+name+" | Subjects: "+subjects+" | Study streak: "+streak+" days | Assign: "+sessionLen+"\n"+
    wakeInfo+"\n\n"+
    "AUDIT HISTORY:\n"+logStr+"\n"+patStr+"\n\n"+
    "BEHAVIOUR:\n"+
    "Parse the day dump immediately. Build the full schedule. Do not ask for info already given.\n"+
    "Extract all fixed events automatically. Ask ONE question after schedule only if critical info missing.\n"+
    "Learn subjects wake times patterns from conversation and save them.\n\n"+
    "SCHEDULE RULES:\n"+
    "Every hour wake to sleep accounted for. Zero gaps.\n"+
    "Morning routine first. All meals at correct times. Hygiene blocks explicit. Movement block included.\n"+
    "Study at high-energy window. Streak-gated length. Hard tasks first.\n"+
    "No deep work within 30min after a meal. Night routine 30-45min before sleep.\n"+
    "Start from NOW ("+timeStr()+"). Realistic. No overplanning.\n\n"+
    "STUDY ALLOCATION:\n"+
    "Specific subject + specific topic + specific number of problems. Active only. Never passive.\n\n"+
    "OUTPUT schedule JSON at the end:\n"+
    "<SCHEDULE>\n"+
    "[{\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"Exact block name\",\"type\":\"deep|light|break|fixed|meal|movement|hygiene|routine|wind-down\",\"work\":\"specific instruction or none\",\"difficulty\":\"easy|medium|hard|none\"}]\n"+
    "</SCHEDULE>\n\n"+
    "Also output profile updates learned:\n"+
    "<PROFILE_UPDATE>\n"+
    "{\"subjects\":[],\"lastWakeTime\":\"\",\"lastSleepTime\":\"\",\"notes\":\"\"}\n"+
    "</PROFILE_UPDATE>";
}

function buildAuditSystem(profile,auditLog){
  const logs=(auditLog||[]).slice(-7);
  const patterns=detectPatterns(logs);
  const name=(profile&&profile.name)||"you";
  const streak=(profile&&profile.studyStreak)||0;
  const logStr=logs.length?logs.map(l=>"  "+l.date+": floor="+(l.floorHit?"yes":"NO")+", thinking="+(l.realThinking?"real":"PASSIVE")+", wellbeing="+(l.wellbeing?"yes":"NO")+", phone="+(l.phoneViolation?"VIOLATED":"clean")).join("\n"):"  No history yet.";
  const patStr=patterns.length?"ACTIVE PATTERNS:\n"+patterns.map(p=>"  - "+p).join("\n"):"";
  return "You are auditing "+name+"'s day. Study streak: "+streak+" days.\n"+
    "11 confirmed baseline problems. Track each. Call failures by number and name. No softening.\n\n"+
    FLOOR+"\n\n"+PROBLEMS+"\n\n"+
    "AUDIT LOG:\n"+logStr+"\n"+patStr+"\n\n"+
    "Ask these questions in ONE message (numbered):\n"+
    "1. Did you hit your floor? One 25min active problem-solving session - yes or no?\n"+
    "2. Was it active (problem-solving) or passive (reading watching reviewing)?\n"+
    "3. Did you complete morning routine - water shower teeth dressed breakfast no phone?\n"+
    "4. Did you eat all three meals? Did you go for a walk?\n"+
    "5. Did phone stay away during study meals and night routine?\n"+
    "6. Were today's constraints real or self-created?\n"+
    "7. Any pattern you notice in yourself this week?\n\n"+
    "After they answer:\n"+
    "Call violations specifically: Problem 1 violated - phone used during study.\n"+
    "Floor hit = streak +1. Floor missed = streak resets to 0. State clearly.\n"+
    "Pattern 3+ days = name it state what changes tomorrow.\n"+
    "Good day = acknowledge briefly then raise the bar.\n\n"+
    "End with:\n"+
    "<AUDIT>\n"+
    "{\"date\":\""+todayStr()+"\",\"floorHit\":false,\"realThinking\":false,\"wellbeing\":false,\"phoneViolation\":false,\"constraints\":\"note\",\"patterns\":\"observation\",\"newStreak\":0}\n"+
    "</AUDIT>";
}

function buildCoachSystem(profile){
  const name=(profile&&profile.name)||"you";
  const streak=(profile&&profile.studyStreak)||0;
  return "You are the operating system coach for "+name+". Study streak: "+streak+" days.\n"+
    FLOOR+"\n"+
    "Max 3 sentences. Specific. No fluff.\n"+
    "Refuse requests to skip problem-solving shower meals or phone-free blocks.\n"+
    "Schedule tweak: SCHEDULE_UPDATE:{\"index\":<n>,\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"...\",\"work\":\"...\"}\n"+
    "Full rebuild: REBUILD_NEEDED";
}

// ── Components ─────────────────────────────────────────
function Header({mode}){
  const [now,setNow]=useState(timeStr());
  useEffect(()=>{const t=setInterval(()=>setNow(timeStr()),1000);return()=>clearInterval(t);},[]);
  const labels={morning:"Morning — build your day",executing:"Executing — stay on track",audit:"Evening Audit"};
  const bg={morning:"#0a0a00",executing:"#000a00",audit:"#0a000a"};
  return (
    <div style={{padding:"13px 18px 9px",borderBottom:"1px solid #141414",background:bg[mode],display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{color:"#444",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>{dateStr()}</div>
        <div style={{color:"#444",fontSize:11,marginTop:2}}>{labels[mode]}</div>
      </div>
      <div style={{color:"#555",fontSize:20,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{now}</div>
    </div>
  );
}

function ScheduleBlock({block,state}){
  const isCur=state==="current",isPast=state==="past";
  const bgs={deep:"#0d0d00",light:"#000d0d",break:"transparent",fixed:"#0d000d",meal:"#000a10",movement:"#000d06",hygiene:"#080010",routine:"#0d0800","wind-down":"#100008"};
  const bls={deep:"#2a2a00",light:"#002a2a",break:"#141414",fixed:"#2a002a",meal:"#001520",movement:"#001a0d",hygiene:"#10001a",routine:"#1a1000","wind-down":"#1a0010"};
  const lbl={deep:"DEEP",meal:"MEAL",movement:"MOVE",hygiene:"HYGIENE",routine:"ROUTINE","wind-down":"WIND"};
  return (
    <div style={{margin:"0 4px 2px",padding:isCur?"11px 14px":"8px 14px",borderRadius:7,background:isCur?"#1a1a1a":bgs[block.type]||"transparent",borderLeft:"2px solid "+(isCur?"#fff":bls[block.type]||"#141414"),opacity:isPast?0.2:1}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{color:isCur?"#888":"#3a3a3a",fontSize:11,minWidth:95,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{block.time}–{block.end}</span>
        <span style={{color:isCur?"#fff":isPast?"#444":"#bbb",fontSize:isCur?14:13,fontWeight:isCur?600:400,flex:1,lineHeight:1.3}}>{block.title}</span>
        {isCur&&<span style={{color:"#000",background:"#fff",fontSize:8,fontWeight:700,letterSpacing:1.5,padding:"2px 5px",borderRadius:3}}>NOW</span>}
        {!isCur&&!isPast&&lbl[block.type]&&<span style={{color:"#333",fontSize:8,letterSpacing:1}}>{lbl[block.type]}</span>}
      </div>
      {block.work&&block.work!=="none"&&!isPast&&(
        <div style={{marginTop:5,marginLeft:105,color:isCur?"#555":"#2a2a2a",fontSize:11,lineHeight:1.5,fontStyle:"italic"}}>{block.work}</div>
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
    <div ref={feedRef} style={{height:185,overflowY:"auto",padding:"8px 18px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #141414"}}>
      {!messages.length&&<div style={{color:"#1e1e1e",fontSize:12,margin:"auto",textAlign:"center"}}>Tell me about your day.</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&<MessageBubble msg={{role:"ai",text:"…"}}/>}
    </div>
  );
}

function InputBar({value,onChange,onSend,disabled,mode}){
  const ph=mode==="morning"?"Tell me about your day…":mode==="audit"?"Report in…":"Talk to your coach…";
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
  const go=()=>{if(name.trim())onComplete({name:name.trim(),studyStreak:0,subjects:[]});};
  return(
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:10,padding:"28px 24px",width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{color:"#fff",fontSize:16,fontWeight:700}}>What's your name?</div>
        <div style={{color:"#333",fontSize:12,lineHeight:1.7}}>Tell the coach your day each morning. It learns everything else from you as you go.</div>
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
  const [auditLog,setAuditLog]=useState([]);
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
    Promise.all([sGet(SK.schedule),sGet(SK.auditLog)]).then(([s,a])=>{
      if(s&&s.date===todayStr()&&s.blocks&&s.blocks.length)setSchedule(s.blocks);
      if(a)setAuditLog(a);
      const m=getMode();
      if(m==="audit"&&(!a||!a.find(l=>l.date===todayStr()))){
        triggerAudit(a||[]);
      } else if(m==="morning"){
        setMessages([{role:"ai",text:"Morning, "+initProfile.name+". What's your day looking like? Tell me everything — when you woke up, what's fixed, how you're feeling, what needs to get done."}]);
      } else {
        setMessages([{role:"ai",text:"Mid-day. Talk to me if you need to adjust anything."}]);
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

  async function triggerAudit(log){
    setAuditStarted(true);setLoading(true);
    try{
      const raw=await claudeCall([{role:"user",content:"Run the evening audit."}],buildAuditSystem(profile,log));
      const clean=raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim();
      conv.current=[{role:"user",content:"Run the evening audit."},{role:"assistant",content:raw}];
      setMessages([{role:"ai",text:clean}]);
    }catch(e){setMessages([{role:"ai",text:"Audit failed. Report in manually."}]);}
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
        const raw=await claudeCall(conv.current,buildMorningSystem(profile,auditLog));
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
          if(u.notes)np.notes=u.notes;
          await saveProfile(np);
        }catch(e){console.error(e);}}
        const clean=raw.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g,"").replace(/<PROFILE_UPDATE>[\s\S]*?<\/PROFILE_UPDATE>/g,"").trim();
        setMessages(m=>[...m,{role:"ai",text:clean}]);
      } else if(mode==="audit"||auditStarted){
        const raw=await claudeCall(conv.current,buildAuditSystem(profile,auditLog));
        conv.current=[...conv.current,{role:"assistant",content:raw}];
        const am=raw.match(/<AUDIT>([\s\S]*?)<\/AUDIT>/);
        if(am){try{
          const entry=JSON.parse(am[1].trim());
          const nl=[...auditLog,entry];
          setAuditLog(nl);await sSet(SK.auditLog,nl);
          const ns=entry.newStreak!==undefined?entry.newStreak:(entry.floorHit?(profile.studyStreak||0)+1:0);
          await saveProfile({...profile,studyStreak:ns});
        }catch(e){console.error(e);}}
        const clean=raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim();
        setMessages(m=>[...m,{role:"ai",text:clean}]);
      } else {
        const ctx=schedule.map((b,i)=>"["+i+"] "+b.time+"-"+b.end+" "+b.title).join(" | ");
        const r=await fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:buildCoachSystem(profile),message:"Schedule: "+ctx+"\nTime: "+timeStr()+"\nUser: "+msg})});
        const d=await r.json();
        const raw=d.content||"";
        if(raw.includes("REBUILD_NEEDED")){conv.current=[];setSchedule([]);await sSet(SK.schedule,{date:todayStr(),blocks:[]});setMessages(m=>[...m,{role:"ai",text:"Schedule cleared. Tell me your updated constraints."}]);setLoading(false);return;}
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
      <Header mode={mode}/>
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