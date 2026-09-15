import { useEffect, useRef, useState } from 'react';

type Line = { id: number; t: string; text: string };
type Notes = {
  tema?: string;
  resumen?: string;
  pasos?: string[];
  ejemplos?: string[];
  puntos_clave?: string[];
  conceptos?: Array<{ termino: string; definicion: string }>;
  preguntas_examen?: Array<{ pregunta: string; respuesta: string }>;
};

const WORKER = 'http://localhost:8787';

export default function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [tab, setTab] = useState<'vivo' | 'apuntes'>('vivo');
  const pendingRef = useRef<string[]>([]);
  const notesRef = useRef<Notes | null>(null);
  const topicRef = useRef('');
  const busyRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const summarize = async () => {
    if (busyRef.current || pendingRef.current.length === 0) return;
    busyRef.current = true;
    setSummarizing(true);
    setError(null);
    const transcript = pendingRef.current.join('\n');
    try {
      const res = await fetch(`${WORKER}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          previous: notesRef.current ? JSON.stringify(notesRef.current) : undefined,
          topic: topicRef.current || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error((body?.error ?? `worker ${res.status}`).slice(0, 160));
      }
      const parsed = (await res.json()) as Notes;
      notesRef.current = parsed;
      setNotes(parsed);
      pendingRef.current = [];
      setPendingCount(0);
      setTab('apuntes');
    } catch (err) {
      setError(String(err));
    } finally {
      busyRef.current = false;
      setSummarizing(false);
    }
  };
  const summarizeRef = useRef(summarize);
  summarizeRef.current = summarize;

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }).then((res) => {
      const prev = (res?.lines ?? []) as Array<{ t: string; text: string }>;
      if (prev.length) setLines(prev.map((l, i) => ({ ...l, id: i })));
      topicRef.current = (res?.topic as string) ?? '';
    });
    const listener = (msg: any) => {
      if (msg.type === 'TRANSCRIPT_CHUNK') {
        setError(null);
        pendingRef.current.push(msg.text as string);
        setPendingCount(pendingRef.current.length);
        setLines((p) => [...p, { id: Date.now() + p.length, t: new Date().toLocaleTimeString(), text: msg.text as string }]);
        if (pendingRef.current.length >= 3) void summarizeRef.current();
      }
      if (msg.type === 'STOP_CAPTURE') {
        // 🎬 Cierre de cola: al detener la clase, resume lo que quedó pendiente
        void summarizeRef.current();
      }
      if (msg.type === 'TRANSCRIPT_ERROR') setError(msg.error);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 10px', border: '1px solid #555', borderRadius: 8, cursor: 'pointer',
    background: active ? '#4F46E5' : 'transparent', color: 'inherit', fontWeight: 600,
  });

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button style={btn(tab === 'vivo')} onClick={() => setTab('vivo')}>📝 En vivo</button>
        <button style={btn(tab === 'apuntes')} onClick={() => setTab('apuntes')}>🧠 Apuntes</button>
        <button
          style={btn(false)}
          onClick={() => void summarize()}
          disabled={summarizing || pendingCount === 0}
          title="Resume los chunks pendientes ahora (útil al final de la clase)"
        >
          {summarizing ? '🧠 Resumiendo…' : `🧠 Resumir ahora${pendingCount ? ` (${pendingCount})` : ''}`}
        </button>
      </div>

      {error && <p style={{ color: '#E11D48', margin: 0 }}>⚠️ {error}</p>}

      {tab === 'vivo' && (
        <div>
          {lines.length === 0 && <p style={{ opacity: 0.6 }}>Inicia una captura desde el ícono de la extensión…</p>}
          {lines.map((l) => (
            <p key={l.id} style={{ whiteSpace: 'pre-wrap', borderBottom: '1px solid #444', paddingBottom: 8 }}>
              <small style={{ opacity: 0.5 }}>{l.t}</small>
              <br />
              {l.text}
            </p>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {tab === 'apuntes' && (
        <div>
          {!notes && !summarizing && (
            <p style={{ opacity: 0.6 }}>Aún no hay apuntes: espera 3 chunks o pulsa "Resumir ahora".</p>
          )}
          {notes && (
            <>
              <h4 style={{ margin: 0 }}>📚 {notes.tema ?? 'Tema de la clase'}</h4>
              {notes.resumen && <p style={{ opacity: 0.85 }}>{notes.resumen}</p>}
              {!!notes.pasos?.length && (
                <>
                  <h5>🪜 Pasos de la clase (en orden)</h5>
                  <ol>{notes.pasos.map((p, i) => <li key={i} style={{ margin: '4px 0' }}>{p}</li>)}</ol>
                </>
              )}
              {!!notes.ejemplos?.length && (
                <>
                  <h5>✏️ Ejemplos literales</h5>
                  <ul>{notes.ejemplos.map((e, i) => <li key={i} style={{ margin: '4px 0' }}>{e}</li>)}</ul>
                </>
              )}
              {!!notes.puntos_clave?.length && (
                <>
                  <h5>⭐ Puntos clave</h5>
                  <ul>{notes.puntos_clave.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </>
              )}
              {!!notes.conceptos?.length && (
                <>
                  <h5>📖 Conceptos</h5>
                  {notes.conceptos.map((c, i) => (
                    <p key={i} style={{ margin: '4px 0' }}><b>{c.termino}:</b> {c.definicion}</p>
                  ))}
                </>
              )}
              {!!notes.preguntas_examen?.length && (
                <>
                  <h5>🎯 Posibles preguntas de examen</h5>
                  {notes.preguntas_examen.map((q, i) => (
                    <p key={i} style={{ margin: '6px 0' }}>
                      <b>P:</b> {q.pregunta}<br />
                      <b>R:</b> {q.respuesta}
                    </p>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}