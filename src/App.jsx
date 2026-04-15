import { useState, useEffect, useRef } from "react";

// ── API Routes (your Vercel backend) ──────────────────
const CLAUDE_API = "/api/generate";
const GROQ_API   = "/api/groq";

// ── Utils ──────────────────────────────────────────────
function toMins(t) { const [h,m]=t.split(":").map(Number); return h*60+m; }
function nowMins() { const n=new Date(); return n.getHours()*60+n.getMinutes(); }
function timeStr() { return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function dateStr() { return new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"}); }
function curIdx(blocks) {
  const now=nowMins(); let idx=-1;
  for(let i=0;i<blocks.length;i++) if(toMins(blocks[i].time)<=now) idx=i;
  return idx;
}

// ── AI constants ───────────────────────────────────────
const COACH = `You are a strict daily schedule coach. Be direct. Max 2 sentences.
Push back on excuses. Only change schedule if truly needed.
For one small change append: SCHEDULE_UPDATE:{"index":<n>,"time":"HH:MM","title":"text"}
If full rebuild needed reply only: REBUILD_NEEDED`;

// ── Sub-components ─────────────────────────────────────

function Header({ date }) {
  return (
    <div style={{padding:"16px 16px 8px"}}>
      <div style={{color:"#3a3a3a",fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>{date}</div>
    </div>
  );
}

function StatusCard({ cur, next }) {
  if (!cur && !next) return null;
  return (
    <div style={{margin:"0 16px 12px",background:"#111",border:"1px solid #1e1e1e",borderRadius:8,padding:"11px 14px"}}>
      {cur && (
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:"#fff",fontSize:9,letterSpacing:2,background:"#222",padding:"2px 6px",borderRadius:3}}>NOW</span>
          <span style={{color:"#fff",fontSize:15,fontWeight:600,flex:1}}>{cur.title}</span>
          <span style={{color:"#444",fontSize:12}}>{cur.time}</span>
        </div>
      )}
      {next && (
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:cur?7:0,opacity:0.45}}>
          <span style={{color:"#555",fontSize:9,letterSpacing:2,background:"#161616",padding:"2px 6px",borderRadius:3}}>NEXT</span>
          <span style={{color:"#888",fontSize:13,flex:1}}>{next.title}</span>
          <span style={{color:"#444",fontSize:12}}>{next.time}</span>
        </div>
      )}
    </div>
  );
}

function ScheduleItem({ block, state }) {
  const base = {display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:6,marginBottom:1};
  const styles = {
    current: {...base, background:"#141414"},
    past:    {...base, opacity:0.22},
    future:  {...base},
  };
  const timeColor = state==="current"?"#777":state==="past"?"#2a2a2a":"#333";
  const titleColor = state==="current"?"#fff":state==="past"?"#333":"#555";
  const barColor = state==="current"?"#fff":"#1e1e1e";
  return (
    <div style={styles[state]}>
      <div style={{width:2,height:18,background:barColor,borderRadius:2,flexShrink:0}}/>
      <span style={{color:timeColor,fontSize:12,minWidth:40,fontVariantNumeric:"tabular-nums"}}>{block.time}</span>
      <span style={{color:titleColor,fontSize:14,fontWeight:state==="current"?600:400}}>{block.title}</span>
    </div>
  );
}

