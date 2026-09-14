# 📘 APUNTESIA — Bitácora de Sprint (Documento vivo)

## 0. Estado del proyecto al iniciar el Día 2

| Campo | Valor |
|---|---|
| Producto | Extensión Chrome que transcribe y resume clases virtuales (Meet/Zoom/Teams) en tiempo real |
| Nicho | Estudiantes universitarios latinos (+ personas con TDAH) |
| Diferenciadores | Sin bot visible · pricing $2.99-8.99 · privacidad (STT local en v0.2) · Modo Pizarra en roadmap |
| Repo | `github.com/Joxs10/Proyecto_Sistema_de_notas` (privado) |
| Stack | WXT 0.21.4 + React + TS · Node 24 · Cloudflare Worker (proxy) · Groq Whisper · DeepSeek V4-Flash |
| Hito logrado Día 1 | ✅ Captura de audio de pestaña con start/stop idempotente, commiteada y pusheada |
| Hito de hoy (Día 2) | 🎯 Transcripción en vivo: el audio se convierte en texto con Whisper |

### Arquitectura actual (tras Día 1)

```
[ Pestaña Meet/Zoom/YouTube ]
        │ audio del tab (tabCapture, sin bot)
        ▼
[ offscreen document ]  MediaRecorder → chunks webm/opus c/15 s
        │ mensajes AUDIO_CHUNK / TRANSCRIPT_CHUNK
        ▼
[ background (service worker) ]  fuente de verdad: isRecording, badge, relay
        │            │
        ▼            ▼
   [ popup ]     [ sidepanel ]   ← UI desechable que PREGUNTA estado (lección Día 1)
```

---

## 1. Bitácora Día 1 — Qué hicimos y POR QUÉ

### 1.1 Decisiones estratégicas (el "por qué" de fondo)

| Decisión | Razón |
|---|---|
| Nicho estudiantes, no empresas | Fellow/Otter/Fireflies venden a equipos de ventas ($7-19/mes, caps de 10 notas). Estructuralmente no pueden bajar a $2.99 ilimitado: su COGS por usuario pesado los comería. Nosotros sí podemos |
| SOC 2 / HIPAA no aplican | No son permisos: SOC 2 es auditoría voluntaria para vender a enterprise; HIPAA es ley de salud EEUU. Nuestro nicho es el de MENOS fricción regulatoria |
| Precio $2.99 base | Costo real por usuario intensivo ≈ $0.74-0.99/mes (DeepSeek V4-Flash + cache hits) → margen 67-75%. Escalera v2: Pro $4.99 (Pizarra 20 h) y Pro Max $8.99 (60 h) |
| Marketing $0 el primer mes | TikTok/StudyTok + build in public + viral loop en exportaciones + nano-influencers barter. Ads solo tras validar conversión |
| Criterios de muerte definidos | <30 signups en 3+ canales o retención D3 <20% → pivotar con datos, no con miedo |

### 1.2 Decisiones de entorno

| Decisión | Razón |
|---|---|
| VS Code local, NO Codespaces | Una extensión Chrome solo se prueba en un Chrome real con gestos reales (tabCapture, side panel). Codespaces no tiene navegador con UI |
| Repo privado + `.gitignore` extendido | `.dev.vars` y `.wrangler/` sellados desde el commit 0 (ahí viven las API keys locales). Verificado con prueba de key falsa: `git status` limpio ✅ |
| WXT como framework | Genera MV3 correcto, HMR y abre Chrome de prueba solo. Elegimos React (ecosistema + CV) + TypeScript + npm |
| Node 20 → 24 | WXT 0.21 usa `Promise.withResolvers` (requiere Node 22+). Error del Día 1 #1 |

### 1.3 Código construido (5 archivos)

1. `wxt.config.ts` → permisos `tabCapture`, `offscreen`, `storage` (+`sidePanel` hoy)
2. `entrypoints/background.ts` → `getMediaStreamId` + creación del offscreen + badge + **estado como fuente de verdad** (`GET_STATE`)
3. `entrypoints/offscreen/index.html` + `main.ts` → `getUserMedia` del tab + `MediaRecorder` (chunks 15 s) + `stop()` que libera tracks
4. `entrypoints/popup/App.tsx` → botón iniciar/detener que consulta estado real al abrir

### 1.4 Errores del Día 1 y lecciones (tu manual de guerra)

