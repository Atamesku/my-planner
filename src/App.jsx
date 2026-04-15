import { useState, useEffect, useRef } from "react";

const CLAUDE_API = "/api/generate";
const GROQ_API   = "/api/groq";

// ── Utils ──────────────────────────────────────────────
function toMins(t) { const [h,m]=t.split(":").map(Number); return h*60+m; }
function nowMins() { const n=new Date(); return n.getHours()*60+n.getMinutes(); }
function timeStr() { return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function dateStr() { return new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"}); }
function weekNum() { return Math.ceil(new Date().getDate()/7); }
function getCurIdx(blocks) {
  const now=nowMins(); let idx=-1;
  for(let i=0;i<blocks.length;i++) { if(toMins(blocks[i].time)<=now) idx=i; else break; }
  return idx;
}
const WEEK_MODE = ["Understanding","Active Recall","Application","Error Correction"];
const WEEK_CUES = [
  "Explain why this works in your own words.",
  "Close notes and recall everything you know.",
  "Solve this without looking at solutions.",
  "Find your mistakes and fix your reasoning.",
];

// ── System prompts ─────────────────────────────────────
function buildSystemPrompt(profile) {
  const wk = (weekNum()-1)%4;
  return `You are a strict AI schedule coach. Build realistic, structured daily schedules.

CURRENT WEEK MODE: Week ${wk+1} — ${WEEK_MODE[wk]}
STUDY CUE FOR ALL STUDY BLOCKS: "${WEEK_CUES[wk]}"
USER FOCUS LENGTH: ${profile.focusMins} min work / ${profile.breakMins} min break

SCHEDULING RULES (priority order):
1. Fixed events first (tests, classes, work — never move these)
2. Sleep always protected (${profile.sleepHours}h minimum, never cut)
3. 30–60 min buffer before any important fixed event
4. Study/task blocks fill remaining time
- Never create unrealistic blocks
- If time is short, drop lower priority tasks — do not compress sleep
- Break all study into focus blocks: ${profile.focusMins} min work + ${profile.breakMins} min break
- Each study block must include the week cue as a subtitle

COACH RULES:
- Be direct. Max 2 sentences per reply.
- Push back before making any change.
- Small change: append SCHEDULE_UPDATE:{"index":<n>,"time":"HH:MM","title":"text","cue":"optional cue"}
- Full rebuild needed: reply only REBUILD_NEEDED
- If user did well today, append: FOCUS_UP
- If user struggled, append: FOCUS_DOWN`;
}

// ── Components ─────────────────────────────────────────
function Header({ date, mode }) {
  return (
    <div style={{padding:"14px 18px 10px",borderBottom:"1px solid #141414",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{color:"#444",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>{date}</div>
      <div style={{color:"#333",fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>Wk {(weekNum()-1)%4+1} · {mode}</div>
    </div>
  );
}

function ScheduleItem({ block, state }) {
  const isCur=state==="current", isPast=state==="past";
  return (
    <div style={{
      padding: isCur?"11px 14px":"8px 14px",
      borderRadius:7, marginBottom:2,
      background: isCur?"#161616":"transparent",
      borderLeft: isCur?"2px solid #fff":"2px solid transparent",
      opacity: isPast?0.28:1,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <span style={{color:isCur?"#aaa":isPast?"#333":"#555",fontSize:12,minWidth:42,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{block.time}</span>
        <span style={{color:isCur?"#fff":isPast?"#444":"#ccc",fontSize:isCur?15:14,fontWeight:isCur?600:400,flex:1}}>{block.title}</span>
        {isCur && <span style={{color:"#000",background:"#fff",fontSize:9,fontWeight:700,letterSpacing:1.5,padding:"2px 6px",borderRadius:3,flexShrink:0}}>NOW</span>}
      </div>
      {block.cue && !isPast && (
        <div style={{marginTop:4,marginLeft:54,color:isCur?"#666":"#3a3a3a",fontSize:11,lineHeight:1.4,fontStyle:"italic"}}>
          {block.cue}
        </div>
      )}
    </div>
  );
}

function ScheduleList({ blocks, curIdx }) {
  const ref=useRef(null);
  useEffect(()=>{
    if(ref.current&&curIdx>=0){
      const els=ref.current.querySelectorAll("[data-idx]");
      if(els[curIdx]) els[curIdx].scrollIntoView({block:"center",behavior:"smooth"});
    }
  },[curIdx,blocks.length]);
  return (
    <div ref={ref} style={{flex:1,overflowY:"auto",padding:"8px 4px 6px"}}>
      {blocks.length===0&&<div style={{color:"#333",fontSize:13,padding:"32px 0",textAlign:"center"}}>Building your schedule…</div>}
      {blocks.map((b,i)=>(
        <div key={i} data-idx={i}>
          <ScheduleItem block={b} state={i===curIdx?"current":i<curIdx?"past":"future"}/>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser=msg.role==="user";
  return (
    <div style={{
      alignSelf:isUser?"flex-end":"flex-start",
      background:isUser?"#1e1e1e":"#161616",
      border:`1px solid ${isUser?"#2a2a2a":"#1e1e1e"}`,
      color:isUser?"#e0e0e0":"#aaa",
      fontSize:13,lineHeight:1.55,
      padding:"8px 12px",borderRadius:8,maxWidth:"82%",
    }}>{msg.text}</div>
  );
}

function ChatFeed({ messages, loading, feedRef }) {
  return (
    <div ref={feedRef} style={{height:160,overflowY:"auto",padding:"8px 18px",display:"flex",flexDirection:"column",gap:6,borderTop:"1px solid #141414"}}>
      {messages.length===0&&<div style={{color:"#2a2a2a",fontSize:12,margin:"auto",textAlign:"center"}}>Chat with your coach below</div>}
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading&&<MessageBubble msg={{role:"ai",text:"…"}}/>}
    </div>
  );
}

function InputBar({ value, onChange, onSend, onRebuild, disabled, rebuilding }) {
  return (
    <div style={{display:"flex",gap:8,padding:"10px 18px 14px",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
      <input
        style={{flex:1,background:"#111",border:"1px solid #222",borderRadius:7,color:"#fff",padding:"9px 13px",fontSize:14,outline:"none",fontFamily:"inherit"}}
        placeholder="Talk to your coach…"
        value={value} onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&onSend()}
        disabled={disabled}
      />
      <button onClick={onSend} disabled={disabled} style={{background:"#fff",color:"#000",border:"none",borderRadius:7,width:38,fontSize:16,fontWeight:700,cursor:"pointer",opacity:disabled?0.4:1}}>↑</button>
      <button onClick={onRebuild} disabled={rebuilding} style={{background:"transparent",border:"1px solid #222",color:"#555",borderRadius:7,padding:"0 12px",fontSize:11,cursor:"pointer",opacity:rebuilding?0.4:1,whiteSpace:"nowrap"}}>{rebuilding?"…":"Fix"}</button>
    </div>
  );
}

// ── Onboard ────────────────────────────────────────────
function SetupOnboard({ onDone }) {
  const [v,setV]=useState("");
  return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:10,padding:"28px 24px",width:"100%",maxWidth:400,display:"flex",flexDirection:"column",gap:10}}>
        <div style={{color:"#fff",fontSize:18,fontWeight:700}}>What's today?</div>
        <div style={{color:"#555",fontSize:13,lineHeight:1.7}}>
          Tell me your fixed events (tests, classes, work), when you woke up, and when you want to sleep.
        </div>
        <textarea value={v} onChange={e=>setV(e.target.value)} rows={5}
          placeholder={"e.g. Woke at 8am. Exam at 2pm. Work 5–9pm. Sleep by midnight.\nNeed to study maths and review notes."}
          style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:6,color:"#ccc",padding:"10px 12px",fontSize:13,outline:"none",resize:"none",fontFamily:"inherit",lineHeight:1.6}}/>
        <button onClick={()=>v.trim()&&onDone(v)}
          style={{background:"#fff",color:"#000",border:"none",borderRadius:6,padding:"11px",fontSize:14,fontWeight:600,cursor:"pointer"}}>
          Build My Day →
        </button>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────
function MainScreen({ initCtx }) {
  const [schedule,setSchedule]=useState([]);
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [rebuilding,setRebuilding]=useState(false);
  const [profile,setProfile]=useState({ focusMins:25, breakMins:5, sleepHours:8 });
  const [tick,setTick]=useState(0);
  const feedRef=useRef(null);

  useEffect(()=>{ const t=setInterval(()=>setTick(x=>x+1),60000); return()=>clearInterval(t); },[]);
  useEffect(()=>{ if(feedRef.current) feedRef.current.scrollTop=feedRef.current.scrollHeight; },[messages,loading]);
  useEffect(()=>{ buildSchedule(initCtx); },[]);

  const ci=getCurIdx(schedule);
  const wk=(weekNum()-1)%4;

  async function claudeCall(prompt) {
    const r=await fetch(CLAUDE_API,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:1500,messages:[{role:"user",content:prompt}]})
    });
    const d=await r.json();
    return d.content?.map(c=>c.text||"").join("")||"";
  }

  const SCHEDULE_PROMPT = (ctx) =>
`Build a structured daily schedule. Context: ${ctx}
Current time: ${timeStr()}. Week ${wk+1} mode: ${WEEK_MODE[wk]}.
Focus: ${profile.focusMins} min work / ${profile.breakMins} min break.
Study cue this week: "${WEEK_CUES[wk]}"

RULES:
- Priority: fixed events → sleep (${profile.sleepHours}h protected) → buffers → study/tasks
- Never compress sleep to fit tasks
- Break all study into ${profile.focusMins}-min focus blocks followed by ${profile.breakMins}-min breaks
- Add the week cue as "cue" field on study blocks only
- Buffer 30–60 min before any exam or important event
- Drop low-priority tasks if time is short — do not overload

Return ONLY a raw JSON array, no markdown, no explanation:
[{"time":"HH:MM","title":"Short title","cue":"optional — study blocks only"}]
8–14 blocks. 24h time. Titles max 5 words.`;

  async function buildSchedule(ctx) {
    setRebuilding(true);
    try {
      const raw=await claudeCall(SCHEDULE_PROMPT(ctx));
      setSchedule(JSON.parse(raw.replace(/```json|```/g,"").trim()));
      setMessages([{role:"ai",text:`Week ${wk+1}: ${WEEK_MODE[wk]}. Schedule locked.`}]);
    } catch { setMessages([{role:"ai",text:"Failed to build. Check API route."}]); }
    setRebuilding(false);
  }

  async function rebuild() {
    setRebuilding(true);
    try {
      const ctx=`Existing: ${JSON.stringify(schedule)}. Rebuild from now (${timeStr()}).`;
      const raw=await claudeCall(SCHEDULE_PROMPT(ctx));
      setSchedule(JSON.parse(raw.replace(/```json|```/g,"").trim()));
      setMessages(m=>[...m,{role:"ai",text:"Rebuilt. Back on track."}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Rebuild failed."}]); }
    setRebuilding(false);
  }

  async function send() {
    if(!input.trim()||loading) return;
    const msg=input.trim(); setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]); setLoading(true);
    const ctx=schedule.map((b,i)=>`[${i}]${b.time} ${b.title}${i===ci?" ←NOW":""}`).join(" | ");
    try {
      const r=await fetch(GROQ_API,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({system:buildSystemPrompt(profile),message:`Schedule: ${ctx}\nUser: ${msg}`})
      });
      const d=await r.json();
      const raw=d.content||"Error.";

      if(raw.includes("FOCUS_UP")) setProfile(p=>({...p,focusMins:Math.min(p.focusMins+5,50),breakMins:p.breakMins}));
      if(raw.includes("FOCUS_DOWN")) setProfile(p=>({...p,focusMins:Math.max(p.focusMins-5,15)}));
      if(raw.includes("REBUILD_NEEDED")){
        setMessages(m=>[...m,{role:"ai",text:"Rebuilding your day…"}]);
        setLoading(false); await rebuild(); return;
      }
      const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
      if(upd){ try{ const o=JSON.parse(upd[1]); setSchedule(s=>s.map((b,i)=>i===o.index?{...b,...o}:b)); }catch{} }
      const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").replace(/FOCUS_UP|FOCUS_DOWN/g,"").trim();
      if(clean) setMessages(m=>[...m,{role:"ai",text:clean}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Groq unreachable."}]); }
    setLoading(false);
  }

  return (
    <div style={{height:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      <Header date={dateStr()} mode={WEEK_MODE[wk]}/>
      <ScheduleList blocks={schedule} curIdx={ci}/>
      <ChatFeed messages={messages} loading={loading} feedRef={feedRef}/>
      <InputBar value={input} onChange={setInput} onSend={send} onRebuild={rebuild} disabled={loading} rebuilding={rebuilding}/>
    </div>
  );
}

export default function App() {
  const [ctx,setCtx]=useState(null);
  if(!ctx) return <SetupOnboard onDone={v=>setCtx(v)}/>;
  return <MainScreen initCtx={ctx}/>;
}