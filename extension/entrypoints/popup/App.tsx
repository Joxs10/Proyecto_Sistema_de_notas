import { useEffect, useState } from 'react';

export default function App() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }).then((res) => {
      if (res) setRecording(Boolean(res.isRecording));
    });
  }, []);

  const toggle = async () => {
    setError(null);
    if (recording) {
      await chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
      setRecording(false);
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const res = await chrome.runtime.sendMessage({ type: 'START_CAPTURE', tabId: tab.id });
    if (res?.ok) setRecording(true);
    else setError(res?.error ?? 'No se pudo iniciar la captura');
  };

  const openPanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
  };


  return (
    <div style={{ width: 300, padding: 16, fontFamily: 'system-ui', display: 'grid', gap: 12 }}>
      <h3 style={{ margin: 0 }}>🎧 ApuntesIA</h3>
      <button
        onClick={toggle}
        style={{
          padding: '10px 14px', border: 'none', borderRadius: 8, cursor: 'pointer',
          background: recording ? '#E11D48' : '#4F46E5', color: 'white', fontWeight: 600,
        }}
      >
        {recording ? '⏹ Detener grabación' : '▶ Tomar apuntes de esta pestaña'}
      </button>
      <button onClick={openPanel} style={{ padding: 8, borderRadius: 8, border: '1px solid #555', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
        📖 Ver apuntes en vivo
      </button>
      {recording && <p style={{ margin: 0, opacity: 0.7 }}>Grabando… mira el contador en el ícono.</p>}
      {error && <p style={{ margin: 0, color: '#E11D48' }}>{error}</p>}
    </div>
  );
}