function ScheduleList({ blocks }) {
  const ci = curIdx(blocks);
  return (
    <div style={{flex:1,overflowY:"auto",padding:"0 16px 8px"}}>
      {blocks.length===0 && <div style={{color:"#2a2a2a",fontSize:13,padding:"20px 0",textAlign:"center"}}>Building schedule…</div>}
      {blocks.map((b,i)=>(
        <ScheduleItem key={i} block={b} state={i===ci?"current":i<ci?"past":"future"}/>
      ))}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role==="user";
  return (
    <div style={{
      alignSelf: isUser?"flex-end":"flex-start",
      background: isUser?"#1c1c1c":"#111",
      border: "1px solid "+(isUser?"#242424":"#1a1a1a"),
      color: isUser?"#fff":"#999",
      fontSize:13, lineHeight:1.5,
      padding:"7px 11px", borderRadius:8,
      maxWidth:"80%"
    }}>{msg.text}</div>
  );
}

function ChatFeed({ messages, loading, feedRef }) {
  return (
    <div ref={feedRef} style={{maxHeight:150,overflowY:"auto",padding:"6px 16px",display:"flex",flexDirection:"column",gap:5}}>
      {messages.map((m,i)=><MessageBubble key={i} msg={m}/>)}
      {loading && <MessageBubble msg={{role:"ai",text:"…"}}/>}
    </div>
  );
}

function InputBar({ value, onChange, onSend, disabled }) {
  return (
    <div style={{display:"flex",gap:8,padding:"10px 16px",borderTop:"1px solid #141414",background:"#0a0a0a"}}>
      <input
        style={{flex:1,background:"#111",border:"1px solid #1e1e1e",borderRadius:7,color:"#fff",padding:"9px 13px",fontSize:14,outline:"none",fontFamily:"inherit"}}
        placeholder="Talk to your coach…"
        value={value}
        onChange={e=>onChange(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&onSend()}
        disabled={disabled}
      />
      <button
        onClick={onSend}
        disabled={disabled}
        style={{background:"#fff",color:"#000",border:"none",borderRadius:7,width:38,fontSize:15,fontWeight:700,cursor:"pointer",opacity:disabled?0.4:1}}
      >↑</button>
    </div>
  );
}

function RebuildButton({ onClick, loading }) {
  return (
    <div style={{padding:"8px 16px 4px",display:"flex",justifyContent:"flex-end"}}>
      <button
        onClick={onClick}
        disabled={loading}
        style={{background:"transparent",border:"1px solid #1e1e1e",color:"#3a3a3a",borderRadius:5,padding:"5px 10px",fontSize:11,letterSpacing:0.5,cursor:"pointer",opacity:loading?0.4:1}}
      >{loading?"Rebuilding…":"Fix Schedule"}</button>
    </div>
  );
}

// ── Setup screens (keys + onboard, kept outside main) ──

function SetupKeys({ onDone }) {
  const [g,setG]=useState(""); const [c,setC]=useState("");
  return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:10,padding:"28px 24px",width:"100%",maxWidth:380,display:"flex",flexDirection:"column",gap:10}}>
        <div style={{color:"#fff",fontSize:18,fontWeight:700}}>Schedule Coach</div>
        <div style={{color:"#444",fontSize:13,marginBottom:4}}>Enter your API keys to begin.</div>
        <label style={{color:"#333",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Groq Key</label>
        <input type="password" placeholder="gsk_..." value={g} onChange={e=>setG(e.target.value)}
          style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:6,color:"#fff",padding:"9px 12px",fontSize:13,outline:"none",fontFamily:"monospace"}}/>
        <label style={{color:"#333",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Claude Key</label>
        <input type="password" placeholder="sk-ant-..." value={c} onChange={e=>setC(e.target.value)}
          style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:6,color:"#fff",padding:"9px 12px",fontSize:13,outline:"none",fontFamily:"monospace"}}/>
        <button onClick={()=>g&&c&&onDone(g,c)}
          style={{background:"#fff",color:"#000",border:"none",borderRadius:6,padding:"11px",fontSize:14,fontWeight:600,cursor:"pointer",marginTop:4}}>
          Continue →
        </button>
      </div>
    </div>
  );
}

function SetupOnboard({ onDone }) {
  const [v,setV]=useState("");
  return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:10,padding:"28px 24px",width:"100%",maxWidth:380,display:"flex",flexDirection:"column",gap:10}}>
        <div style={{color:"#fff",fontSize:18,fontWeight:700}}>What's today?</div>
        <div style={{color:"#444",fontSize:13,lineHeight:1.6,marginBottom:4}}>Describe what you need to do and when you woke up.</div>
        <textarea value={v} onChange={e=>setV(e.target.value)} rows={4}
          placeholder="e.g. Woke at 9. Deep work, gym at 5, sleep around midnight."
          style={{background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:6,color:"#ccc",padding:"10px 12px",fontSize:13,outline:"none",resize:"none",fontFamily:"inherit",lineHeight:1.6}}/>
        <button onClick={()=>v.trim()&&onDone(v)}
          style={{background:"#fff",color:"#000",border:"none",borderRadius:6,padding:"11px",fontSize:14,fontWeight:600,cursor:"pointer",marginTop:4}}>
          Build My Day →
        </button>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────

