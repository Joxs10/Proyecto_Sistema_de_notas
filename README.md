# Proyecto_Sistema_de_notas
Este es un proyecto/emprendimiento creado para poder no solo practicar mis habilidades de desarrollo con IA, sino el poder intentar plasmar cualquier idea que se me ocurra, sin importar si sé programar al 100% o si siquiera saque algún provecho de ello.

# 🧠 ApuntesIA — Extensión Chrome que transcribe y resume clases en vivo

Extensión Chrome MV3 que captura el audio de clases virtuales (Meet/Zoom/Teams/YouTube), lo transcribe con Whisper y genera apuntes estructurados con LLMs en tiempo real. Construida con WXT + React + Cloudflare Workers como proxy de APIs.

**Stack:** TypeScript · React · WXT 0.21.4 · Cloudflare Workers · Groq (Whisper + GPT-OSS) · Chrome Extensions API

## ✨ Features

- 🎧 Captura de audio de pestaña sin bot visible (tabCapture API)
- 📝 Transcripción en vivo con Groq Whisper-large-v3 (español, latencia <1s)
- 🧠 Resúmenes estructurados con LLM: tema, pasos, ejemplos, conceptos, preguntas de examen
- 📚 Bóveda permanente de sesiones (hasta 50 clases archivadas en el navegador)
- 📖 Historial navegable con apertura de sesiones pasadas
- ⬇️ Export Markdown con estructura completa
- 📋 Copiar al portapapeles
- 🔊 Audio audible durante la captura (playback del stream)
- 🛡️ Secrets en Cloudflare Worker (nunca en la extensión)
- 💰 Cost-engineering: ~$0.0018/min de audio (Groq free tier cubre beta)

## 🚀 Quick Start

### Prerequisitos

