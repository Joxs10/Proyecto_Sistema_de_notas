interface Env {
  GROQ_API_KEY: string;
  DEEPSEEK_API_KEY: string; // se usa mañana (Día 3)
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    if (url.pathname === '/transcribe') {
      const form = await req.formData();
      const groq = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
        body: form,
      });
      if (!groq.ok) {
        return new Response(JSON.stringify({ error: await groq.text() }), { status: 502, headers: CORS });
      }
      const data = (await groq.json()) as { text?: string };
      return new Response(JSON.stringify({ text: data.text ?? '' }), { headers: CORS });
    }

    return new Response(JSON.stringify({ ok: true, service: 'apuntesia-worker' }), { headers: CORS });
  },
} satisfies ExportedHandler<Env>;