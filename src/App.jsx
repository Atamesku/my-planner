import { useState, useEffect, useRef } from "react";

const CLAUDE_API = "/api/generate";
const GROQ_API   = "/api/groq";

function todayStr() { return new Date().toDateString(); }
function timeStr()  { return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function dateStr()  { return new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"}); }
function getMode()  { var h=new Date().getHours(); return h<12?"morning":h<20?"executing":"audit"; }
function toMins(t)  { var p=t.split(":").map(Number); return p[0]*60+p[1]; }
function nowMins()  { var n=new Date(); return n.getHours()*60+n.getMinutes(); }
function getCurIdx(blocks) {
  var now=nowMins(), idx=-1;
  for(var i=0;i<blocks.length;i++) { if(toMins(blocks[i].time)<=now) idx=i; else break; }
  return idx;
}

var SB_URL="https://qlectmatqxtqqpwwbrhn.supabase.co";
var SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsZWN0bWF0cXh0cXFwd3dicmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTUzNjgsImV4cCI6MjA5MDM5MTM2OH0.x98eVDFBeBkVCvQhoJg01sGy30BFB3B7Jcn8cJrU4Qg";
var USER_ID="default";
var SK={profile:"v12_profile",schedule:"v12_schedule",auditLog:"v12_auditlog"};
var memStore={};

function sGet(key) {
  return fetch(SB_URL+"/rest/v1/ai_memory?user_id=eq."+USER_ID+"&key=eq."+key+"&select=value",{
    headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY}
  }).then(function(r){return r.json();}).then(function(d){
    if(d&&d.length) return JSON.parse(d[0].value);
    return memStore[key]||null;
  }).catch(function(){return memStore[key]||null;});
}

function sSet(key,value) {
  memStore[key]=value;
  return fetch(SB_URL+"/rest/v1/ai_memory",{
    method:"POST",
    headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},
    body:JSON.stringify({user_id:USER_ID,key:key,value:JSON.stringify(value),updated_at:new Date().toISOString()})
  }).catch(function(e){console.error(e);});
}

var FLOOR="NON-NEGOTIABLE FLOOR: Every day must include at least one 25-minute session of active mathematical problem-solving. Not reading. Not watching. Not reviewing notes. Solving problems with full attention and no phone. Cannot be skipped, shortened, or replaced. Ever.";

var CORE_HABITS="MORNING ROUTINE (exact order, before anything else):\n1. Water immediately on waking — before phone\n2. Brush teeth + wash face — 10min\n3. Shower — 10-15min daily\n4. Get dressed in real clothes\n5. Breakfast — 20min, no phone\nPhone stays down until all 5 steps done.\n\nPHONE RULES:\nPhone-free: morning routine, study sessions, meals, 30min before sleep.\nPhone allowed: breaks and free time only.\nViolation = logged and called out by name.\n\nMEALS:\nBreakfast within 1hr of waking, 20min, no phone.\nLunch 12:00-14:00, 30min, no phone.\nDinner 18:00-20:00, 30min, no phone.\nNo skipping. No snacks as replacement.\n\nMOVEMENT:\n15min walk daily minimum. Outdoors preferred.\nBuild only after 7+ days consistent.\n\nHYGIENE:\nShower daily as scheduled block. Teeth morning and night. Face morning and night.\n\nSTUDY (building from zero):\nStreak 0-2: one 25min session. Streak 3-6: one 50min. Streak 7+: two sessions.\nTimer on. Phone away. Door closed. Active problems only.\n\nNIGHT ROUTINE:\nPhone away 30min before sleep. Tidy 10min. Reflect 5min. Wind-down no screens. Consistent sleep time.\n\nPROGRESSION: Never add new layer until previous is stable 3+ days. Break = reset level.";

