let mediaStream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let playback: HTMLAudioElement | null = null;
let recording = false;
let contextPrompt = '';
const SEGMENT_MS = 15_000;
const WORKER = 'http://localhost:8787';

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_CAPTURE') {
    void start(msg.streamId as string, (msg.title as string) ?? '');
  }
  if (msg.type === 'STOP_CAPTURE') stop();
});

async function start(streamId: string, title: string) {
  stop();
  recording = true;
  contextPrompt = title.slice(0, 120);
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // @ts-expect-error constraints específicas de Chrome para tab capture
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
      },
    });
  } catch (err) {
    recording = false;
    void chrome.runtime.sendMessage({
      type: 'TRANSCRIPT_ERROR',
      error: 'No pude capturar esta pestaña (¿pestaña interna de Chrome o captura previa colgada?). Recarga la extensión y prueba en una pestaña normal.',
    });
    return;
  }

  // 🔊 El audio vuelve a tus oídos (tabCapture silencia la pestaña)
  playback = new Audio();
  playback.srcObject = mediaStream;
  playback.volume = 1;
  void playback.play().catch((e) => console.warn('[ApuntesIA] playback:', e));

  beginSegment();
  console.log('[ApuntesIA] 🎧 grabando por segmentos de 15 s…');
}

function beginSegment() {
  if (!recording || !mediaStream) return;
  const rec = new MediaRecorder(mediaStream, { mimeType: 'audio/webm;codecs=opus' });
  recorder = rec;

  rec.ondataavailable = (e) => {
    if (e.data.size > 0) void transcribeWithRetry(e.data);
  };
  rec.onstop = () => {
    if (recording) beginSegment();
  };

  rec.start();
  setTimeout(() => {
    if (rec.state !== 'inactive') rec.stop();
  }, SEGMENT_MS);
}

async function transcribeWithRetry(blob: Blob, attempts = 2) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const form = new FormData();
      form.append('file', blob, 'chunk.webm');
      form.append('model', 'whisper-large-v3');
      form.append('language', 'es');
      if (contextPrompt) form.append('prompt', contextPrompt.slice(0, 220));
      const res = await fetch(`${WORKER}/transcribe`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error((body?.error ?? `worker ${res.status}`).slice(0, 140));
      }
      const { text } = (await res.json()) as { text: string };
      if (text?.trim()) {
        contextPrompt = text.trim();
        void chrome.runtime.sendMessage({ type: 'TRANSCRIPT_CHUNK', text });
      }
      return;
    } catch (err) {
      console.warn(`[ApuntesIA] intento ${i} falló:`, err);
      if (i === attempts) {
        void chrome.runtime.sendMessage({ type: 'TRANSCRIPT_ERROR', error: String(err) });
      } else {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
}

function stop() {
  recording = false;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  playback?.pause();
  playback = null;
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
}