- **Node.js 20+** (requerido por WXT 0.21 que usa `Promise.withResolvers`)
- **npm** (viene con Node)
- **Cuenta Groq gratis**: [console.groq.com](https://console.groq.com) → API Keys → Create (tier gratis con límites de RPM, sin tarjeta)

### 1. Clonar el repo

```bash
git clone https://github.com/Joxs10/Proyecto_Sistema_de_notas.git
cd Proyecto_Sistema_de_notas
```

### 2. Configurar el Worker (proxy de APIs)

```bash
cd worker
npm install
```

Crea el archivo de secrets locales:

```bash
cp .dev.vars.example .dev.vars
```

Edita `worker/.dev.vars` y pega tu key de Groq:

```
GROQ_API_KEY=gsk_tu_key_real_aqui
```

> **Nota:** El proyecto usa `openai/gpt-oss-120b` de Groq para el LLM (configurable en `.dev.vars` como `CHAT_MODEL`). DeepSeek está como ruta alternativa pero requiere saldo.

Corre el worker:

```bash
npx wrangler dev
```

Debes ver: `Ready on http://127.0.0.1:8787`

### 3. Configurar la extensión Chrome

En una **segunda terminal**:

```bash
cd extension
npm install
npm run dev
```

WXT abrirá automáticamente un **Chrome de pruebas** con la extensión instalada.

### 4. Probar

1. En el Chrome de pruebas, ve a YouTube y abre un video hablado en español (ej: [este tutorial de sumas](https://www.youtube.com/watch?v=example))
2. Clic en el ícono de la extensión (rompecabezas 🧩 → ApuntesIA)
3. **"▶ Tomar apuntes"** → selecciona la pestaña del video
4. **"📖 Ver apuntes en vivo"** → abre el sidepanel
5. Espera 45 s (3 chunks) → verás el primer resumen estructurado:
   - 📚 Tema
   - 🪜 Pasos de la clase (en orden)
   - ✏️ Ejemplos literales
   - ⭐ Puntos clave
   - 📖 Conceptos
   - 🎯 Posibles preguntas de examen
6. **"⏹ Detener grabación"** → la sesión se archiva automáticamente en **📚 Historial**
7. **📚 Historial** → abre la sesión → **⬇️ .md** para exportar

## 🏗️ Arquitectura

```
[ Pestaña YouTube/Meet/Zoom ]
        │ tabCapture (audio digital limpio)
        ▼
[ offscreen document ]
   ├─ playback <audio> → el usuario sigue escuchando
   ├─ MediaRecorder → segmentos webm/opus de 15 s
   └─ fetch POST /transcribe (FormData)
        ▼
[ Cloudflare Worker · localhost:8787 ]
        ▼
[ Groq · whisper-large-v3 · language=es ]
        ▼ texto
[ offscreen ] → TRANSCRIPT_CHUNK → [ background ]
                                      ├─ badge contador
                                      ├─ chrome.storage.session (historial en vivo)
                                      ├─ chrome.storage.local (bóveda permanente)
                                      └─ broadcast → [ sidepanel: apuntes en vivo ]
```

## 🐛 Hardest Bugs I Solved

### 1. `invalid_media_file` de Groq (502)
**Causa:** `MediaRecorder.start(15000)` con timeslice produce fragmentos sin cabecera webm; solo el primer chunk es un archivo válido.

**Solución:** Segmentación stop/start — cada `recorder.stop()` produce un webm completo y válido; `onstop` abre el siguiente segmento.

### 2. Video silenciado al capturar
**Causa:** `tabCapture` redirige el audio de la pestaña al stream capturado, silenciando la pestaña original.

**Solución:** Playback del stream en el offscreen con `reason: AUDIO_PLAYBACK` — el usuario sigue escuchando la clase.

### 3. Slugs de modelos caducan
**Causa:** Groq jubiló `llama-3.3-70b-versatile` durante el desarrollo; el fetch rechazaba con `model_not_found` en ~100 ms.

**Solución:** `CHAT_MODEL` en `.dev.vars` + endpoint `/models` que lista los modelos vigentes de tu cuenta. Cambio de cerebro = editar una línea de config, no código.

### 4. Botón "Resumir ahora" parecía muerto
**Causa:** Guardia silenciosa con `pending.length === 0` tras el auto-resumen cada 3 chunks; el botón no comunicaba su estado.

**Solución:** Contador visible `(N)` + disabled sin pendientes + cierre de cola automático al `STOP_CAPTURE`.

### 5. Deriva incremental (reescribía/reordenaba apuntes anteriores)
**Causa:** Prompt pedía "devuelve todo actualizado" + modelo rellenaba desde memoria en temas fáciles.

**Solución:** SYSTEM_PROMPT v2 con REGLA DE ORO: solo lo dicho en clase, orden cronológico, append-only, campos `pasos` y `ejemplos` literales.

### 6. `785 + 457 = 1200` (error aritmético)
**Causa:** Whisper oyó mal el número largo o el LLM calculó de memoria.

**Solución:** Decisión de fundador — no construir verificador aritmético con regex (no escala a cientos de fórmulas). Aceptado como riesgo conocido; verificación escalable (modelo matemático dedicado / anclaje visual) agendada para v0.2.

## 📊 Cost Engineering

| Componente | Costo por hora de clase | Tier usado |
|---|---|---|
| STT (Whisper) | ~$0.11 | Groq free tier |
| LLM (resúmenes) | ~$0.03 | Groq free tier |
| **Total** | **~$0.14/h** | Free tier cubre beta |

Con 100 usuarios beta intensivos (2 h/día): ~$900/mes en COGS. Margen objetivo con plan $2.99/mes: 75%+ tras migrar a STT local en navegador (v0.2).

## 📁 Estructura del repo

```
Proyecto_Sistema_de_notas/
├── extension/          # Extensión Chrome (WXT + React)
│   ├── entrypoints/
│   │   ├── background.ts      # Fuente de verdad, archivado, mensajes
│   │   ├── offscreen/         # Captura de audio, MediaRecorder, fetch al worker
│   │   ├── popup/             # UI de control (start/stop)
│   │   └── sidepanel/         # Apuntes en vivo, historial, export
│   └── wxt.config.ts          # Manifiesto, permisos
├── worker/             # Cloudflare Worker (proxy de APIs)
│   ├── src/index.ts           # Endpoints /transcribe, /summarize, /models
│   └── .dev.vars              # Secrets locales (GROQ_API_KEY)
└── docs/
    └── Bitacora.md            # Engineering journal de los 4 días de sprint
```

## 🔐 Seguridad

- **Secrets nunca en la extensión:** viven en `worker/.dev.vars` (local) o Cloudflare Secrets (producción)
- **`.dev.vars` gitignoreado:** verificado con prueba de key falsa en el Día 1
- **Push protection activo:** bloquea pushes con secrets antes de que lleguen
- **Secret scanning:** detecta secrets en el repo (público = automático)
- **Sin subida de audio a la nube:** todo el audio se procesa localmente en el offscreen; solo chunks transcritos viajan al Worker

## 📚 Engineering Journal

Todo el proceso de desarrollo (4 días, 19 commits) está documentado en [`docs/Bitacora.md`](docs/Bitacora.md) con errores, lecciones, métricas reales y decisiones de fundador. Incluye:
- Día 1: captura de audio
- Día 2: transcripción con Whisper
- Día 3: resúmenes con LLM
- Día 4: bóveda permanente + export

## 🛣️ Roadmap

- [ ] **v0.2:** STT local en navegador (Whisper WASM) → costo $0 por usuario
- [ ] **v0.2:** Modo Pizarra (visión con Gemini Flash-Lite) → lee slides y diagramas
- [ ] **v0.2:** Flashcards Anki exportables desde conceptos
- [ ] **v0.3:** Sync de sesiones con cuenta de usuario
- [ ] **v0.3:** Pricing regional PPP (Stripe por país)

## 📄 License

MIT

## 👤 Autor

**Josue Solano** — [GitHub](https://github.com/Joxs10) · [LinkedIn](https://linkedin.com/in/josue-solano-dev)

---

*Construido en 4 días como experimento de ingeniería + producto. Si te sirvió para aprender algo, dale ⭐ — y si quieres contribuir, abre un issue.*
```

