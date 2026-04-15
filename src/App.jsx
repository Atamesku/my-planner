import { useState, useEffect, useRef } from "react";

const CLAUDE_API = "/api/generate";
const GROQ_API   = "/api/groq";

// ── Utils ──────────────────────────────────────────────
function toMins(t) {
  const [h,m] = t.split(":").map(Number);
  return h * 60 + m;
}
function nowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}
function timeStr() {
  return new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
}
function dateStr() {
  return new Date().toLocaleDateString([], { weekday:"long", month:"long", day:"numeric" });
}
function getCurIdx(blocks) {
  const now = nowMins();
  let idx = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (toMins(blocks[i].time) <= now) idx = i;
    else break;
  }
  return idx;
}

// ── Coach prompt ───────────────────────────────────────
const COACH = `You are a strict daily schedule coach. Be direct. Max 2 sentences.
Push back on excuses. Only change schedule if truly needed.
For one small change append: SCHEDULE_UPDATE:{"index":<n>,"time":"HH:MM","title":"text"}
If full rebuild needed reply only: REBUILD_NEEDED`;

// ── Components ─────────────────────────────────────────

function Header({ date }) {
  return (
    <div style={{ padding:"16px 18px 10px", borderBottom:"1px solid #141414" }}>
      <div style={{ color:"#444", fontSize:11, letterSpacing:2, textTransform:"uppercase" }}>{date}</div>
    </div>
  );
}

function ScheduleItem({ block, state }) {
  const isCur  = state === "current";
  const isPast = state === "past";
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12,
      padding: isCur ? "11px 14px" : "8px 14px",
      borderRadius:7, marginBottom:2,
      background: isCur ? "#161616" : "transparent",
      borderLeft: isCur ? "2px solid #fff" : "2px solid transparent",
      opacity: isPast ? 0.28 : 1,
      transition:"opacity 0.2s",
    }}>
      <span style={{
        color: isCur ? "#aaa" : isPast ? "#333" : "#555",
        fontSize:12, minWidth:42,
        fontVariantNumeric:"tabular-nums", flexShrink:0,
      }}>{block.time}</span>
      <span style={{
        color: isCur ? "#fff" : isPast ? "#444" : "#ccc",
        fontSize: isCur ? 15 : 14,
        fontWeight: isCur ? 600 : 400,
        flex:1,
      }}>{block.title}</span>
      {isCur && (
        <span style={{
          color:"#000", background:"#fff",
          fontSize:9, fontWeight:700, letterSpacing:1.5,
          padding:"2px 6px", borderRadius:3, flexShrink:0,
        }}>NOW</span>
      )}
    </div>
  );
}

function ScheduleList({ blocks, curIdx }) {
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current && curIdx >= 0) {
      const items = listRef.current.querySelectorAll("[data-idx]");
      if (items[curIdx]) items[curIdx].scrollIntoView({ block:"center", behavior:"smooth" });
    }
  }, [curIdx, blocks.length]);

  return (
    <div ref={listRef} style={{ flex:1, overflowY:"auto", padding:"10px 4px 8px" }}>
      {blocks.length === 0 && (
        <div style={{ color:"#333", fontSize:13, padding:"32px 0", textAlign:"center" }}>
          Building your schedule…
        </div>
      )}
      {blocks.map((b, i) => (
        <div key={i} data-idx={i}>
          <ScheduleItem
            block={b}
            state={i === curIdx ? "current" : i < curIdx ? "past" : "future"}
          />
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      alignSelf: isUser ? "flex-end" : "flex-start",
      background: isUser ? "#1e1e1e" : "#161616",
      border: `1px solid ${isUser ? "#2a2a2a" : "#1e1e1e"}`,
      color: isUser ? "#e0e0e0" : "#aaa",
      fontSize:13, lineHeight:1.55,
      padding:"8px 12px", borderRadius:8,
      maxWidth:"82%",
    }}>{msg.text}</div>
  );
}

function ChatFeed({ messages, loading, feedRef }) {
  return (
    <div ref={feedRef} style={{
      height:160, overflowY:"auto",
      padding:"8px 18px", display:"flex",
      flexDirection:"column", gap:6,
      borderTop:"1px solid #141414",
    }}>
      {messages.length === 0 && (
        <div style={{ color:"#2a2a2a", fontSize:12, margin:"auto", textAlign:"center" }}>
          Chat with your coach below
        </div>
      )}
      {messages.map((m,i) => <MessageBubble key={i} msg={m}/>)}
      {loading && <MessageBubble msg={{ role:"ai", text:"…" }}/>}
    </div>
  );
}

function InputBar({ value, onChange, onSend, onRebuild, disabled, rebuilding }) {
  return (
    <div style={{
      display:"flex", gap:8, padding:"10px 18px 14px",
      borderTop:"1px solid #141414", background:"#0a0a0a",
    }}>
      <input
        style={{
          flex:1, background:"#111", border:"1px solid #222",
          borderRadius:7, color:"#fff", padding:"9px 13px",
          fontSize:14, outline:"none", fontFamily:"inherit",
        }}
        placeholder="Talk to your coach…"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === "Enter" && onSend()}
        disabled={disabled}
      />
      <button onClick={onSend} disabled={disabled} style={{
        background:"#fff", color:"#000", border:"none",
        borderRadius:7, width:38, fontSize:16,
        fontWeight:700, cursor:"pointer", opacity:disabled?0.4:1,
      }}>↑</button>
      <button onClick={onRebuild} disabled={rebuilding} style={{
        background:"transparent", border:"1px solid #222",
        color:"#555", borderRadius:7, padding:"0 12px",
        fontSize:11, cursor:"pointer", opacity:rebuilding?0.4:1,
        whiteSpace:"nowrap",
      }}>{rebuilding ? "…" : "Fix"}</button>
    </div>
  );
}