function MainScreen({ groqKey, claudeKey, initCtx }) {
  const [schedule, setSchedule] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const feedRef = useRef(null);
  const [tick, setTick] = useState(0);

  useEffect(()=>{ const t=setInterval(()=>setTick(x=>x+1),30000); return()=>clearInterval(t); },[]);
  useEffect(()=>{ if(feedRef.current) feedRef.current.scrollTop=feedRef.current.scrollHeight; },[messages,loading]);
  useEffect(()=>{ buildSchedule(initCtx); },[]);

  const ci = curIdx(schedule);

  async function claudeCall(prompt) {
    const r = await fetch(CLAUDE_API, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"claude-sonnet-4-5",
        max_tokens:1000,
        messages:[{role:"user",content:prompt}]
      })
    });
    const d = await r.json();
    return d.content?.map(c=>c.text||"").join("")||"";
  }

  async function buildSchedule(ctx) {
    setRebuilding(true);
    try {
      const raw = await claudeCall(`Build a daily schedule. Context: ${ctx}. Now: ${timeStr()}.
Return ONLY a raw JSON array, no markdown.
[{"time":"HH:MM","title":"Short task"}]
Rules: 24h time, 8–12 blocks, start from now, titles max 4 words.`);
      setSchedule(JSON.parse(raw.replace(/```json|```/g,"").trim()));
      setMessages([{role:"ai",text:"Schedule set. Stay on it."}]);
    } catch { setMessages([{role:"ai",text:"Failed. Check Claude key."}]); }
    setRebuilding(false);
  }

  async function rebuild() {
    setRebuilding(true);
    try {
      const raw = await claudeCall(`Rebuild from now. Existing: ${JSON.stringify(schedule)}. Time: ${timeStr()}.
Return ONLY raw JSON array, no markdown.
[{"time":"HH:MM","title":"Short task"}]
8–12 blocks, start from current time.`);
      setSchedule(JSON.parse(raw.replace(/```json|```/g,"").trim()));
      setMessages(m=>[...m,{role:"ai",text:"Rebuilt. No more detours."}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Rebuild failed."}]); }
    setRebuilding(false);
  }

  async function send() {
    if(!input.trim()||loading) return;
    const msg=input.trim(); setInput("");
    setMessages(m=>[...m,{role:"user",text:msg}]); setLoading(true);
    const ctx=schedule.map((b,i)=>`[${i}]${b.time} ${b.title}${i===ci?" ←NOW":""}`).join(" | ");
    try {
      const r = await fetch(GROQ_API, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          system: COACH,
          message: `Schedule: ${ctx}\nUser: ${msg}`
        })
      });
      const d=await r.json();
      const raw=d.content||"Error.";
      if(raw.includes("REBUILD_NEEDED")){
        setMessages(m=>[...m,{role:"ai",text:"Rebuilding your day…"}]);
        setLoading(false); await rebuild(); return;
      }
      const upd=raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
      if(upd){ try{ const o=JSON.parse(upd[1]); setSchedule(s=>s.map((b,i)=>i===o.index?{time:o.time||b.time,title:o.title||b.title}:b)); }catch{} }
      const clean=raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").trim();
      if(clean) setMessages(m=>[...m,{role:"ai",text:clean}]);
    } catch { setMessages(m=>[...m,{role:"ai",text:"Groq unreachable."}]); }
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"system-ui,sans-serif",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto"}}>
      <Header date={dateStr()} />
      <StatusCard cur={schedule[ci]||null} next={schedule[ci+1]||null} />
      <ScheduleList blocks={schedule} />
      <ChatFeed messages={messages} loading={loading} feedRef={feedRef} />
      <RebuildButton onClick={rebuild} loading={rebuilding} />
      <InputBar value={input} onChange={setInput} onSend={send} disabled={loading||rebuilding} />
    </div>
  );
}

// ── App root ───────────────────────────────────────────

export default function App() {
  const [step, setStep] = useState(0);
  const [keys, setKeys] = useState({groq:"",claude:""});
  const [ctx, setCtx] = useState("");

  if(step===0) return <SetupOnboard onDone={v=>{ setCtx(v); setStep(2); }}/>;
  return <MainScreen groqKey="" claudeKey="" initCtx={ctx}/>;
}