var KNOWN_PROBLEMS="KNOWN BASELINE PROBLEMS:\n\n1. PHONE ADDICTION\nBaseline: first thing morning, last thing night, all day.\nProgression: phone-free morning routine first, then study, then meals, then sleep window.\n\n2. ZERO STUDY DISCIPLINE\nBaseline: no sessions, pure avoidance.\nProgression: streak gates — 25min, 50min, two sessions.\n\n3. INCONSISTENT HYGIENE\nBaseline: shower and grooming unreliable.\nTarget: daily shower, teeth twice, face twice. All scheduled.\n\n4. NO EXERCISE\nBaseline: completely inactive.\nProgression: 15min walk daily, build after 7 days consistency.\n\n5. NO MEAL STRUCTURE\nBaseline: random eating, skipping meals.\nTarget: all three meals, correct windows, no phone.\n\n6. FULLY UNPRODUCTIVE DAYS\nBaseline: zero output, no momentum.\nMinimum: morning routine + one study session + three meals + one walk.\n\n7. SLEEP INCONSISTENCY\nBaseline: irregular times, poor quality.\nProgression: find average time, shift 30min earlier every 7 days consistent.\n\n8. PROCRASTINATION\nBaseline: avoidance is default for hard tasks.\nRule: hard tasks first in the day. Avoidance named in audit.\n\n9. PASSIVE WORK AS STUDYING\nBaseline: reading and watching counted as study.\nRule: study = active problem-solving only. Audit asks explicitly.\n\n10. NO MORNING ROUTINE\nBaseline: phone is literally first thing.\nTarget: water, brush, shower, dressed, breakfast, then phone.\n\n11. NO NIGHT ROUTINE\nBaseline: phone is last thing every night.\nTarget: tidy, reflect, wind-down, phone away, consistent sleep.\n\nCOACH RULES:\nTrack each problem individually in audit.\nCall out failures as: Problem [N] violated — [exact description].\nAfter 3+ consistent days on any problem: acknowledge, raise the bar.\nAfter a few days ask if there is anything else they want to work on.\nNew problems mentioned in chat: add baseline, track same way.";

function detectPatterns(logs) {
  if(!logs||!logs.length) return [];
  var p=[];
  var l3=logs.slice(-3);
  if(l3.length>=3&&l3.every(function(l){return !l.floorHit;})) p.push("Floor missed 3+ days — protect it first today");
  if(l3.length>=3&&l3.every(function(l){return !l.realThinking;})) p.push("3+ days passive work — hard problems only today");
  if(l3.length>=3&&l3.every(function(l){return !l.wellbeing;})) p.push("3+ days poor self-care — enforce all wellbeing blocks");
  if(l3.length>=3&&l3.every(function(l){return l.phoneViolation;})) p.push("Phone violated 3+ days — strict enforcement today");
  if(logs.filter(function(l){return l.patterns&&l.patterns.toLowerCase().indexOf("avoid")>=0;}).length>=3) p.push("Consistent avoidance — hard difficulty only today");
  return p;
}

