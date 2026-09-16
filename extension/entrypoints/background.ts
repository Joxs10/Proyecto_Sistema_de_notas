const WORKER_URL = 'http://localhost:8787';

export default defineBackground(() => {
  let chunkCount = 0;
  let isRecording = false;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_STATE') {
      sendResponse({ isRecording, chunkCount });
      return;
    }

    if (msg.type === 'START_CAPTURE') {
      if (isRecording) {
        sendResponse({ ok: true, already: true });
        return;
      }
      startCapture(msg.tabId as number)
        .then(() => { isRecording = true; sendResponse({ ok: true }); })
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (msg.type === 'STOP_CAPTURE') {
      isRecording = false;
      chunkCount = 0;
      chrome.action.setBadgeText({ text: '' });
      chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }).catch(() => {});
      void archiveSession();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === 'TRANSCRIPT_CHUNK') {
      if (!isRecording) return;
      chunkCount += 1;
      chrome.action.setBadgeText({ text: String(chunkCount) });
      chrome.action.setBadgeBackgroundColor({ color: '#E11D48' });
      chrome.storage.session
        .get({ lines: [] as Array<{ t: string; text: string }> })
        .then((s) => {
          void chrome.storage.session.set({
            lines: [...s.lines, { t: new Date().toLocaleTimeString(), text: msg.text as string }],
          });
        });
      return;
    }

    if (msg.type === 'GET_HISTORY') {
      chrome.storage.session
        .get({ lines: [], topic: '' })
        .then((s) => sendResponse({ lines: s.lines, topic: s.topic }));
      return true;
    }

    if (msg.type === 'GET_SESSIONS') {
      chrome.storage.local.get({ sessions: [] }).then((s) => {
        const light = (s.sessions as Array<Record<string, unknown>>).map(
          ({ lineas: _lineas, ...rest }) => rest
        );
        sendResponse({ sessions: light });
      });
      return true;
    }

    if (msg.type === 'GET_SESSION') {
      chrome.storage.local.get({ sessions: [] }).then((s) => {
        const found =
          (s.sessions as Array<{ id: number }>).find((x) => x.id === msg.id) ?? null;
        sendResponse({ session: found });
      });
      return true;
    }

    if (msg.type === 'DELETE_SESSION') {
      chrome.storage.local.get({ sessions: [] }).then((s) => {
        const sessions = (s.sessions as Array<{ id: number }>).filter((x) => x.id !== msg.id);
        return chrome.storage.local.set({ sessions }).then(() => sendResponse({ ok: true }));
      });
      return true;
    }

    if (msg.type === 'TRANSCRIPT_ERROR') {
      chrome.runtime.sendMessage({ type: 'TRANSCRIPT_ERROR', error: msg.error }).catch(() => {});
      return;
    }
  });

  async function startCapture(tabId: number) {
    const tab = await chrome.tabs.get(tabId);
    const url = tab.url ?? '';
    if (/^(chrome|chrome-extension|about|devtools|edge):/.test(url) || url.includes('chromewebstore')) {
      throw new Error('Abre una pestaña normal (YouTube, Meet, Zoom…) para capturar');
    }
    void chrome.storage.session.set({ topic: tab.title ?? '' });
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    try {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('/offscreen.html'),
        reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: 'Capturar el audio de la clase para transcribirlo',
      });
    } catch {
      /* ya existe */
    }
    chrome.runtime.sendMessage({ type: 'START_CAPTURE', streamId, title: tab.title ?? '' });
  }

  async function archiveSession() {
    const s = await chrome.storage.session.get({
      lines: [] as Array<{ t: string; text: string }>,
      topic: '',
    });
    if (!s.lines.length) return;

    const transcript = s.lines.map((l) => l.text).join('\n');
    let notes: unknown = null;
    try {
      const res = await fetch(`${WORKER_URL}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, topic: s.topic || undefined }),
      });
      if (res.ok) notes = await res.json();
    } catch {
      /* la sesión se guarda igual, sin resumen */
    }

    const prev = await chrome.storage.local.get({ sessions: [] as unknown[] });
    const session = {
      id: Date.now(),
      fecha: new Date().toLocaleString(),
      titulo: s.topic || 'Clase sin título',
      chunks: s.lines.length,
      lineas: s.lines,
      notes,
    };
    const sessions = [session, ...(prev.sessions as unknown[])].slice(0, 50);
    await chrome.storage.local.set({ sessions });
    await chrome.storage.session.set({ lines: [], topic: '' });
    console.log('[ApuntesIA] 📚 sesión archivada:', session.titulo);
  }
});