// ── Setup screens ──────────────────────────────────────

function SetupOnboard({ onDone }) {
  const [v, setV] = useState("");
  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0a", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui,sans-serif" }}>
      <div style={{ background:"#111", border:"1px solid #1e1e1e", borderRadius:10, padding:"28px 24px", width:"100%", maxWidth:380, display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{ color:"#fff", fontSize:18, fontWeight:700 }}>What's today?</div>
        <div style={{ color:"#555", fontSize:13, lineHeight:1.6 }}>Describe what you need to do and when you woke up.</div>
        <textarea value={v} onChange={e => setV(e.target.value)} rows={4}
          placeholder="e.g. Woke at 9. Deep work, gym at 5, sleep around midnight."
          style={{ background:"#0d0d0d", border:"1px solid #1e1e1e", borderRadius:6, color:"#ccc", padding:"10px 12px", fontSize:13, outline:"none", resize:"none", fontFamily:"inherit", lineHeight:1.6 }}/>
        <button onClick={() => v.trim() && onDone(v)}
          style={{ background:"#fff", color:"#000", border:"none", borderRadius:6, padding:"11px", fontSize:14, fontWeight:600, cursor:"pointer" }}>
          Build My Day →
        </button>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────

function MainScreen({ initCtx }) {
  const [schedule, setSchedule]   = useState([]);
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [tick, setTick]           = useState(0);
  const feedRef = useRef(null);

  useEffect(() => { const t = setInterval(() => setTick(x=>x+1), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [messages, loading]);
  useEffect(() => { buildSchedule(initCtx); }, []);

  const ci = getCurIdx(schedule);

  async function claudeCall(prompt) {
    const r = await fetch(CLAUDE_API, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model:"claude-sonnet-4-5", max_tokens:1000, messages:[{ role:"user", content:prompt }] })
    });
    const d = await r.json();
    return d.content?.map(c => c.text||"").join("") || "";
  }

  async function buildSchedule(ctx) {
    setRebuilding(true);
    try {
      const raw = await claudeCall(
        `Build a daily schedule. Context: ${ctx}. Current time: ${timeStr()}.
Return ONLY a raw JSON array, no markdown, no explanation.
[{"time":"HH:MM","title":"Short task"}]
Rules: 24h time, 8-12 blocks, start from now, titles max 4 words.`
      );
      setSchedule(JSON.parse(raw.replace(/```json|```/g,"").trim()));
      setMessages([{ role:"ai", text:"Schedule locked. Stay on it." }]);
    } catch {
      setMessages([{ role:"ai", text:"Failed to build. Check your API route." }]);
    }
    setRebuilding(false);
  }

  async function rebuild() {
    setRebuilding(true);
    try {
      const raw = await claudeCall(
        `Rebuild schedule from now. Existing: ${JSON.stringify(schedule)}. Time: ${timeStr()}.
Return ONLY raw JSON array, no markdown.
[{"time":"HH:MM","title":"Short task"}]
8-12 blocks, start from current time, titles max 4 words.`
      );
      setSchedule(JSON.parse(raw.replace(/```json|```/g,"").trim()));
      setMessages(m => [...m, { role:"ai", text:"Rebuilt. Back on track." }]);
    } catch {
      setMessages(m => [...m, { role:"ai", text:"Rebuild failed." }]);
    }
    setRebuilding(false);
  }

  async function send() {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    setMessages(m => [...m, { role:"user", text:msg }]);
    setLoading(true);
    const ctx = schedule.map((b,i) =>
      `[${i}] ${b.time} ${b.title}${i===ci?" ←NOW":""}`
    ).join(" | ");
    try {
      const r = await fetch(GROQ_API, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ system:COACH, message:`Schedule: ${ctx}\nUser: ${msg}` })
      });
      const d = await r.json();
      const raw = d.content || "Error.";
      if (raw.includes("REBUILD_NEEDED")) {
        setMessages(m => [...m, { role:"ai", text:"Rebuilding your day…" }]);
        setLoading(false);
        await rebuild();
        return;
      }
      const upd = raw.match(/SCHEDULE_UPDATE:(\{[^}]+\})/);
      if (upd) {
        try {
          const o = JSON.parse(upd[1]);
          setSchedule(s => s.map((b,i) => i===o.index ? { time:o.time||b.time, title:o.title||b.title } : b));
        } catch {}
      }
      const clean = raw.replace(/SCHEDULE_UPDATE:[^\n]*/g,"").trim();
      if (clean) setMessages(m => [...m, { role:"ai", text:clean }]);
    } catch {
      setMessages(m => [...m, { role:"ai", text:"Groq unreachable." }]);
    }
    setLoading(false);
  }

  return (
    <div style={{
      height:"100vh", background:"#0a0a0a", color:"#fff",
      fontFamily:"system-ui,sans-serif", display:"flex",
      flexDirection:"column", maxWidth:480, margin:"0 auto",
    }}>
      <Header date={dateStr()} />
      <ScheduleList blocks={schedule} curIdx={ci} />
      <ChatFeed messages={messages} loading={loading} feedRef={feedRef} />
      <InputBar
        value={input} onChange={setInput}
        onSend={send} onRebuild={rebuild}
        disabled={loading} rebuilding={rebuilding}
      />
    </div>
  );
}

// ── App root ───────────────────────────────────────────
export default function App() {
  const [ctx, setCtx] = useState(null);
  if (!ctx) return <SetupOnboard onDone={v => setCtx(v)} />;
  return <MainScreen initCtx={ctx} />;
}