function morningSystem(profile,auditLog) {
  var logs=auditLog?auditLog.slice(-7):[];
  var patterns=detectPatterns(logs);
  var streak=profile&&profile.studyStreak?profile.studyStreak:0;
  var sessionLen=streak>=7?"two 50min sessions":streak>=3?"one 50min session":"one 25min session";
  var name=profile&&profile.name?profile.name:"there";
  var subjects=profile&&profile.subjects&&profile.subjects.length?profile.subjects.join(", "):"not specified yet";
  var logStr=logs.length?logs.map(function(l){
    return "  "+l.date+": floor="+(l.floorHit?"yes":"NO")+", thinking="+(l.realThinking?"real":"PASSIVE")+", wellbeing="+(l.wellbeing?"yes":"NO")+", phone="+(l.phoneViolation?"VIOLATED":"clean");
  }).join("\n"):"  No history — day 1.";
  var patStr=patterns.length?"ACTIVE PATTERNS:\n"+patterns.map(function(p){return "  - "+p;}).join("\n"):"";
  var wakeInfo=profile&&profile.lastWakeTime?"Usually wakes around "+profile.lastWakeTime+".":"";

  return "You are a strict personal operating system coach. Time: "+timeStr()+". Date: "+dateStr()+".\n"+
    "Building discipline from zero. Install habits one layer at a time. Never overwhelm.\n\n"+
    FLOOR+"\n\n"+
    CORE_HABITS+"\n\n"+
    KNOWN_PROBLEMS+"\n\n"+
    "USER: "+name+" | Subjects: "+subjects+" | Study streak: "+streak+" days | Assign today: "+sessionLen+"\n"+
    wakeInfo+"\n\n"+
    "AUDIT HISTORY:\n"+logStr+"\n"+
    patStr+"\n\n"+
    "BEHAVIOUR:\n"+
    "Parse the day dump immediately. Build the full schedule. Do not ask for info already given.\n"+
    "Extract all fixed events automatically. Ask ONE question after schedule only if critical info missing.\n"+
    "Learn subjects, wake times, patterns from conversation and save them.\n\n"+
    "SCHEDULE RULES:\n"+
    "Every hour wake to sleep accounted for. Zero gaps.\n"+
    "Morning routine first. All meals at correct times. Hygiene blocks explicit. Movement block in.\n"+
    "Study at high-energy window. Streak-gated length. Hard tasks placed first.\n"+
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

function auditSystem(profile,auditLog) {
  var logs=auditLog?auditLog.slice(-7):[];
  var patterns=detectPatterns(logs);
  var name=profile&&profile.name?profile.name:"you";
  var streak=profile&&profile.studyStreak?profile.studyStreak:0;
  var logStr=logs.length?logs.map(function(l){
    return "  "+l.date+": floor="+(l.floorHit?"yes":"NO")+", thinking="+(l.realThinking?"real":"PASSIVE")+", wellbeing="+(l.wellbeing?"yes":"NO")+", phone="+(l.phoneViolation?"VIOLATED":"clean");
  }).join("\n"):"  No history yet.";
  var patStr=patterns.length?"ACTIVE PATTERNS:\n"+patterns.map(function(p){return "  - "+p;}).join("\n"):"";

  return "You are auditing "+name+"'s day. Study streak: "+streak+" days.\n"+
    "11 confirmed baseline problems. Track each. Call out failures by problem number and name. No softening.\n\n"+
    FLOOR+"\n\n"+
    KNOWN_PROBLEMS+"\n\n"+
    "AUDIT LOG:\n"+logStr+"\n"+
    patStr+"\n\n"+
    "Ask these questions in ONE message (numbered):\n"+
    "1. Did you hit your floor? One 25min active problem-solving session — yes or no?\n"+
    "2. Was it active (problem-solving) or passive (reading, watching, reviewing)?\n"+
    "3. Did you complete morning routine — water, shower, teeth, dressed, breakfast, no phone?\n"+
    "4. Did you eat all three meals? Did you go for a walk?\n"+
    "5. Did phone stay away during study, meals, and night routine?\n"+
    "6. Were today's constraints real or self-created?\n"+
    "7. Any pattern you notice in yourself this week?\n\n"+
    "After they answer:\n"+
    "Call out violations specifically: 'Problem 1 violated — phone used during study session.'\n"+
    "Floor hit = streak +1. Floor missed = streak resets to 0. State it clearly.\n"+
    "Pattern 3+ days = name it and state what changes tomorrow.\n"+
    "Good day = acknowledge briefly, then raise the bar.\n\n"+
    "End with:\n"+
    "<AUDIT>\n"+
    "{\"date\":\""+todayStr()+"\",\"floorHit\":false,\"realThinking\":false,\"wellbeing\":false,\"phoneViolation\":false,\"constraints\":\"note\",\"patterns\":\"observation\",\"newStreak\":0}\n"+
    "</AUDIT>";
}

function coachSystem(profile) {
  var name=profile&&profile.name?profile.name:"you";
  var streak=profile&&profile.studyStreak?profile.studyStreak:0;
  return "You are the operating system coach for "+name+". Study streak: "+streak+" days.\n"+
    FLOOR+"\n"+
    "Max 3 sentences. Specific. No fluff.\n"+
    "Refuse requests to skip problem-solving, shower, meals, or phone-free blocks.\n"+
    "Schedule tweak: SCHEDULE_UPDATE:{\"index\":<n>,\"time\":\"HH:MM\",\"end\":\"HH:MM\",\"title\":\"...\",\"work\":\"...\"}\n"+
    "Full rebuild: REBUILD_NEEDED";
}

function Header(props) {
  var mode=props.mode;
  var _s=useState(timeStr()); var now=_s[0]; var setNow=_s[1];
  useEffect(function(){ var t=setInterval(function(){setNow(timeStr());},1000); return function(){clearInterval(t);}; },[]);
  var labels={morning:"Morning — build your day",executing:"Executing — stay on track",audit:"Evening Audit"};
  var bg={morning:"#0a0a00",executing:"#000a00",audit:"#0a000a"};
  return React.createElement("div",{style:{padding:"13px 18px 9px",borderBottom:"1px solid #141414",background:bg[mode],display:"flex",justifyContent:"space-between",alignItems:"center"}},
    React.createElement("div",null,
      React.createElement("div",{style:{color:"#444",fontSize:10,letterSpacing:2,textTransform:"uppercase"}},dateStr()),
      React.createElement("div",{style:{color:"#444",fontSize:11,marginTop:2}},labels[mode])
    ),
    React.createElement("div",{style:{color:"#555",fontSize:20,fontWeight:700,fontVariantNumeric:"tabular-nums"}},now)
  );
}

function ScheduleBlock(props) {
  var block=props.block, state=props.state;
  var isCur=state==="current", isPast=state==="past";
  var bgs={deep:"#0d0d00",light:"#000d0d",break:"transparent",fixed:"#0d000d",meal:"#000a10",movement:"#000d06",hygiene:"#080010",routine:"#0d0800","wind-down":"#100008"};
  var bls={deep:"#2a2a00",light:"#002a2a",break:"#141414",fixed:"#2a002a",meal:"#001520",movement:"#001a0d",hygiene:"#10001a",routine:"#1a1000","wind-down":"#1a0010"};
  var typeLabel={deep:"DEEP",meal:"MEAL",movement:"MOVE",hygiene:"HYGIENE",routine:"ROUTINE","wind-down":"WIND"};
  return React.createElement("div",{style:{margin:"0 4px 2px",padding:isCur?"11px 14px":"8px 14px",borderRadius:7,background:isCur?"#1a1a1a":bgs[block.type]||"transparent",borderLeft:"2px solid "+(isCur?"#fff":bls[block.type]||"#141414"),opacity:isPast?0.2:1}},
    React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10}},
      React.createElement("span",{style:{color:isCur?"#888":"#3a3a3a",fontSize:11,minWidth:95,fontVariantNumeric:"tabular-nums",flexShrink:0}},block.time+"–"+block.end),
      React.createElement("span",{style:{color:isCur?"#fff":isPast?"#444":"#bbb",fontSize:isCur?14:13,fontWeight:isCur?600:400,flex:1,lineHeight:1.3}},block.title),
      isCur&&React.createElement("span",{style:{color:"#000",background:"#fff",fontSize:8,fontWeight:700,letterSpacing:1.5,padding:"2px 5px",borderRadius:3}},"NOW"),
      !isCur&&!isPast&&typeLabel[block.type]&&React.createElement("span",{style:{color:"#333",fontSize:8,letterSpacing:1}},typeLabel[block.type])
    ),
    block.work&&block.work!=="none"&&!isPast&&React.createElement("div",{style:{marginTop:5,marginLeft:105,color:isCur?"#555":"#2a2a2a",fontSize:11,lineHeight:1.5,fontStyle:"italic"}},block.work)
  );
}

