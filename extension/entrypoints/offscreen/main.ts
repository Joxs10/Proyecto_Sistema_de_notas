let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_CAPTURE') void start(msg.streamId as string);
  if (msg.type === 'STOP_CAPTURE') stop();
});

async function start(streamId: string) {
  stop(); // blindaje: nunca dos recorders vivos a la vez
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // @ts-expect-error constraints específicas de Chrome para tab capture
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    },
  });

  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  recorder.ondataavailable = (e) => {
    if (e.data.size === 0) return;
    void chrome.runtime.sendMessage({ type: 'AUDIO_CHUNK', size: e.data.size });
  };
  recorder.start(15_000);
}

function stop() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  stream?.getTracks().forEach((t) => t.stop()); // libera la captura de la pestaña
  stream = null;
}