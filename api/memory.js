import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://qlectmatqxtqqpwwbrhn.supabase.co',
  process.env.VITE_ANTHROPIC_API_KEY ? process.env.VITE_SUPABASE_ANON_KEY : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsZWN0bWF0cXh0cXFwd3dicmhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTUzNjgsImV4cCI6MjA5MDM5MTM2OH0.x98eVDFBeBkVCvQhoJg01sGy30BFB3B7Jcn8cJrU4Qg'
);

const USER_ID = 'default';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { key } = req.query;
      const { data, error } = await supabase
        .from('ai_memory')
        .select('value')
        .eq('user_id', USER_ID)
        .eq('key', key)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ value: data?.value || null });
    }

    if (req.method === 'POST') {
      const { key, value } = req.body;
      const { error } = await supabase
        .from('ai_memory')
        .upsert(
          { user_id: USER_ID, key, value, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,key' }
        );
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    console.error('memory handler error:', e);
    res.status(500).json({ error: e.message });
  }
}