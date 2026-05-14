import { supabase } from '../src/lib/supabase';

const USER_ID = 'default';

export default async function handler(req, res) {
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
      .upsert({ user_id: USER_ID, key, value, updated_at: new Date().toISOString() },
               { onConflict: 'user_id,key' });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }
  res.status(405).end();
}