| # | Error | Causa | Solución | Lección |
|---|---|---|---|---|
| 1 | `Promise.withResolvers is not a function` | Node 20 < requisito de WXT 0.21 | Subir a Node 24 | Verificar engines ANTES de scaffoldear |
| 2 | Firewall Windows bloquea Node | Dev server abre puerto local | Permitir solo redes privadas | Normal en todo dev server |
| 3 | `Multiple entrypoints with the same name` | `offscreen.html` y `offscreen.ts` sueltos en `entrypoints/` = 2 entrypoints "offscreen" | Carpeta `offscreen/` con `index.html` + `main.ts` | En WXT, todo archivo suelto en entrypoints/ ES un entrypoint |
| 4 | `move` fallaba "no existe" | El primer move YA había funcionado | Renombrar en VS Code | Leer la terminal línea por línea antes de repetir comandos |
| 5 | Grabaciones zombi acumuladas (badge 3) | Popup con amnesia (useState muere al cerrar) + `start()` no idempotente | Background como fuente de verdad + `stop()` previo en `start()` + liberar tracks | **En extensiones, el service worker recuerda; la UI pregunta** |
| 6 | `&&` inválido en PowerShell | PS 5.1 no lo soporta | `;` o líneas separadas | La terminal también tiene versiones |
| 7 | `move` de carpeta bloqueada | Dev server + Chrome + VS Code con archivos abiertos | Ctrl+C → cerrar VS Code/Chrome → mover | Windows no mueve lo que está en uso |

### 1.5 Hito emocional del Día 1
Badge rojo con "3" sobre el ícono = **primeros 45 segundos de audio capturados por tu propio producto**. Commit: `feat: captura de audio de pestana con start/stop idempotente (Dia 1)` → pusheado.

---

## 2. DÍA 2 — Transcripción en vivo con Whisper

### 2.1 Objetivo y Definición de Terminado

**Objetivo:** que los chunks de audio viajen a un Worker de Cloudflare, Groq los transcriba en español, y el texto aparezca en vivo en un panel lateral.

**Definición de Terminado (checklist):**
- [ ] `wrangler dev` corriendo con tu key de Groq en `.dev.vars`
- [ ] Video de YouTube en español (2-3 min) → iniciar captura → **texto apareciendo en el sidepanel cada ~15 s**
- [ ] Badge cuenta chunks transcritos
- [ ] Si matas el worker, el sidepanel muestra el error sin romperse
- [ ] Commit + push: `feat: transcripcion en vivo con Groq Whisper (Dia 2)`

### 2.2 Por qué estas decisiones técnicas

| Decisión | Por qué |
|---|---|
| **Proxy en Cloudflare Worker** (no llamar Groq desde la extensión) | Una API key dentro de la extensión es pública: cualquiera la extrae en 2 minutos. El Worker es tu bóveda + futuro punto de autenticación y metering |
| **Groq Whisper large-v3** (no OpenAI) | ~$0.0018/min vs $0.006/min de OpenAI (3.3x más barato), latencia mínima, español excelente, tier gratis para beta |
| **Sidepanel** (no popup) para el transcript | Lección Día 1: el popup muere al cerrarse. El sidepanel persiste mientras navegas |
| **Chunks de 15 s** | Balance entre sensación "en vivo" y overhead de peticiones. Ajustable luego |

### 2.3 Flujo del Día 2

```
offscreen (chunk webm 15 s)
   │ POST /transcribe (FormData: file+model+language)
   ▼
Cloudflare Worker (localhost:8787)  ← GROQ_API_KEY vive aquí, en .dev.vars
   │ passthrough multipart
   ▼
Groq whisper-large-v3 (language=es)
   │ { text }
   ▼
Worker → offscreen → TRANSCRIPT_CHUNK → background → sidepanel (texto en vivo)
```

### 2.4 Paso A — Crear el Worker

```powershell
cd C:\Users\spjos\Proyecto_Sistema_de_notas
npm create cloudflare@latest worker
# opciones: Hello World worker · TypeScript · no iniciar git
cd worker
```

Reemplaza `src/index.ts` con:

```ts
interface Env {
  GROQ_API_KEY: string;
  DEEPSEEK_API_KEY: string; // se usa mañana (Día 3)
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

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

    return new Response(JSON.stringify({ ok: true, service: 'apuntesia-worker' }), { headers: CORS });
  },
} satisfies ExportedHandler<Env>;
```

Crea el archivo `.dev.vars` dentro de `worker/` (NUNCA lo commitees; tu `.gitignore` ya lo sella):

```
GROQ_API_KEY=gsk_tu_key_real_aqui
```

Levántalo:

```powershell
npx wrangler dev    # → http://localhost:8787
```

Prueba de vida: abre `http://localhost:8787` en el navegador → debe responder `{"ok":true,"service":"apuntesia-worker"}`.

### 2.5 Paso B — offscreen envía el chunk al Worker

En `entrypoints/offscreen/main.ts`, agrega arriba `const WORKER = 'http://localhost:8787';` y reemplaza el `ondataavailable`:

```ts
recorder.ondataavailable = async (e) => {
  if (e.data.size === 0) return;
  try {
    const form = new FormData();
    form.append('file', e.data, 'chunk.webm');
    form.append('model', 'whisper-large-v3');
    form.append('language', 'es');
    const res = await fetch(`${WORKER}/transcribe`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`worker respondió ${res.status}`);
    const { text } = (await res.json()) as { text: string };
    if (text?.trim()) {
      void chrome.runtime.sendMessage({ type: 'TRANSCRIPT_CHUNK', text });
    }
  } catch (err) {
    void chrome.runtime.sendMessage({ type: 'TRANSCRIPT_ERROR', error: String(err) });
  }
};
```

