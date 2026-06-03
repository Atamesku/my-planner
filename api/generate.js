export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    console.log('KEY:', JSON.stringify(process.env.ANTHROPIC_API_KEY));
    const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': String(process.env.ANTHROPIC_API_KEY).trim(),
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
  model: 'claude-sonnet-4-20250514',
  max_tokens: req.body.maxTokens || 1024,
  system: req.body.system,
  messages: req.body.messages,
}),
});
    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic error:', JSON.stringify(data));
    }
    res.status(response.status).json(data);
  } catch(e) {
    console.error('Handler error:', e.message);
    res.status(500).json({error: e.message});
  }
}