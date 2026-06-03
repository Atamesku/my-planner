'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════
// USER PROFILE — Pre-filled from intake questionnaire
// To update: edit the fields below and redeploy.
// ═══════════════════════════════════════════════════════════════
const PROFILE = {
  situation: 'Working + studying — shift work with irregular hours',
  studyLoad: '3-4 subjects, moderate',
  sleep: '6-7 hours, inconsistent',
  badHabits: [
    'Staying up too late / sleeping in late',
    'YouTube & Netflix procrastination',
    'Phone & social media in bed',
    'Digital lust (compulsive pornography use)',
  ],
  studyHistory: 'Rarely studies — no established habit. Starting tasks is the primary barrier.',
  goals: [
    'Study/academic performance (primary)',
    'Fitness & health',
    'Breaking bad habits',
    'Sleep & energy management',
  ],
  struggles: [
    'Activation energy — cannot start tasks',
    'Motivation collapses after initial burst',
    'Doom-scrolling & phone compulsion',
    'Shift work fatigue and circadian disruption',
    'Unpredictable schedule making consistency hard',
  ],
};

// ═══════════════════════════════════════════════════════════════
// AXIOM SYSTEM PROMPT — All of AXIOM's expertise lives here
// ═══════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are AXIOM — the world's most elite schedule and performance coach. Military precision meets cutting-edge neuroscience and behavioral psychology. You are strict, direct, demanding, and completely unsparing with excuses. But everything you say is backed by science, and you are deeply invested in your client's success. Short sentences. Zero filler. No coddling.

CLIENT PROFILE:
${JSON.stringify(PROFILE, null, 2)}

═══════════════════════════════════════════════
NEUROSCIENCE KNOWLEDGE BASE
═══════════════════════════════════════════════

DOPAMINE DYSREGULATION:
Social media, pornography, and algorithm-driven video (YouTube, Netflix) are supernormal stimuli engineered to maximize dopamine response — exploiting the identical mesolimbic pathway as addictive drugs (Berridge & Robinson, 1998; Lembke, 2021). Chronic use raises the hedonic baseline: the brain recalibrates "normal" reward upward. The result is anhedonia toward ordinary tasks — studying feels neurologically unrewarding by comparison. Recovery requires structured abstinence (dopamine reset), not moderation. 2-4 weeks of abstinence allows receptor sensitivity to recover. This is not a character failure; it is neurochemistry. But it requires immediate, firm action.

ULTRADIAN RHYTHMS:
The brain operates in ~90-minute cycles of alertness and recovery (ultradian rhythm, Kleitman, 1982). Deep cognitive work should be scheduled in 90-minute blocks. The post-block trough is physiological — not laziness. Fighting it with caffeine or willpower leads to burnout. Work WITH biology.

SLEEP & MEMORY CONSOLIDATION:
During slow-wave sleep (SWS), the hippocampus replays learned material to the neocortex (memory consolidation, Stickgold & Walker, 2005). Sleeping under 7 hours reduces declarative memory encoding by up to 40% the following day (Walker, 2017). For a student: sleep IS studying. Non-negotiable.

CORTISOL AWAKENING RESPONSE & SHIFT WORK:
Shift work destroys the cortisol awakening response (CAR) — the cortisol spike in the first 30 minutes of waking that drives motivation, alertness, and cognitive readiness. The single most powerful fix: anchor wake time. Same wake-up time every day regardless of shift. This re-entrains the circadian clock faster than any other intervention (Czeisler et al., 1989).

PREFRONTAL CORTEX DEPLETION:
The PFC — governing impulse control, deep work, planning, and willpower — is most active in the early waking hours and depletes with every decision and effort throughout the day (Baumeister, 2007). Cognitive heavy lifting must come FIRST in the day. Placing it last guarantees failure.

ZEIGARNIK EFFECT & ACTIVATION ENERGY:
The hardest part is starting (activation energy). Once initiated, the brain creates unresolved psychological tension (Zeigarnik, 1927) that drives task completion. Exploit this: lower the activation threshold. Pre-stage the study environment (books open, app blocked, phone away) BEFORE it's time to study. Commit to only 2 minutes. The Zeigarnik effect takes over.

═══════════════════════════════════════════════
STUDY SCIENCE
═══════════════════════════════════════════════

ACTIVE RECALL: Self-testing is 2-3x more effective than re-reading (Roediger & Karpicke, 2006). Flashcards, practice problems, writing from memory — always over highlighting and re-reading.

SPACED REPETITION: Review at expanding intervals (1 → 3 → 7 → 14 days). Exploits the spacing effect: slight forgetting before reviewing strengthens long-term memory encoding.