function ScheduleList(props) {
  var blocks=props.blocks;
  var ref=useRef(null);
  var ci=getCurIdx(blocks);
  useEffect(function(){
    if(ref.current&&ci>=0){
      var els=ref.current.querySelectorAll("[data-idx]");
      if(els[ci]) els[ci].scrollIntoView({block:"center",behavior:"smooth"});
    }
  },[ci,blocks.length]);
  if(!blocks.length) return React.createElement("div",{style:{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6}},
    React.createElement("div",{style:{color:"#222",fontSize:13}},"No schedule yet."),
    React.createElement("div",{style:{color:"#1a1a1a",fontSize:11}},"Tell me about your day \u2193")
  );
  return React.createElement("div",{ref:ref,style:{flex:1,overflowY:"auto",padding:"6px 0"}},
    blocks.map(function(b,i){
      return React.createElement("div",{key:i,"data-idx":i},
        React.createElement(ScheduleBlock,{block:b,state:i===ci?"current":i<ci?"past":"future"})
      );
    })
  );
}

function MessageBubble(props) {
  var msg=props.msg, isUser=msg.role==="user";
  return React.createElement("div",{style:{alignSelf:isUser?"flex-end":"flex-start",background:isUser?"#1e1e1e":"#161616",border:"1px solid "+(isUser?"#2a2a2a":"#1e1e1e"),color:isUser?"#e0e0e0":"#aaa",fontSize:13,lineHeight:1.6,padding:"8px 12px",borderRadius:8,maxWidth:"85%",whiteSpace:"pre-wrap"}},msg.text);
}