### 2.6 Paso C — background retransmite al sidepanel

En tu listener de `background.ts`, dentro del caso `TRANSCRIPT_CHUNK` (donde ya sumas el badge), agrega el relay:

```ts
if (msg.type === 'TRANSCRIPT_CHUNK') {
  if (!isRecording) return;
  chunkCount += 1;
  chrome.action.setBadgeText({ text: String(chunkCount) });
  chrome.runtime.sendMessage({ type: 'TRANSCRIPT_CHUNK', text: msg.text }); // → sidepanel
  return;
}
if (msg.type === 'TRANSCRIPT_ERROR') {
  chrome.runtime.sendMessage({ type: 'TRANSCRIPT_ERROR', error: msg.error });
  return;
}
```

Y en `wxt.config.ts` suma permisos y host del worker:

```ts
manifest: {
  permissions: ['tabCapture', 'offscreen', 'storage', 'sidePanel'],
  host_permissions: ['http://localhost:8787/*'],
},
```

### 2.7 Paso D — Sidepanel con transcript en vivo

Crea `entrypoints/sidepanel/index.html`:

```html
<!doctype html>
<html>
  <head><meta charset="UTF-8" /><title>Apuntes en vivo</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`entrypoints/sidepanel/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

`entrypoints/sidepanel/App.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';

type Line = { id: number; t: string; text: string };

export default function App() {
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const listener = (msg: any) => {
      if (msg.type === 'TRANSCRIPT_CHUNK') {
        setError(null);
        setLines((p) => [...p, { id: Date.now(), t: new Date().toLocaleTimeString(), text: msg.text }]);
      }
      if (msg.type === 'TRANSCRIPT_ERROR') setError(msg.error);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

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
          <br />{l.text}
        </p>
      ))}
      <div ref={endRef} />
    </div>
  );
}
```

Y en el popup (`entrypoints/popup/App.tsx`) agrega un botón para abrirlo:

```tsx
const openPanel = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
};
// dentro del JSX, bajo el botón principal:
<button onClick={openPanel} style={{ padding: 8, borderRadius: 8, border: '1px solid #555', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
  📖 Ver apuntes en vivo
</button>
```

### 2.8 Prueba de fuego del Día 2

1. `npx wrangler dev` corriendo (terminal 1)
2. `npm run dev` en `extension/` (terminal 2)
3. Chrome de prueba → YouTube → video hablado en español (una clase pública, 2-3 min)
4. Ícono → "▶ Tomar apuntes" → "📖 Ver apuntes en vivo"
5. **Cada ~15 s aparece un párrafo con hora en el sidepanel** = tu extensión ya escucha Y escribe 🎧→📝
6. Prueba de error: Ctrl+C al wrangler → inicia otra captura → el sidepanel debe mostrar ⚠️ sin colgarse

### 2.9 Errores probables del Día 2 (para que no te asusten)

| Síntoma | Causa probable | Fix |
|---|---|---|
| CORS rojo en consola | Worker sin OPTIONS | Ya incluido en el código de arriba; verifica que sea ese archivo |
| 401 de Groq | Key mal pegada en `.dev.vars` | Edita `.dev.vars` y **reinicia `wrangler dev`** (no recarga solo) |
| Texto vacío | Chunk sin voz (música/silencio) | Prueba con video hablado |
| `Failed to fetch` | Worker caído o puerto distinto | Mira la terminal de wrangler; el puerto default es 8787 |

### 2.10 Cierre del Día 2
```powershell
cd C:\Users\spjos\Proyecto_Sistema_de_notas
git add -A
git status
git commit -m "feat: transcripcion en vivo con Groq Whisper via Worker (Dia 2)"
git push
```

---

## 3. Fuera de scope HOY (control de alcance)

❌ Resúmenes con DeepSeek → **Día 3** · ❌ Guardar sesiones/export → Día 4 · ❌ Consentimiento/privacidad → Día 5 · ❌ Landing/waitlist → Día 6 · ❌ Beta usuarios → Día 7 · ❌ Modo Pizarra → v0.2 · ❌ Pagos → semana 2

---

## 4. Recordatorios permanentes (no perder el norte)

- **Regla de oro de extensiones:** el background recuerda; la UI pregunta.
- **Keys jamás en la extensión ni en Git:** solo `.dev.vars` (local) y secrets de Cloudflare (producción).
- **PowerShell 5.1:** sin `&&`.
- **Cada día termina con commit + push.**
- **Criterios de muerte del experimento:** <30 signups en 3+ canales o retención D3 <20% → pivotar con datos.
- **Pricing v2 aprobado en brief:** Free gancho · Student $2.99 audio · Pro $4.99 Pizarra 20 h · Pro Max $8.99 Pizarra 60 h · excedente $0.50/h.

---



¿Arrancamos el Paso A del Día 2? Créame el worker y dime qué te responde `http://localhost:8787`. 🚀