POMODORO TECHNIQUE: 25 min focused work / 5 min break. Four cycles → 20-30 min break. Ideal for building the initial study habit — removes open-ended dread with time-bounded commitment.

INTERLEAVING: Mixing subjects within a session (Math → Bio → History) is harder but produces 40% better long-term retention than blocking (Kornell & Bjork, 2008). Use on off-days when time allows.

PRE-STUDY RITUAL: A fixed 5-minute ritual (same music, same physical setup, same location) creates a Pavlovian conditioned response for focus through associative conditioning. Must be identical every session.

DEDICATED STUDY ENVIRONMENT: Study space used ONLY for studying. No entertainment, no eating, no social media in that space. Context-dependent memory encoding makes the location itself a focus trigger.

═══════════════════════════════════════════════
BEHAVIORAL PSYCHOLOGY
═══════════════════════════════════════════════

IMPLEMENTATION INTENTIONS (Gollwitzer, 1999): "When X happens, I will do Y" doubles habit follow-through vs. vague goals. Every habit must have a specific trigger.

TEMPTATION BUNDLING (Milkman, 2021): Pair an undesirable task (studying) with a desired experience (specific playlist, special coffee) to increase approach motivation.

IDENTITY-BASED HABITS (Clear, 2018): "I am a person who studies daily" is more powerful than "I want to study more." Behavior follows identity. Every log entry, every completed habit = a vote for that identity.

ENVIRONMENTAL DESIGN: Removing choice is more powerful than willpower. Phone in another room > phone face-down. Website blocker active > relying on self-control. Design the environment, don't fight it.

BEHAVIORAL ACTIVATION (Lewinsohn, 1974): Motivation follows action — not the reverse. Do not wait to feel ready. Schedule, execute, motivation emerges afterward. Always.

LOSS AVERSION (Kahneman & Tversky, 1979): Humans feel losses ~2x more acutely than equivalent gains. Streaks, commitment devices, and public accountability leverage this asymmetry.

═══════════════════════════════════════════════
COACHING STYLE
═══════════════════════════════════════════════

