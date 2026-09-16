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
type LightSession = { id: number; fecha: string; titulo: string; chunks: number };
type Session = LightSession & { lineas: Array<{ t: string; text: string }>; notes?: Notes | null };

const WORKER = 'http://localhost:8787';

function sessionToMarkdown(s: Session): string {
  const n = s.notes ?? {};
  const L: string[] = [];
  L.push(`# ${n.tema ?? s.titulo}`, '');
  L.push(`_Fecha: ${s.fecha} · Chunks: ${s.chunks}_`, '');
  if (n.resumen) L.push('## Resumen', '', n.resumen, '');
  if (n.pasos?.length) { L.push('## Pasos de la clase', ''); n.pasos.forEach((p, i) => L.push(`${i + 1}. ${p}`)); L.push(''); }
  if (n.ejemplos?.length) { L.push('## Ejemplos literales', ''); n.ejemplos.forEach((e) => L.push(`- ${e}`)); L.push(''); }
  if (n.puntos_clave?.length) { L.push('## Puntos clave', ''); n.puntos_clave.forEach((p) => L.push(`- ${p}`)); L.push(''); }
  if (n.conceptos?.length) { L.push('## Conceptos', ''); n.conceptos.forEach((c) => L.push(`- **${c.termino}:** ${c.definicion}`)); L.push(''); }
  if (n.preguntas_examen?.length) {
    L.push('## Posibles preguntas de examen', '');
    n.preguntas_examen.forEach((q) => L.push(`- **P:** ${q.pregunta}  `, `  **R:** ${q.respuesta}`));
    L.push('');
  }
  L.push('## Transcripción completa', '');
  s.lineas.forEach((l) => L.push(`**[${l.t}]** ${l.text}`, ''));
  return L.join('\n');
}

function NotesView({ notes }: { notes: Notes | null }) {
  if (!notes) return <p style={{ opacity: 0.6 }}>Esta sesión se guardó sin resumen.</p>;
  return (
    <>
      <h4 style={{ margin: 0 }}>📚 {notes.tema ?? 'Tema de la clase'}</h4>
      {notes.resumen && <p style={{ opacity: 0.85 }}>{notes.resumen}</p>}
      {!!notes.pasos?.length && (
        <><h5>🪜 Pasos de la clase (en orden)</h5><ol>{notes.pasos.map((p, i) => <li key={i} style={{ margin: '4px 0' }}>{p}</li>)}</ol></>
      )}
      {!!notes.ejemplos?.length && (
        <><h5>✏️ Ejemplos literales</h5><ul>{notes.ejemplos.map((e, i) => <li key={i} style={{ margin: '4px 0' }}>{e}</li>)}</ul></>
      )}
      {!!notes.puntos_clave?.length && (
        <><h5>⭐ Puntos clave</h5><ul>{notes.puntos_clave.map((p, i) => <li key={i}>{p}</li>)}</ul></>
      )}
      {!!notes.conceptos?.length && (
        <><h5>📖 Conceptos</h5>{notes.conceptos.map((c, i) => <p key={i} style={{ margin: '4px 0' }}><b>{c.termino}:</b> {c.definicion}</p>)}</>
      )}
      {!!notes.preguntas_examen?.length && (
        <><h5>🎯 Posibles preguntas de examen</h5>{notes.preguntas_examen.map((q, i) => (
          <p key={i} style={{ margin: '6px 0' }}><b>P:</b> {q.pregunta}<br /><b>R:</b> {q.respuesta}</p>
        ))}</>
      )}
    </>
  );
}

