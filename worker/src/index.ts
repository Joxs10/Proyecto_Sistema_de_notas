interface Env {
  GROQ_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  CHAT_MODEL?: string;
}

type SummarizeBody = {
  transcript?: string;
  previous?: string;
  topic?: string;
  glossary?: string;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
};

const SYSTEM_PROMPT = `Eres ApuntesIA, un tomador de apuntes universitario experto. Recibes la transcripción cruda de una clase.

REGLA DE ORO: usa ÚNICAMENTE información presente en la transcripción. NO inventes ejemplos, números, procedimientos ni definiciones que el profesor no mencionó. Si un dato no está, omítelo: un hueco honesto vale más que una mentira pulida.

Preserva el ORDEN CRONOLÓGICO de la clase: los apuntes siguen la secuencia en que el profesor explicó.

Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura:
{
  "tema": string,
  "resumen": string,
  "pasos": string[],
  "ejemplos": string[],
  "puntos_clave": string[],
  "conceptos": [{ "termino": string, "definicion": string }],
  "preguntas_examen": [{ "pregunta": string, "respuesta": string }]
}

Donde:
- "pasos": el procedimiento PASO A PASO exactamente como lo enseñó el profesor, en su orden.
- "ejemplos": los ejemplos LITERALES de la clase con sus resultados (ej. "35 + 12 = 47").

Reglas adicionales:
- Corrige errores obvios de transcripción con el tema y el glosario (ej. "humas" → "sumas").
- IGNORA contenido no académico (suscripciones, créditos, publicidad).
- NO modifiques ni reordenes contenido acumulado previamente: solo AGREGA lo nuevo.
- Máximo 7 pasos, 6 ejemplos, 7 puntos_clave, 6 conceptos y 4 preguntas_examen por pasada.
- Las preguntas de examen derivan únicamente de lo explicado en clase.
- Responde en español.`;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    // Inventario de cerebros disponibles en tu cuenta Groq
    if (url.pathname === '/models') {
      const r = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      });
      const data = (await r.json()) as { data?: Array<{ id: string }> };
      return new Response(JSON.stringify((data.data ?? []).map((m) => m.id), null, 2), { headers: CORS });
    }

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

    if (url.pathname === '/summarize') {
      let body: SummarizeBody;
      try {
        body = (await req.json()) as SummarizeBody;
      } catch {
        return new Response(JSON.stringify({ error: 'JSON inválido en el body' }), { status: 400, headers: CORS });
      }
      if (!body.transcript?.trim()) {
        return new Response(JSON.stringify({ error: 'transcript vacío' }), { status: 400, headers: CORS });
      }

      // Prefijo estable (cache-friendly); lo nuevo siempre al final
      let user = '';
      if (body.topic) user += `TEMA DE LA PESTAÑA: ${body.topic}\n`;
      if (body.glossary) user += `GLOSARIO DE LA MATERIA: ${body.glossary}\n`;
      if (body.previous) {
        user += `APUNTES ACUMULADOS (JSON; intégralos y devuélvelos actualizados):\n${body.previous}\n\n`;
      }
      user += `TRANSCRIPCIÓN NUEVA:\n${body.transcript}`;

      const deep = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.CHAT_MODEL || 'llama-3.3-70b-versatile', // ← la línea mágica: se lee de .dev.vars
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!deep.ok) {
        return new Response(JSON.stringify({ error: await deep.text() }), { status: 502, headers: CORS });
      }
      const data = (await deep.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '{}';
      return new Response(content, { headers: CORS });
    }

    return new Response(JSON.stringify({ ok: true, service: 'apuntesia-worker' }), { headers: CORS });
  },
} satisfies ExportedHandler<Env>;