Be direct. Be strict. Be precise. Short sentences. Science-first explanations.
Every disruption is data — analyze it forensically. Every schedule is an experiment — iterate it ruthlessly.
Call excuses what they are, then immediately give the solution.
Never shame — digital addiction is neurochemistry, not character. But require action, not acceptance.
Think 8 weeks ahead: Week 1 = foundation, Weeks 2-4 = consolidation, Weeks 5-8 = optimization.
The schedule is never "wrong" — it is a hypothesis that gets refined.`;

// ═══════════════════════════════════════════════════════════════
// SCHEDULE JSON SCHEMA
// ═══════════════════════════════════════════════════════════════
const SCHEDULE_SCHEMA = `Return ONLY a valid JSON object matching this exact structure (no markdown, no extra keys, no preamble):
{
  "weekNumber": NUMBER,
  "theme": "3-5 word theme",
  "coachIntro": "2-3 strict sentences",
  "weekFocus": "one sentence — the single #1 priority",
  "weeklyTarget": "one specific measurable target",
  "weekRules": ["rule 1", "rule 2", "rule 3", "rule 4"],
  "dailyHabits": [
    { "id": "h1", "name": "short habit name", "emoji": "single emoji", "category": "sleep|study|health|focus|digital" }
  ],
  "shiftDaySchedule": [
    { "block": "Wake+0", "label": "activity name", "duration": "—", "type": "anchor", "note": "brief science-backed note" }
  ],
  "offDaySchedule": [
    { "block": "Wake+0", "label": "activity name", "duration": "Xmin", "type": "anchor|study|health|meal|recovery|digital-free|sleep", "note": "brief note" }
  ],
  "studyStrategy": "2-3 sentence study approach for this week",
  "habitReplacement": "2-3 sentence digital habit replacement plan"
}`;

// ═══════════════════════════════════════════════════════════════
// API HELPER — Calls /api/axiom (server-side, key never exposed)
// ═══════════════════════════════════════════════════════════════
async function callAxiom(messages, jsonMode = false, maxTokens = 1024) {
  const system = jsonMode
    ? SYSTEM_PROMPT + '\n\nCRITICAL INSTRUCTION: Respond ONLY with a valid JSON object. No markdown fences. No preamble. No trailing text. Pure raw JSON starting with { and ending with }.'
    : SYSTEM_PROMPT;

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system, maxTokens }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);

  const text = (data.content || []).map((b) => b.text || '').join('\n');

  if (jsonMode) {
    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }
  return text;
}

// ═══════════════════════════════════════════════════════════════
// STORAGE — localStorage wrappers with safe error handling
// ═══════════════════════════════════════════════════════════════
const db = {
  get: (k) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set: (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { console.warn('Storage write failed:', e); }
  },
};

// ═══════════════════════════════════════════════════════════════
// COLOR TOKENS
// ═══════════════════════════════════════════════════════════════
const C = {
  bg:     '#05050f',
  card:   '#09091e',
  border: '#141430',
  a:      '#5b5ef4',   // accent indigo
  p:      '#8b5cf6',   // purple
  g:      '#22c55e',   // green
  y:      '#f59e0b',   // amber
  r:      '#ef4444',   // red
  tl:     '#2dd4bf',   // teal
  txt:    '#eef0ff',
  dim:    '#8890b8',
  mut:    '#252840',
  blockClr: {
    anchor:         '#5b5ef4',
    study:          '#22c55e',
    health:         '#f59e0b',
    meal:           '#ec4899',
    recovery:       '#8b5cf6',
    'digital-free': '#2dd4bf',
    work:           '#64748b',
    sleep:          '#7c3aed',
  },
  cat: {
    sleep:   '#8b5cf6',
    study:   '#22c55e',
    health:  '#f59e0b',
    focus:   '#5b5ef4',
    digital: '#ef4444',
  },
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function AxiomApp() {
  // ── Core state
  const [tab, setTab]   = useState('schedule');
  const [stab, setStab] = useState('rules');     // schedule sub-tab
  const [sched, setSched] = useState(null);
  const [wk, setWk]     = useState(1);

  // ── Tracking state
  const [habits, setHabits] = useState({});      // { dayIndex: [habitId, ...] }
  const [logs, setLogs]     = useState([]);       // daily log array

  // ── UI state
  const [chat, setChat]     = useState([]);
  const [chatIn, setChatIn] = useState('');
  const [cLoad, setCLoad]   = useState(false);
  const [gen, setGen]       = useState(false);
  const [gMsg, setGMsg]     = useState('');
  const [genErr, setGenErr] = useState(null);
  const [rev, setRev]       = useState({ rating: 3, wins: '', struggles: '', notes: '' });
  const [dlog, setDlog]     = useState({ energy: 3, disrupts: '', notes: '' });
  const [dHabs, setDHabs]   = useState([]);
  const [logSaved, setLogSaved] = useState(false);

  const cRef = useRef(null);

  // ── Init on mount — load persisted data or generate Week 1
  useEffect(() => {
    const sc = db.get('ax_sched');
    const wn = db.get('ax_wk');
    const hb = db.get('ax_habits');
    const lg = db.get('ax_logs');
    const ch = db.get('ax_chat');

    if (sc) setSched(sc);
    if (wn) setWk(wn);
    if (hb) setHabits(hb);
    if (lg) setLogs(lg);
    if (ch) setChat(ch);
    if (!sc) buildWeek(1, null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    cRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, cLoad]);

  // ═══════════════════════════════════════════════════════════
  // BUILD / REBUILD SCHEDULE
  // ═══════════════════════════════════════════════════════════
  const buildWeek = useCallback(async (n, reviewData) => {
    setGen(true);
    setGenErr(null);

    const steps = n === 1
      ? [
          'Profiling your lifestyle...',
          'Mapping neurological constraints...',
          'Calibrating evidence-based protocols...',
          'Generating Week 1 schedule...',
        ]
      : [
          `Processing Week ${n - 1} performance data...`,
          'Analyzing habit compliance patterns...',
          'Recalibrating schedule architecture...',
          `Building Week ${n}...`,
        ];

    for (const step of steps) {
      setGMsg(step);
      await new Promise((r) => setTimeout(r, 750));
    }

    const isFirst = n === 1;

    const prompt = isFirst
      ? `Generate the Week 1 foundation schedule.\n${SCHEDULE_SCHEMA}\n\nCONSTRAINTS:\n- Include exactly 5-6 daily habits.\n- Shift day: 6-8 blocks (work takes most of the day; be realistic).\n- Off day: 10-13 blocks (full structure, more study time).\n- Week 1 is FOUNDATION ONLY — minimum viable protocol. The study target is ONE Pomodoro (25 min) per day. Win small first. Build momentum before adding volume.\n- Keep block notes under 12 words each.`
      : `Week ${n - 1} review data:\n- Overall rating: ${reviewData.rating}/5\n- What worked: "${reviewData.wins}"\n- What failed: "${reviewData.struggles}"\n- Additional context: "${reviewData.notes}"\n\nGenerate Week ${n} adjusted schedule.\n${SCHEDULE_SCHEMA.replace('NUMBER', n)}\n\nADJUSTMENT LOGIC:\n- Rating 1-2: Simplify significantly. Remove 1-2 habits. Reduce off-day blocks. The system was too demanding.\n- Rating 3: Minor tweaks. Adjust 1-2 habits. Small difficulty increase in one area.\n- Rating 4-5: Add measured challenge. Increase study target by 1 Pomodoro. Add one new habit.\n- In coachIntro: directly reference what happened in Week ${n - 1} and why these specific adjustments are being made. Be analytical and specific.`;

    try {
      const sc = await callAxiom([{ role: 'user', content: prompt }], true, 2500);
      setSched(sc);
      setWk(n);
      db.set('ax_sched', sc);
      db.set('ax_wk', n);

      if (!isFirst) {
        setHabits({});
        setLogs([]);
        setRev({ rating: 3, wins: '', struggles: '', notes: '' });
        db.set('ax_habits', {});
        db.set('ax_logs', []);
      }

      setTab('schedule');
      setStab('rules');
    } catch (err) {
      console.error('Build error:', err);
      setGenErr(`Failed: ${err.message}. Check your ANTHROPIC_API_KEY and try again.`);
    }

    setGen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ═══════════════════════════════════════════════════════════
  // COACH CHAT
  // ═══════════════════════════════════════════════════════════
  const sendChat = useCallback(async () => {
    if (!chatIn.trim() || cLoad) return;
    const m = chatIn.trim();
    const updated = [...chat, { role: 'user', content: m }];
    setChat(updated);
    setChatIn('');
    setCLoad(true);

    try {
      // Inject context into user's message for the API call
      const ctx = `[Context: Week ${wk}, Theme: "${sched?.theme}"]\n${m}`;
      const apiHistory = [...updated.slice(0, -1), { role: 'user', content: ctx }].slice(-14);
      const reply = await callAxiom(apiHistory.map((x) => ({ role: x.role, content: x.content })));
      const final = [...updated, { role: 'assistant', content: reply }];
      setChat(final);
      db.set('ax_chat', final.slice(-20));
    } catch (e) {
      console.error('Chat error:', e);
    }

    setCLoad(false);
  }, [chatIn, chat, cLoad, wk, sched]);

  // ═══════════════════════════════════════════════════════════
  // DAILY LOG
  // ═══════════════════════════════════════════════════════════
  const saveLog = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const entry = { date: today, energy: dlog.energy, disrupts: dlog.disrupts, notes: dlog.notes, habits: dHabs };
    const upd = [...logs.filter((l) => l.date !== today), entry];
    setLogs(upd);
    setDHabs([]);
    db.set('ax_logs', upd);
    setLogSaved(true);
    setTimeout(() => setLogSaved(false), 2500);
  }, [dlog, dHabs, logs]);

  // ═══════════════════════════════════════════════════════════
  // HABIT TOGGLE
  // ═══════════════════════════════════════════════════════════
  const toggleHabit = useCallback((dayIdx, hid) => {
    const cur = habits[dayIdx] || [];
    const upd = {
      ...habits,
      [dayIdx]: cur.includes(hid) ? cur.filter((h) => h !== hid) : [...cur, hid],
    };
    setHabits(upd);
    db.set('ax_habits', upd);
  }, [habits]);

  // ═══════════════════════════════════════════════════════════
  // GENERATING SCREEN
  // ═══════════════════════════════════════════════════════════
  if (gen) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 68, color: C.a, animation: 'axiomPulse 1.8s ease-in-out infinite', marginBottom: 22, lineHeight: 1, display: 'block' }}>
            ⬡
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 10, color: C.txt, marginBottom: 6, fontFamily: 'var(--font-display)' }}>
            AXIOM
          </div>
          <div style={{ fontSize: 10, letterSpacing: 6, color: C.dim, marginBottom: 56, fontFamily: 'var(--font-mono)' }}>
            SCHEDULE INTELLIGENCE SYSTEM
          </div>
          <div style={{ fontSize: 13, color: C.txt, letterSpacing: 2, marginBottom: 26, minHeight: 20, fontFamily: 'var(--font-mono)', animation: 'fadeUp .3s ease' }}>
            {gMsg}
          </div>
          <div style={{ width: 280, height: 2, background: C.border, borderRadius: 2, margin: '0 auto' }}>
            <div style={{ height: '100%', width: '68%', background: `linear-gradient(90deg, ${C.a}, ${C.p})`, borderRadius: 2, transition: 'width .7s ease' }} />
          </div>
          {genErr && (
            <div style={{ marginTop: 32, color: C.r, fontSize: 13, lineHeight: 1.6, maxWidth: 320 }}>
              {genErr}
              <button
                onClick={() => buildWeek(wk, null)}
                style={{ display: 'block', margin: '16px auto 0', padding: '9px 22px', background: C.a, border: 'none', borderRadius: 7, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: 1, fontFamily: 'var(--font-mono)' }}
              >
                RETRY
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // LOADING (mounted but no schedule yet)
  // ═══════════════════════════════════════════════════════════
  if (!sched) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.a, fontSize: 13, letterSpacing: 4, fontFamily: 'var(--font-mono)' }}>
        INITIALIZING...
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════
  const bc = (t) => C.blockClr[t] || C.a;
  const cc = (c) => C.cat[c] || C.a;
  const todayDI = (new Date().getDay() + 6) % 7; // Mon=0
  const todayStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', month: 'short', day: 'numeric' });

  // Style helpers (defined fresh each render — acceptable for this app)
  const cardS   = (x = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 12, ...x });
  const lblS    = (color = C.dim) => ({ fontSize: 10, fontWeight: 700, letterSpacing: 3, color, marginBottom: 9, fontFamily: 'var(--font-mono)' });
  const textareaS = (x = {}) => ({ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: 11, color: C.txt, fontSize: 13, lineHeight: 1.6, resize: 'none', outline: 'none', minHeight: 80, fontFamily: 'var(--font-body)', ...x });

  const TABS = [
    { id: 'schedule', icon: '▦', label: 'SCHED' },
    { id: 'daily',    icon: '◈', label: 'DAILY' },
    { id: 'habits',   icon: '◉', label: 'HABITS' },
    { id: 'review',   icon: '◎', label: 'REVIEW' },
    { id: 'chat',     icon: '⬡', label: 'COACH' },
  ];

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div style={{ background: C.bg, minHeight: '100vh', maxWidth: 520, margin: '0 auto', color: C.txt, fontFamily: 'var(--font-body)' }}>

      {/* ── HEADER ────────────────────────────────────────── */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: C.a, fontSize: 20, lineHeight: 1 }}>⬡</span>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: 5, fontFamily: 'var(--font-display)' }}>AXIOM</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: C.dim, fontFamily: 'var(--font-mono)' }}>{todayStr}</span>
          <span style={{ background: `${C.a}22`, border: `1px solid ${C.a}40`, borderRadius: 4, padding: '3px 9px', fontSize: 10, fontWeight: 800, letterSpacing: 2, color: C.a, fontFamily: 'var(--font-mono)' }}>
            WK{wk}
          </span>
        </div>
      </div>

      {/* ── CONTENT ───────────────────────────────────────── */}
      <div style={{ paddingBottom: 68 }}>

        {/* ════════════════ SCHEDULE TAB ════════════════ */}
        {tab === 'schedule' && (
          <div style={{ padding: 18 }}>
            {/* Banner */}
            <div style={{ background: `linear-gradient(135deg, ${C.a}1c, ${C.p}12)`, border: `1px solid ${C.a}28`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
              <div style={{ ...lblS(C.a), marginBottom: 5 }}>WEEK {wk} PROTOCOL</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.txt, marginBottom: 5, fontFamily: 'var(--font-display)', letterSpacing: 1, lineHeight: 1.2 }}>
                {sched.theme}
              </div>
              <div style={{ fontSize: 13, color: C.dim, fontStyle: 'italic', lineHeight: 1.5 }}>{sched.weekFocus}</div>
            </div>

            {/* Briefing */}
            <div style={{ ...cardS({ borderLeft: `3px solid ${C.a}`, marginBottom: 14 }) }}>
              <div style={lblS(C.a)}>AXIOM BRIEFING</div>
              <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.8, margin: '0 0 12px' }}>{sched.coachIntro}</p>
              <div style={{ padding: '7px 11px', background: `${C.g}14`, border: `1px solid ${C.g}28`, borderRadius: 7 }}>
                <span style={{ fontSize: 10, color: C.g, fontWeight: 700, letterSpacing: 2, fontFamily: 'var(--font-mono)' }}>TARGET: </span>
                <span style={{ fontSize: 12, color: C.txt }}>{sched.weeklyTarget}</span>
              </div>
            </div>

            {/* Sub-tab pills */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 16, padding: 4, background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>
              {[['rules', 'RULES'], ['shift', 'SHIFT'], ['off', 'OFF DAY'], ['study', 'STUDY']].map(([id, lbl]) => (
                <button key={id} onClick={() => setStab(id)} style={{ flex: 1, padding: '7px 3px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: 1, background: stab === id ? C.a : 'transparent', color: stab === id ? '#fff' : C.mut, transition: 'all .15s', fontFamily: 'var(--font-mono)' }}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Rules sub-tab */}
            {stab === 'rules' && (sched.weekRules || []).map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'flex-start', ...cardS({ padding: '12px 14px', marginBottom: 9 }) }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.a, fontFamily: 'var(--font-mono)', minWidth: 22, flexShrink: 0, lineHeight: 1.6 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.6 }}>{r}</span>
              </div>
            ))}

            {/* Shift / Off-day schedule sub-tabs */}
            {(stab === 'shift' || stab === 'off') && (() => {
              const blocks = stab === 'shift' ? sched.shiftDaySchedule : sched.offDaySchedule;
              return (
                <div>
                  <div style={{ fontSize: 10, color: C.mut, textAlign: 'center', letterSpacing: 2, marginBottom: 14, fontFamily: 'var(--font-mono)' }}>
                    {stab === 'shift' ? '⚙ WORKING SHIFT — Minimum viable protocol' : '📚 DAY OFF — Full structure. No exceptions.'}
                  </div>
                  {(blocks || []).map((b, i) => (
                    <div key={i} style={{ display: 'flex', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 9, overflow: 'hidden' }}>
                      <div style={{ width: 4, background: bc(b.type), flexShrink: 0 }} />
                      <div style={{ padding: '11px 13px', flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: bc(b.type), fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{b.block}</span>
                          <span style={{ fontSize: 11, color: C.mut, fontFamily: 'var(--font-mono)' }}>{b.duration}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{b.label}</div>
                        {b.note && <div style={{ fontSize: 11, color: C.dim, marginTop: 4, fontStyle: 'italic', lineHeight: 1.4 }}>{b.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Study plan sub-tab */}
            {stab === 'study' && (
              <div>
                {[
                  { c: C.g, t: 'STUDY PROTOCOL', txt: sched.studyStrategy },
                  { c: C.r, t: 'DIGITAL HABIT OVERRIDE', txt: sched.habitReplacement },
                ].map(({ c, t, txt }) => (
                  <div key={t} style={{ ...cardS({ borderLeft: `3px solid ${c}` }) }}>
                    <div style={lblS(c)}>{t}</div>
                    <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.8, margin: 0 }}>{txt}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════ DAILY LOG TAB ════════════════ */}
        {tab === 'daily' && (
          <div style={{ padding: 18 }}>
            <div style={{ ...lblS(C.a), marginBottom: 4 }}>DAILY LOG</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, fontFamily: 'var(--font-display)', letterSpacing: 0.5 }}>{todayStr}</div>

            {/* Energy level */}
            <div style={cardS()}>
              <div style={lblS()}>ENERGY LEVEL</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setDlog({ ...dlog, energy: n })} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: `2px solid ${dlog.energy === n ? C.y : C.border}`, background: dlog.energy === n ? `${C.y}20` : 'transparent', cursor: 'pointer', fontSize: 15, fontWeight: 800, color: dlog.energy === n ? C.y : C.mut, transition: 'all .15s' }}>
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.mut, textAlign: 'center', marginTop: 7, fontFamily: 'var(--font-mono)', letterSpacing: 2 }}>
                {['', 'DEPLETED', 'LOW', 'MODERATE', 'GOOD', 'PEAK'][dlog.energy]}
              </div>
            </div>

            {/* Habits done today */}
            <div style={cardS()}>
              <div style={lblS()}>HABITS DONE TODAY</div>
              {(sched.dailyHabits || []).map((h) => {
                const done = dHabs.includes(h.id);
                return (
                  <div key={h.id} onClick={() => setDHabs((p) => done ? p.filter((x) => x !== h.id) : [...p, h.id])} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                    <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${done ? cc(h.category) : C.border}`, background: done ? cc(h.category) : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                      {done && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13, color: done ? C.txt : C.dim, transition: 'color .15s' }}>{h.emoji} {h.name}</span>
                  </div>
                );
              })}
            </div>

            {/* Disruptions */}
            <div style={cardS()}>
              <div style={lblS()}>DISRUPTIONS / OFF-PLAN MOMENTS</div>
              <textarea
                value={dlog.disrupts}
                onChange={(e) => setDlog({ ...dlog, disrupts: e.target.value })}
                placeholder="Be specific. Every disruption is data for AXIOM to analyze."
                style={textareaS()}
              />
            </div>

            {/* Notes */}
            <div style={cardS()}>
              <div style={lblS()}>NOTES</div>
              <textarea
                value={dlog.notes}
                onChange={(e) => setDlog({ ...dlog, notes: e.target.value })}
                placeholder="Context, observations, mental state, shift schedule..."
                style={textareaS({ minHeight: 60 })}
              />
            </div>

            <button onClick={saveLog} style={{ width: '100%', padding: 15, background: logSaved ? C.g : C.a, border: 'none', borderRadius: 11, color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: 2, cursor: 'pointer', transition: 'background .3s', fontFamily: 'var(--font-mono)' }}>
              {logSaved ? '✓  LOGGED — AXIOM IS WATCHING' : 'SUBMIT DAILY LOG'}
            </button>
          </div>
        )}

        {/* ════════════════ HABITS TAB ════════════════ */}
        {tab === 'habits' && (() => {
          const total    = Object.values(habits).reduce((a, hs) => a + hs.length, 0);
          const possible = (sched.dailyHabits || []).length * 7;
          const pct      = possible > 0 ? Math.round((total / possible) * 100) : 0;
          const pClr     = pct >= 70 ? C.g : pct >= 40 ? C.y : C.r;
          return (
            <div style={{ padding: 18 }}>
              <div style={{ ...lblS(C.a), marginBottom: 4 }}>HABIT TRACKER</div>
              <div style={{ fontSize: 13, color: C.dim, marginBottom: 20 }}>Week {wk} — tap any cell to mark complete</div>

              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 360 }}>
                  {/* Day headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(7, 1fr)', gap: 4, marginBottom: 10 }}>
                    <div />
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                      <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: i === todayDI ? C.a : C.mut, fontFamily: 'var(--font-mono)', padding: '4px 0' }}>{d}</div>
                    ))}
                  </div>
                  {/* Habit rows */}
                  {(sched.dailyHabits || []).map((h) => (
                    <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '140px repeat(7, 1fr)', gap: 4, marginBottom: 7, alignItems: 'center' }}>
                      <div style={{ fontSize: 11, color: C.txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                        {h.emoji} {h.name}
                      </div>
                      {[0, 1, 2, 3, 4, 5, 6].map((di) => {
                        const done = (habits[di] || []).includes(h.id);
                        const clr  = cc(h.category);
                        return (
                          <button key={di} onClick={() => toggleHabit(di, h.id)} style={{ height: 34, borderRadius: 6, border: `1px solid ${done ? clr : C.border}`, background: done ? `${clr}28` : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all .15s' }}>
                            {done && <span style={{ color: clr, fontSize: 11, fontWeight: 800 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Completion summary */}
              <div style={{ ...cardS({ marginTop: 20 }) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
                  <div style={lblS()}>WEEK COMPLETION</div>
                  <div style={{ fontSize: 40, fontWeight: 700, color: pClr, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{pct}%</div>
                </div>
                <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden', marginBottom: 9 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pClr, borderRadius: 3, transition: 'width .5s ease' }} />
                </div>
                <div style={{ fontSize: 12, color: C.dim }}>{total} / {possible} habit completions this week</div>
                {pct < 40 && (
                  <div style={{ fontSize: 12, color: C.r, marginTop: 10, lineHeight: 1.6, fontStyle: 'italic' }}>
                    Below 40%. The system needs recalibration — not you. Run the weekly review and be honest about what failed.
                  </div>
                )}
                {pct >= 70 && (
                  <div style={{ fontSize: 12, color: C.g, marginTop: 10, lineHeight: 1.6, fontStyle: 'italic' }}>
                    Strong execution. The habit architecture is working. Hold the line through the end of the week.
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ════════════════ REVIEW TAB ════════════════ */}
        {tab === 'review' && (
          <div style={{ padding: 18 }}>
            <div style={{ ...lblS(C.a), marginBottom: 4 }}>WEEKLY DEBRIEF</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 7, fontFamily: 'var(--font-display)', letterSpacing: 0.5 }}>Week {wk} Review</div>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.75, marginBottom: 22 }}>
              Brutal honesty required. Vague answers produce generic schedules. Your Week {wk + 1} is built entirely from this data.
            </p>

            {/* Rating */}
            <div style={cardS()}>
              <div style={lblS()}>OVERALL RATING</div>
              <div style={{ display: 'flex', gap: 7 }}>
                {[[1, 'DISASTER'], [2, 'ROUGH'], [3, 'OKAY'], [4, 'SOLID'], [5, 'CRUSHED']].map(([n, lbl]) => (
                  <button key={n} onClick={() => setRev({ ...rev, rating: n })} style={{ flex: 1, padding: '11px 4px', borderRadius: 9, border: `2px solid ${rev.rating === n ? C.a : C.border}`, background: rev.rating === n ? `${C.a}20` : 'transparent', cursor: 'pointer', transition: 'all .15s' }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: rev.rating === n ? C.a : C.mut }}>{n}</div>
                    <div style={{ fontSize: 8, color: rev.rating === n ? C.a : C.mut, marginTop: 3, fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>{lbl}</div>
                  </button>
                ))}
              </div>
            </div>

            {[
              { k: 'wins',      lbl: 'WHAT WORKED?',                   ph: 'Habits held, study sessions done, unexpected wins...' },
              { k: 'struggles', lbl: 'WHAT FELL APART?',               ph: 'Specific failures, what derailed you, skipped habits...' },
              { k: 'notes',     lbl: 'WHAT SHOULD AXIOM FACTOR IN?',   ph: 'Shift changes, life events, sleep quality, mental state...' },
            ].map(({ k, lbl, ph }) => (
              <div key={k} style={cardS()}>
                <div style={lblS()}>{lbl}</div>
                <textarea value={rev[k]} onChange={(e) => setRev({ ...rev, [k]: e.target.value })} placeholder={ph} style={textareaS()} />
              </div>
            ))}

            <button onClick={() => buildWeek(wk + 1, rev)} style={{ width: '100%', padding: 16, background: `linear-gradient(135deg, ${C.a}, ${C.p})`, border: 'none', borderRadius: 11, color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: 2, cursor: 'pointer', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
              GENERATE WEEK {wk + 1} →
            </button>

            {/* Reset option */}
            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <button onClick={() => { if (window.confirm('Reset all AXIOM data and start from Week 1?')) { localStorage.clear(); window.location.reload(); } }} style={{ background: 'none', border: 'none', color: C.mut, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
                ↺ RESET ALL DATA
              </button>
            </div>
          </div>
        )}

        {/* ════════════════ COACH CHAT TAB ════════════════ */}
        {tab === 'chat' && (
          <div>
            <div style={{ padding: '18px 18px 90px', minHeight: 'calc(100vh - 130px)' }}>
              {/* Empty state */}
              {chat.length === 0 && (
                <div style={{ textAlign: 'center', padding: '50px 24px', animation: 'fadeUp .4s ease' }}>
                  <div style={{ fontSize: 52, color: C.a, marginBottom: 16 }}>⬡</div>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 5, color: C.a, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>AXIOM ONLINE</div>
                  <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.8, marginBottom: 30 }}>
                    Direct line to your coach. Ask about disruptions, the neuroscience behind your protocol, habit failures, or anything blocking you.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {[
                      "Why can't I make myself start studying?",
                      'I missed 3 days in a row. What now?',
                      'How do I break the phone-in-bed habit?',
                      'Explain the neuroscience behind my schedule.',
                    ].map((q) => (
                      <button key={q} onClick={() => setChatIn(q)} style={{ padding: '10px 15px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, color: C.dim, fontSize: 12, cursor: 'pointer', textAlign: 'left', lineHeight: 1.5, transition: 'border-color .15s' }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat messages */}
              {chat.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12, gap: 9, alignItems: 'flex-end' }}>
                  {m.role === 'assistant' && (
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: C.a, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>⬡</div>
                  )}
                  <div style={{ maxWidth: '80%', padding: '11px 14px', borderRadius: m.role === 'user' ? '13px 13px 4px 13px' : '13px 13px 13px 4px', background: m.role === 'user' ? C.a : C.card, border: m.role === 'user' ? 'none' : `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {cLoad && (
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end', marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: C.a, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>⬡</div>
                  <div style={{ padding: '12px 16px', borderRadius: '13px 13px 13px 4px', background: C.card, border: `1px solid ${C.border}`, display: 'flex', gap: 5, alignItems: 'center' }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.a, animation: `dotPulse 1.2s ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={cRef} />
            </div>

            {/* Chat input */}
            <div style={{ position: 'fixed', bottom: 58, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, background: C.card, borderTop: `1px solid ${C.border}`, padding: '11px 16px', display: 'flex', gap: 9, zIndex: 15 }}>
              <input
                value={chatIn}
                onChange={(e) => setChatIn(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder="Ask AXIOM anything..."
                style={{ flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 13px', color: C.txt, fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)' }}
              />
              <button onClick={sendChat} disabled={!chatIn.trim() || cLoad} style={{ padding: '10px 16px', background: chatIn.trim() ? C.a : C.mut, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', transition: 'background .15s' }}>→</button>
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV ─────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 520, background: C.card, borderTop: `1px solid ${C.border}`, display: 'flex', zIndex: 20 }}>
        {TABS.map(({ id, icon, label }) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: '10px 0 8px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 16, color: tab === id ? C.a : C.mut, transition: 'color .15s' }}>{icon}</span>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: tab === id ? C.a : C.mut, fontFamily: 'var(--font-mono)', transition: 'color .15s' }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}