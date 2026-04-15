export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { system, message } = req.body
    if (!message) return res.status(400).json({error:'No message'})
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.GROQ_API_KEY}`},
      body: JSON.stringify({
        model:'llama-3.3-70b-versatile',
        max_tokens:600,
        temperature:0.3,
        messages:[
          {role:'system', content:system},
          {role:'user', content:message}
        ]
      })
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({error:data.error?.message||'Groq error'})
    res.status(200).json({content: data.choices?.[0]?.message?.content || ''})
  } catch(e) {
    res.status(500).json({error:e.message})
  }
}