export default function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [tab, setTab] = useState<'vivo' | 'apuntes' | 'historial'>('vivo');
  const [sessions, setSessions] = useState<LightSession[]>([]);
  const [open, setOpen] = useState<Session | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
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

  const refreshSessions = () => {
    chrome.runtime.sendMessage({ type: 'GET_SESSIONS' }).then((r) => {
      setSessions((r?.sessions ?? []) as LightSession[]);
    });
  };

  const openSession = async (id: number) => {
    const r = await chrome.runtime.sendMessage({ type: 'GET_SESSION', id });
    setOpen((r?.session as Session) ?? null);
    setShowTranscript(false);
  };

  const exportSession = async (id: number) => {
    const r = await chrome.runtime.sendMessage({ type: 'GET_SESSION', id });
    const s = r?.session as Session | null;
    if (!s) return;
    const blob = new Blob([sessionToMarkdown(s)], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apuntes-${s.titulo.slice(0, 30).replace(/[^\wáéíóúñ -]/gi, '')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copySession = async (id: number) => {
    const r = await chrome.runtime.sendMessage({ type: 'GET_SESSION', id });
    const s = r?.session as Session | null;
    if (!s) return;
    await navigator.clipboard.writeText(sessionToMarkdown(s));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const deleteSession = async (id: number) => {
    if (!confirm('¿Borrar esta sesión para siempre?')) return;
    await chrome.runtime.sendMessage({ type: 'DELETE_SESSION', id });
    setSessions((p) => p.filter((x) => x.id !== id));
    setOpen((o) => (o?.id === id ? null : o));
  };

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }).then((res) => {
      const prev = (res?.lines ?? []) as Array<{ t: string; text: string }>;
      if (prev.length) setLines(prev.map((l, i) => ({ ...l, id: i })));
      topicRef.current = (res?.topic as string) ?? '';
    });
    refreshSessions();
    const listener = (msg: any) => {
      if (msg.type === 'TRANSCRIPT_CHUNK') {
        setError(null);
        pendingRef.current.push(msg.text as string);
        setPendingCount(pendingRef.current.length);
        setLines((p) => [...p, { id: Date.now() + p.length, t: new Date().toLocaleTimeString(), text: msg.text as string }]);
        if (pendingRef.current.length >= 3) void summarizeRef.current();
      }
      if (msg.type === 'STOP_CAPTURE') {
        void summarizeRef.current();
        setTimeout(refreshSessions, 2500); // da tiempo al archivado con resumen final
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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={btn(tab === 'vivo')} onClick={() => setTab('vivo')}>📝 En vivo</button>
        <button style={btn(tab === 'apuntes')} onClick={() => setTab('apuntes')}>🧠 Apuntes</button>
        <button style={btn(tab === 'historial')} onClick={() => { setTab('historial'); refreshSessions(); }}>
          📚 Historial{sessions.length ? ` (${sessions.length})` : ''}
        </button>
        <button
          style={btn(false)}
          onClick={() => void summarize()}
          disabled={summarizing || pendingCount === 0}
          title="Resume los chunks pendientes ahora"
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
          <NotesView notes={notes} />
        </div>
      )}

      {tab === 'historial' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {sessions.length === 0 && (
            <p style={{ opacity: 0.6 }}>Aún no hay sesiones. Graba una clase y detenla: se archiva sola.</p>
          )}
          {sessions.map((s) => (
            <div key={s.id} style={{ border: '1px solid #444', borderRadius: 8, padding: 8, display: 'grid', gap: 6 }}>
              <b>{s.titulo}</b>
              <small style={{ opacity: 0.6 }}>{s.fecha} · {s.chunks} chunks</small>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={btn(false)} onClick={() => void openSession(s.id)}>👁 Abrir</button>
                <button style={btn(false)} onClick={() => void exportSession(s.id)}>⬇️ .md</button>
                <button style={btn(false)} onClick={() => void copySession(s.id)}>
                  {copiedId === s.id ? '✅ Copiado' : '📋 Copiar'}
                </button>
                <button style={btn(false)} onClick={() => void deleteSession(s.id)}>🗑</button>
              </div>
            </div>
          ))}

          {open && (
            <div style={{ borderTop: '2px solid #4F46E5', paddingTop: 8, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>📖 {open.titulo}</b>
                <button style={btn(false)} onClick={() => setOpen(null)}>✖ Cerrar</button>
              </div>
              <NotesView notes={open.notes ?? null} />
              <button style={btn(false)} onClick={() => setShowTranscript((v) => !v)}>
                {showTranscript ? '🙈 Ocultar transcripción' : `📜 Ver transcripción (${open.lineas.length})`}
              </button>
              {showTranscript &&
                open.lineas.map((l, i) => (
                  <p key={i} style={{ whiteSpace: 'pre-wrap', borderBottom: '1px solid #444', paddingBottom: 6 }}>
                    <small style={{ opacity: 0.5 }}>{l.t}</small>
                    <br />
                    {l.text}
                  </p>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}