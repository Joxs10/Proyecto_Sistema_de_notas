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

    if (msg.type === 'TRANSCRIPT_ERROR') {
      chrome.runtime.sendMessage({ type: 'TRANSCRIPT_ERROR', error: msg.error }).catch(() => {});
      return;
    }
  });

  async function startCapture(tabId: number) {
    const tab = await chrome.tabs.get(tabId);
    void chrome.storage.session.set({ topic: tab.title ?? '' });
    const url = tab.url ?? '';
    if (/^(chrome|chrome-extension|about|devtools|edge):/.test(url) || url.includes('chromewebstore')) {
      throw new Error('Abre una pestaña normal (YouTube, Meet, Zoom…) para capturar');
    }
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
});