function ChatFeed(props) {
  var messages=props.messages, loading=props.loading, feedRef=props.feedRef;
  return React.createElement("div",{ref:feedRef,style:{height:185,overflowY:"auto",padding:"8px 18px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #141414"}},
    !messages.length&&React.createElement("div",{style:{color:"#1e1e1e",fontSize:12,margin:"auto",textAlign:"center"}},"Tell me about your day."),
    messages.map(function(m,i){return React.createElement(MessageBubble,{key:i,msg:m});}),
    loading&&React.createElement(MessageBubble,{msg:{role:"ai",text:"\u2026"}})
  );
}

function InputBar(props) {
  var value=props.value, onChange=props.onChange, onSend=props.onSend, disabled=props.disabled, mode=props.mode;
  var ph=mode==="morning"?"Tell me about your day\u2026":mode==="audit"?"Report in\u2026":"Talk to your coach\u2026";
  return React.createElement("div",{style:{display:"flex",gap:8,padding:"10px 18px 14px",borderTop:"1px solid #141414",background:"#0a0a0a"}},
    React.createElement("input",{style:{flex:1,background:"#111",border:"1px solid #222",borderRadius:7,color:"#fff",padding:"9px 13px",fontSize:14,outline:"none",fontFamily:"inherit"},placeholder:ph,value:value,onChange:function(e){onChange(e.target.value);},onKeyDown:function(e){if(e.key==="Enter"&&!e.shiftKey)onSend();},disabled:disabled}),
    React.createElement("button",{onClick:onSend,disabled:disabled,style:{background:"#fff",color:"#000",border:"none",borderRadius:7,width:38,fontSize:16,fontWeight:700,cursor:"pointer",opacity:disabled?0.4:1}},"\u2191")
  );
}

