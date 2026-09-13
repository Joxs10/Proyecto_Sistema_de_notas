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
        sendResponse({ ok: true, already: true }); // ignora doble start
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
      chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
      sendResponse({ ok: true });
    }

    if (msg.type === 'AUDIO_CHUNK') {
      if (!isRecording) return; // descarta chunks de recorders zombi
      chunkCount += 1;
      chrome.action.setBadgeText({ text: String(chunkCount) });
      chrome.action.setBadgeBackgroundColor({ color: '#E11D48' });
    }
  });

  async function startCapture(tabId: number) {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    try {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('/offscreen.html'),
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Capturar el audio de la clase para transcribirlo',
      });
    } catch {
      /* ya existe */
    }
    chrome.runtime.sendMessage({ type: 'START_CAPTURE', streamId });
  }
});