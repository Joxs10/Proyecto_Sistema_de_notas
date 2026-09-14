import { useEffect, useRef, useState } from 'react';

type Line = { id: number; t: string; text: string };

export default function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }).then((res) => {
      const prev = (res?.lines ?? []) as Array<{ t: string; text: string }>;
      if (prev.length) setLines(prev.map((l, i) => ({ ...l, id: i })));
    });
    const listener = (msg: any) => {
      if (msg.type === 'TRANSCRIPT_CHUNK') {
        setError(null);
        setLines((p) => [...p, { id: Date.now() + p.length, t: new Date().toLocaleTimeString(), text: msg.text }]);
      }
      if (msg.type === 'TRANSCRIPT_ERROR') setError(msg.error);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <h3>📝 Apuntes en vivo</h3>
      {error && <p style={{ color: '#E11D48' }}>⚠️ {error}</p>}
      {lines.length === 0 && !error && (
        <p style={{ opacity: 0.6 }}>Inicia una captura desde el ícono de la extensión y habla o pon una clase…</p>
      )}
      {lines.map((l) => (
        <p key={l.id} style={{ whiteSpace: 'pre-wrap', borderBottom: '1px solid #444', paddingBottom: 8 }}>
          <small style={{ opacity: 0.5 }}>{l.t}</small>
          <br />
          {l.text}
        </p>
      ))}
      <div ref={endRef} />
    </div>
  );
}