function Setup(props) {
  var onComplete=props.onComplete;
  var _s=useState(""); var name=_s[0]; var setName=_s[1];
  return React.createElement("div",{style:{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",alignItems:"center",justifyContent:"center"}},
    React.createElement("div",{style:{background:"#111",border:"1px solid #1e1e1e",borderRadius:10,padding:"28px 24px",width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:14}},
      React.createElement("div",{style:{color:"#fff",fontSize:16,fontWeight:700}},"What's your name?"),
      React.createElement("div",{style:{color:"#333",fontSize:12,lineHeight:1.7}},"Tell the coach your day each morning. It learns everything else from you as you go."),
      React.createElement("input",{value:name,onChange:function(e){setName(e.target.value);},placeholder:"Your name",autoFocus:true,onKeyDown:function(e){if(e.key==="Enter"&&name.trim())onComplete({name:name.trim(),studyStreak:0,subjects:[]});},style:{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:6,color:"#fff",padding:"10px 12px",fontSize:14,outline:"none"}}),
      React.createElement("button",{onClick:function(){if(name.trim())onComplete({name:name.trim(),studyStreak:0,subjects:[]});},style:{background:"#fff",color:"#000",border:"none",borderRadius:6,padding:"11px",fontSize:14,fontWeight:600,cursor:"pointer"}},"Start \u2192")
    )
  );
}

function MainScreen(props) {
  var initProfile=props.profile;
  var _p=useState(initProfile); var profile=_p[0]; var setProfile=_p[1];
  var _sc=useState([]); var schedule=_sc[0]; var setSchedule=_sc[1];
  var _al=useState([]); var auditLog=_al[0]; var setAuditLog=_al[1];
  var _msg=useState([]); var messages=_msg[0]; var setMessages=_msg[1];
  var _in=useState(""); var input=_in[0]; var setInput=_in[1];
  var _ld=useState(false); var loading=_ld[0]; var setLoading=_ld[1];
  var _md=useState(getMode()); var mode=_md[0]; var setMode=_md[1];
  var _as=useState(false); var auditStarted=_as[0]; var setAuditStarted=_as[1];
  var feedRef=useRef(null);
  var convHistory=useRef([]);

  useEffect(function(){var t=setInterval(function(){setMode(getMode());},60000);return function(){clearInterval(t);};},[]);
  useEffect(function(){if(feedRef.current)feedRef.current.scrollTop=feedRef.current.scrollHeight;},[messages,loading]);

  useEffect(function(){
    Promise.all([sGet(SK.schedule),sGet(SK.auditLog)]).then(function(res){
      var s=res[0],a=res[1];
      if(s&&s.date===todayStr()&&s.blocks&&s.blocks.length)setSchedule(s.blocks);
      if(a)setAuditLog(a);
      var m=getMode();
      if(m==="audit"&&(!a||!a.find(function(l){return l.date===todayStr();}))){
        triggerAudit(a||[]);
      } else if(m==="morning"){
        setMessages([{role:"ai",text:"Morning, "+initProfile.name+". What's your day looking like? Tell me everything — when you woke up, what's fixed, how you're feeling, what needs to get done."}]);
      } else {
        setMessages([{role:"ai",text:"You're mid-day. Talk to me if you need to adjust anything."}]);
      }
    });
  },[]);

  function saveProfile(p){setProfile(p);return sSet(SK.profile,p);}

  function claudeCall(msgs,sys){
    var body={model:"claude-sonnet-4-5",max_tokens:2000,messages:msgs};
    if(sys)body.system=sys;
    return fetch(CLAUDE_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      .then(function(r){return r.json();})
      .then(function(d){return d.content?d.content.map(function(c){return c.text||"";}).join(""):"";});
  }

  function triggerAudit(log){
    setAuditStarted(true);setLoading(true);
    claudeCall([{role:"user",content:"Run the evening audit."}],auditSystem(profile,log)).then(function(raw){
      var clean=raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim();
      convHistory.current=[{role:"user",content:"Run the evening audit."},{role:"assistant",content:raw}];
      setMessages([{role:"ai",text:clean}]);
      setLoading(false);
    }).catch(function(){setMessages([{role:"ai",text:"Audit failed. Report in manually."}]);setLoading(false);});
  }

  function send(){
    if(!input.trim()||loading)return;
    var msg=input.trim();setInput("");
    setMessages(function(m){return m.concat([{role:"user",text:msg}]);});
    convHistory.current=convHistory.current.concat([{role:"user",content:msg}]);
    setLoading(true);

    if(mode==="morning"&&!schedule.length){
      claudeCall(convHistory.current,morningSystem(profile,auditLog)).then(function(raw){
        convHistory.current=convHistory.current.concat([{role:"assistant",content:raw}]);
        var sm=raw.match(/<SCHEDULE>([\s\S]*?)<\/SCHEDULE>/);
        if(sm){try{var blocks=JSON.parse(sm[1].trim());setSchedule(blocks);sSet(SK.schedule,{date:todayStr(),blocks:blocks});}catch(e){console.error(e);}}
        var pm=raw.match(/<PROFILE_UPDATE>([\s\S]*?)<\/PROFILE_UPDATE>/);
        if(pm){try{
          var u=JSON.parse(pm[1].trim());
          var merged=Object.assign({},profile);
          if(u.subjects&&u.subjects.length)merged.subjects=Array.from(new Set((merged.subjects||[]).concat(u.subjects)));
          if(u.lastWakeTime)merged.lastWakeTime=u.lastWakeTime;
          if(u.lastSleepTime)merged.lastSleepTime=u.lastSleepTime;
          if(u.notes)merged.notes=u.notes;
          saveProfile(merged);
        }catch(e){console.error(e);}}
        var clean=raw.replace(/<SCHEDULE>[\s\S]*?<\/SCHEDULE>/g,"").replace(/<PROFILE_UPDATE>[\s\S]*?<\/PROFILE_UPDATE>/g,"").trim();
        setMessages(function(m){return m.concat([{role:"ai",text:clean}]);});
        setLoading(false);
      }).catch(function(e){console.error(e);setMessages(function(m){return m.concat([{role:"ai",text:"Error. Try again."}]);});setLoading(false);});

    } else if(mode==="audit"||auditStarted){
      claudeCall(convHistory.current,auditSystem(profile,auditLog)).then(function(raw){
        convHistory.current=convHistory.current.concat([{role:"assistant",content:raw}]);
        var am=raw.match(/<AUDIT>([\s\S]*?)<\/AUDIT>/);
        if(am){try{
          var entry=JSON.parse(am[1].trim());
          var newLog=auditLog.concat([entry]);
          setAuditLog(newLog);sSet(SK.auditLog,newLog);
          var ns=entry.newStreak!==undefined?entry.newStreak:(entry.floorHit?(profile.studyStreak||0)+1:0);
          saveProfile(Object.assign({},profile,{studyStreak:ns}));
        }catch(e){console.error(e);}}
        var clean=raw.replace(/<AUDIT>[\s\S]*?<\/AUDIT>/g,"").trim();
        setMessages(function(m){return m.concat([{role:"ai",text:clean}]);});
        setLoading(false);
      }).catch(function(e){console.error(e);setMessages(function(m){return m.concat([{role:"ai",text:"Error. Try again."}]);});setLoading(false);});

    } else {
      var ctx=schedule.map(function(b,i){return "["+i+"] "+b.time+"-"+b.end+" "+b.title;}).join(" | ");
      fetch(GROQ_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:coachSystem(profile),message:"Schedule: "+ctx+"\nTime: "+timeStr()+"\nUser: "+msg})})
        .then(function(r){return r.json();}).then(function(d){
          var raw=d.content||"";
          if(raw.indexOf("REBUILD_NEEDED")>=0){
            convHistory.current=[];setSchedule([]);sSet(SK.schedule,{date:todayStr(),blocks:[]});
            setMessages(function(m){return m.concat([{role:"ai",text:"Schedule cleared. Tell me your updated constraints."}]);});
            setLoading(false);return;
          }
          var upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
          if(upd){try{var o=JSON.parse(upd[1]);var nb=schedule.map(function(b,i){return i===o.index?Object.assign({},b,o):b;});setSchedule(nb);sSet(SK.schedule,{date:todayStr(),blocks:nb});}catch(e){console.error(e);}}
          var clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/REBUILD_NEEDED/g,"").trim();
          if(clean)setMessages(function(m){return m.concat([{role:"ai",text:clean}]);});
          setLoading(false);
        }).catch(function(e){console.error(e);setMessages(function(m){return m.concat([{role:"ai",text:"Groq unreachable."}]);});setLoading(false);});
    }
  }

  return React.createElement("div",{style:{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}},
    React.createElement(Header,{mode:mode}),
    React.createElement(ScheduleList,{blocks:schedule}),
    React.createElement(ChatFeed,{messages:messages,loading:loading,feedRef:feedRef}),
    React.createElement(InputBar,{value:input,onChange:setInput,onSend:send,disabled:loading,mode:mode})
  );
}

export default function App() {
  var _s=useState(null); var state=_s[0]; var setState=_s[1];
  useEffect(function(){sGet(SK.profile).then(function(p){setState(p&&p.name?p:false);});},[]);
  function handleSetup(p){sSet(SK.profile,p).then(function(){setState(p);});}
  if(state===null)return React.createElement("div",{style:{height:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center"}},React.createElement("div",{style:{color:"#222",fontSize:10,letterSpacing:2,textTransform:"uppercase"}},"Loading\u2026"));
  if(state===false)return React.createElement(Setup,{onComplete:handleSetup});
  return React.createElement(MainScreen,{profile:state});
}