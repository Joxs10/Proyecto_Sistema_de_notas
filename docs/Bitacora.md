# 📘 Documentación del Día 3 — detallada y lista para tu bitácora

## 3. Bitácora Día 3 — El cerebro: resúmenes estructurados en vivo

### 3.1 Objetivo y resultado

| Campo | Valor |
|---|---|
| Objetivo | Convertir el río de transcripciones en apuntes estructurados (tema, pasos, ejemplos, conceptos, preguntas de examen) con un LLM vía el Worker |
| Resultado | ✅ Cumplido: apuntes en vivo en sidepanel, actualizados cada ~45 s, cronológicos y anclados a la transcripción; cierre de cola al detener |
| Cerebro usado | Groq `openai/gpt-oss-120b` (tier gratis). DeepSeek V4-Flash queda como ruta de producción pendiente de top-up |
| STT | Groq `whisper-large-v3` (sin cambios, 200 OK estables) |
| Commits del día | `feat: Dia 3 - resumenes estructurados en vivo, prompt v2 anclado a transcripcion, cierre de cola y boton honesto` |
| Costo facturado | $0.00 (Groq free tier; DeepSeek sin saldo no facturó) |

### 3.2 Decisiones técnicas y de fundador (el "por qué")

| Decisión | Razón |
|---|---|
| Endpoint `/summarize` en el mismo Worker | Un solo proxy para todos los proveedores: auth, CORS y metering centralizados |
| SYSTEM_PROMPT con schema JSON estricto (`response_format: json_object`) | El sidepanel renderiza estructura, no párrafos: tema, pasos, ejemplos, conceptos, preguntas |
| Modo incremental con prefijo cache-friendly | El system prompt + apuntes anteriores se repiten idénticos al inicio; lo nuevo va al final → cache hits que abaratan cada pasada |
| Auto-resumen cada 3 chunks + botón manual | Sensación en vivo sin spam de llamadas; el botón existe para cerrar la cola final |
| **Cambio de cerebro DeepSeek → Groq** | DeepSeek respondió `Insufficient Balance` (modelo prepago sin crédito). Groq ya tenía key y tier gratis con LLMs → cero fricción para seguir |
| `CHAT_MODEL` en `.dev.vars` + endpoint `/models` | Los slugs de modelos caducan (pasó el mismo día): config fuera del código + inventario consultable de cerebros disponibles |
| **SYSTEM_PROMPT v2 con REGLA DE ORO** | El modelo confabulaba en temas "fáciles" (rellenaba desde memoria) y reescribía el pasado (deriva incremental). Reglas: solo lo dicho en clase, orden cronológico, append-only, campos `pasos` y `ejemplos` literales |
| Cierre de cola automático al `STOP_CAPTURE` | Los 1-2 chunks huérfanos del final de la clase ya no se pierden |
| Botón honesto (contador de pendientes + disabled) | Un botón que no comunica su estado parece roto; ahora muestra `(N)` y se desactiva sin cola |
| **NO construir verificador aritmético determinista (decisión de fundador)** | El bug `785 + 457 = 1200` se podía parchear con regex por operación, pero no escala a cientos de fórmulas. Se acepta el riesgo hoy y se agenda verificación escalable (modelo matemático dedicado o anclaje visual) en v0.2 |
| Postura competitiva ante FreeNotes (S/20/año) | No se compite en precio: a $0.44/mes nadie sostiene STT+LLM en nube real. Se compite en resultado (captura en vivo + examen) y se agenda pricing regional PPP para la semana de pagos |

### 3.3 Código construido/modificado

1. `worker/src/index.ts` → versiones v1→v4 hasta la final: `/models` (inventario Groq), `/transcribe` (sin cambios), `/summarize` (body con try/catch 400, prefijo cache-friendly, `model: env.CHAT_MODEL`, SYSTEM_PROMPT v2, relay de errores del proveedor en el 502)
2. `worker/.dev.vars` → `+ DEEPSEEK_API_KEY`, `+ CHAT_MODEL=openai/gpt-oss-120b`
3. `entrypoints/background.ts` → guarda `topic` (título de pestaña) en `chrome.storage.session`; `GET_HISTORY` devuelve `{lines, topic}`
4. `entrypoints/sidepanel/App.tsx` → v2 (tabs En vivo/Apuntes + botón) → v3 (contador de pendientes, listener `STOP_CAPTURE` para cierre de cola, render de `pasos` y `ejemplos`, error que muestra el motivo real del proveedor)

### 3.4 Activo documental: SYSTEM_PROMPT v2 (vigente)

```text
Eres ApuntesIA, un tomador de apuntes universitario experto. Recibes la transcripción cruda de una clase.

REGLA DE ORO: usa ÚNICAMENTE información presente en la transcripción. NO inventes ejemplos, números,
procedimientos ni definiciones que el profesor no mencionó. Si un dato no está, omítelo: un hueco
honesto vale más que una mentira pulida.

Preserva el ORDEN CRONOLÓGICO de la clase.

Devuelve ÚNICAMENTE un JSON válido:
{ "tema", "resumen", "pasos": string[], "ejemplos": string[], "puntos_clave": string[],
  "conceptos": [{termino, definicion}], "preguntas_examen": [{pregunta, respuesta}] }

Reglas: corrige errores obvios de transcripción con tema/glosario; ignora basura no académica;
NO modifiques ni reordenes contenido acumulado (solo agrega); copia resultados tal cual los dijo
el profesor (no calcules por tu cuenta); máximos por pasada: 7 pasos, 6 ejemplos, 7 puntos,
6 conceptos, 4 preguntas; español.
```

### 3.5 Errores del Día 3 y lecciones (manual de guerra, parte 3)

| # | Error | Causa raíz | Solución | Lección |
|---|---|---|---|---|
| 1 | Panel mostraba solo "Tema de la clase" sin errores; `/summarize 200 OK` en **8 ms** | Worker corriendo sin la ruta `/summarize` (archivo no guardado): el fallback `{"ok":true}` se parseó como notes vacío | Reemplazo completo del worker + reload | **La latencia es detector de mentiras**: un 200 en 8 ms no llamó a ningún proveedor |
| 2 | `502` sin motivo legible en el panel | El sidepanel no leía el body del error | Parche: leer `body.error` y mostrarlo | Todo proxy debe propagar el motivo del proveedor hasta la UI |
| 3 | `Insufficient Balance` de DeepSeek | Cuenta prepago sin crédito: su "gratis" no aplicaba | Conmutar cerebro a Groq (key existente) | La arquitectura provider-agnóstica convirtió una factura en un cambio de config |
| 4 | `model_not_found` con `llama-3.3-70b-versatile` (~100 ms de rechazo) | Groq jubiló/renombró el slug | `CHAT_MODEL` en `.dev.vars` + endpoint `/models`; se eligió `openai/gpt-oss-120b` | Los slugs caducan: el modelo debe ser configuración, no código |
| 5 | Botón "Resumir ahora" parecía muerto | Guardia silenciosa con pending vacío tras el auto-resumen | Contador `(N)` + disabled + cierre de cola en STOP | Un control sin feedback de estado es un control roto percibido |
| 6 | Deriva: el resumen reescribía/reordenaba lo anterior e inventaba ejemplos | Modo incremental pedía "devuelve todo actualizado" + modelo rellenando desde memoria en tema fácil | Prompt v2: append-only, REGLA DE ORO, campos `pasos`/`ejemplos` literales | Los apuntes que inventan son peores que los vacíos: el usuario confía en ellos |
| 7 | `785 + 457 = 1200` (correcto: 1242) | Oído de Whisper en números largos o aritmética del LLM | Propuesto guardrail determinista; **fundador lo agenda, no lo construye hoy** | No todo bug se parchea hoy: se decide con criterio de escala y se documenta |
| 8 | Confusión "¿dónde está el fetch?" | Concepto no internalizado | Mini-lección: fetch = llamada HTTP; el worker tiene 3 (models, transcribe, summarize) | Documentar el "qué es" antes del "dónde está" |

### 3.6 Métricas reales observadas

- **Latencia `/summarize` (gpt-oss-120b):** 2.1–3.7 s por pasada (aceptable para cadencia de 45 s)
- **Latencia de rechazo Groq (slug malo):** ~100 ms · **DeepSeek sin saldo:** ~750-850 ms
- **Cadencia de apuntes:** auto cada 3 chunks ≈ 45 s; cierre de cola instantáneo al detener
- **Costo facturado del día:** $0.00 (free tier Groq; DeepSeek no facturó sin saldo)
- **Calidad percibida:** pasos cronológicos fieles al video; ejemplos literales con un error aritmético conocido y aceptado (backlog)

### 3.7 Hitos del día

1. 🧠 Primer resumen estructurado generado por TU pipeline (no por un playground)
2. 🔀 Cambio de proveedor de LLM en vivo, sin reescribir arquitectura (proxy agnóstico)
3. 🩺 Endpoint `/models`: inventario de cerebros consultable
4. 🪜 Apuntes con pasos en orden cronológico y ejemplos literales (prompt v2)
5. 🎬 Cierre de cola: ningún chunk del final de la clase se queda sin resumir
6. 🛡️ Error propagation completo: UI → worker → proveedor, con motivo legible

### 3.8 Backlog y pendientes (con dueño y momento)

| Pendiente | Dueño | Cuándo |
|---|---|---|
| Verificación escalable de contenido (modelo matemático dedicado / anclaje visual Modo Pizarra) | Roadmap técnico | v0.2 |
| Top-up DeepSeek + benchmark A/B de calidad y costo Groq vs DeepSeek sobre transcripciones reales | Fundador | Beta cerrada |
| Teardown FreeNotes (4 preguntas: ¿captura en vivo? ¿preguntas de examen? ¿topes? ¿reseñas de transcripción?) | Fundador | 15 min, Día 4 con café |
| Pricing regional PPP (Stripe por país) como respuesta estructural a competidores low-cost | Semana de pagos | Día 6-7 |
| Bóveda permanente de sesiones + export Markdown/PDF | Próximo sprint | **Día 4** |
| Branding (nombre/descripción/íconos siguen `wxt-react-starter`) | Manifiesto + assets | Día 5 |

### 3.9 Nota de fundador (contexto emocional y estratégico del día)

Día 3 trajo el primer momento de duda ("la veo negra") disparado por un competidor a S/20/año y un error aritmético visible. Resolución documentada: (1) el error se acepta conscientemente con plan escalable, no por pereza; (2) el precio del competidor está por debajo del COGS real de IA en nube, lo que implica producto distinto o promo insostenible: se valida con teardown, no con pánico; (3) los criterios de muerte del experimento siguen siendo datos propios (signups, retención D3), no precios ajenos. Este proyecto ya es, en el peor escenario, un portafolio de ingeniería de nivel senior; en el mejor, una empresa. Ambos caminos se construyen igual: commiteando hoy.

---

## 4. Plan Día 4 — La bóveda: sesiones que no mueren

1. Almacenamiento permanente por sesión en `chrome.storage.local` (o IndexedDB si el tamaño aprieta): `{id, fecha, titulo, duracion, lineas, notes}`
2. Guardado automático al `STOP_CAPTURE` + lista de sesiones históricas en el sidepanel
3. Export **Markdown** (descarga directa) y copiar al portapapeles; PDF en v0.2
4. Decidir política de retención local (borrado manual por sesión; nada viaja a la nube sin auth del Día 5+)
5. Cierre: commit + push + entrada de bitácora con métricas (peso promedio de sesión, tiempo de export)

---

*Fin del Día 3. La extensión ya escucha, oye, escribe, resume en orden y cierra su cola. Mañana: memoria permanente y apuntes exportables — el día en que ApuntesIA deja de ser un experimento y se vuelve un archivo de conocimiento del estudiante.*
# 🗓️ DÍA 2 — Registro detallado: de audio mudo a transcripción en vivo

## 0. Resumen ejecutivo del día

| Campo | Valor |
|---|---|
| Objetivo | Que los chunks de audio capturados (Día 1) se conviertan en texto en vivo vía Whisper, sin romper la experiencia de la clase |
| Resultado | ✅ Cumplido: transcripción española en tiempo real en sidepanel, 30/30 requests exitosos, audio audible durante captura, historial de sesión persistente |
| Componentes nuevos | Cloudflare Worker (proxy de APIs), endpoint `/transcribe`, sidepanel, playback de audio, segmentación stop/start, prompt de contexto, historial `chrome.storage.session` |
| Commits del día | `feat: versiones consolidadas Dia 2 (guardia URL, historial sesion, anti-abort)` + push tras resolver divergencia remota |
| Costo observado | ~$0.014 USD por 7.5 min de audio (Groq whisper-large-v3, dentro del tier gratis) |

## 1. Arquitectura al cierre del Día 2

```
[ Pestaña YouTube/Meet/Zoom ]
        │ tabCapture (audio digital limpio, sin bot)
        ▼
[ offscreen document ]
   ├─ playback <audio> → el usuario SIGUE escuchando la clase
   ├─ MediaRecorder → segmentos webm/opus de 15 s (stop/start = archivos válidos)
   └─ fetch POST /transcribe (FormData)
        ▼
[ Cloudflare Worker · localhost:8787 ]  ← GROQ_API_KEY vive aquí (.dev.vars / secrets)
        ▼
[ Groq · whisper-large-v3 · language=es · prompt=titulo+ultimo segmento ]
        ▼ texto
[ offscreen ] → TRANSCRIPT_CHUNK → [ background ]
                                      ├─ badge contador
                                      ├─ chrome.storage.session (historial)
                                      └─ (broadcast natural) → [ sidepanel: apuntes en vivo ]
```

## 2. Archivos construidos/modificados hoy

| Archivo | Rol |
|---|---|
| `worker/src/index.ts` | Proxy CORS con endpoint `/transcribe` (passthrough multipart a Groq). Las keys NUNCA tocan la extensión |
| `worker/.dev.vars` | Bóveda local de secrets (ignorado por doble .gitignore) |
| `entrypoints/offscreen/main.ts` | Motor de captura: playback, segmentación 15 s, transcripción con reintento, prompt de contexto, errores amables |
| `entrypoints/background.ts` | Fuente de verdad: estado, badge, guardia de URLs, archivado a storage.session, GET_HISTORY |
| `entrypoints/sidepanel/*` | UI persistente de apuntes en vivo con carga de historial al montar |
| `entrypoints/popup/App.tsx` | Botón "📖 Ver apuntes en vivo" (abre sidepanel) |
| `wxt.config.ts` | Permisos: tabCapture, offscreen, storage, sidePanel, tabs |

## 3. Crónica de decisiones (el "por qué" de cada paso)

1. **Worker como proxy, no keys en la extensión:** una key embebida en una extensión es pública para cualquiera que la descompile. El Worker es bóveda + futuro punto de auth/metering.
2. **Groq sobre OpenAI:** ~3.3x más barato por minuto, latencia sub-segundo, español excelente, tier gratis para beta.
3. **Sidepanel sobre popup para el transcript:** lección Día 1 — el popup muere al cerrarse; el sidepanel persiste durante la clase.
4. **Playback del stream capturado:** `tabCapture` redirige y silencia el audio de la pestaña; sin playback el estudiante no oye su clase. Se devuelve el stream a un `<audio>` en el offscreen (reason `AUDIO_PLAYBACK`).
5. **Segmentación stop/start en vez de timeslice:** los fragmentos de timeslice carecen de cabecera webm y Groq los rechaza (`invalid_media_file`); cada `stop()` produce un archivo completo y válido.
6. **Prompt de contexto a Whisper:** el título de la pestaña + el último segmento transcrito sesgan el vocabulario ("sumas" en vez de "humas"). Costo $0, impacto alto.
7. **whisper-large-v3 sobre turbo:** más robusto con acentos latinoamericanos y ruido de aula; turbo queda como fallback.
8. **Historial en `chrome.storage.session`:** el sidepanel es desechable; la verdad de la sesión vive en storage y sobrevive cierre/apertura del panel y reinicios del service worker.
9. **Guardia de URLs + try/catch amable:** capturar `chrome://*` o una pestaña ya capturada aborta con `AbortError`; ahora se valida antes y se informa en lenguaje humano.
10. **Metodología de trabajo:** parches chicos = cirugías; archivo con 3+ parches acumulados = reemplazo completo del archivo. Cero merges a mano.

## 4. Catálogo de errores del Día 2 y sus lecciones

| # | Error | Causa raíz | Solución | Lección |
|---|---|---|---|---|
| 1 | Wizard de Cloudflare pide "URL de template" | Rama equivocada del asistente ("Template from a GitHub repo") | Ctrl+C y re-elegir `Hello World → Worker only` | Leer cada pregunta del wizard antes de responder |
| 2 | `502 Bad Gateway` + `invalid_media_file` de Groq | Chunks timeslice sin cabecera webm (solo el 1º era válido) | Segmentación stop/start cada 15 s | Un fragmento de MediaRecorder NO es un archivo |
| 3 | Video silenciado al capturar | Comportamiento oficial de tabCapture (redirige el audio) | Playback del stream en offscreen + `AUDIO_PLAYBACK` | Todo audio capturado debe devolverse al usuario |
| 4 | Líneas duplicadas en sidepanel | Relay redundante: el broadcast ya entregaba el mensaje al panel | Eliminar reenvío desde background | `runtime.sendMessage` llega a todos los contextos salvo el emisor |
| 5 | Offscreen muerto, sin logs ni reacciones | Parches pegados sueltos al final del archivo (`if (msg...)` a nivel de módulo → ReferenceError al cargar) | Archivo completo v5; regla de reemplazo | El código suelto a nivel de módulo se ejecuta al cargar: mata todo |
| 6 | `Could not establish connection. Receiving end does not exist.` | sendMessage sin receptores vivos (stop sin offscreen, post-recarga) | `.catch(() => {})` en envíos no críticos | El ruido de dev se silencia, no se "cura" |
| 7 | `AbortError: Error starting tab capture` | Pestaña `chrome://`, captura previa colgada, o streamId de un solo uso reusado | Guardia de URL + try/catch amable + ↻ de extensión | Validar el sujeto antes de capturarlo |
| 8 | `push` rechazado: `fetch first` / `non-fast-forward` | Commit remoto hecho desde la web ausente en local | `git pull --rebase origin main` y push | Pull al sentarte, push al acostarte |
| 9 | Rebase: `invalid path 'docs /Bitacora.md'` + `could not detach HEAD` | Carpeta creada en la web con espacio al final; Windows la prohíbe | Renombrar/recrear la ruta limpia desde GitHub | Windows tiene nombres prohibidos: espacio/punto final, CON, NUL… |
| 10 | Notas desaparecían al cerrar el panel | Estado React efímero en página desechable | Archivado en `chrome.storage.session` + `GET_HISTORY` | La UI pregunta; la verdad vive en background/storage |

## 5. Métricas observadas (datos reales, no promedios de internet)

- **Requests de transcripción:** 30/30 `POST /transcribe 200 OK` en la sesión final limpia
- **Latencia por chunk de 15 s:** 375–1,095 ms (Groq whisper-large-v3 local→worker→Groq)
- **Ritmo de apuntes:** 1 párrafo con timestamp cada ~15 s de clase
- **Costo STT nube observado:** ≈ $0.0018/min → ~$0.11/hora de clase (tier gratis cubre la beta)
- **Decisión registrada:** el plan barato de producción migrará a **Whisper local en navegador (v0.2)** para llevar ese costo a $0; Groq queda para beta y planes premium
- **Consola de offscreen al cierre:** limpia (solo log propio `🎧 grabando por segmentos de 15 s…`)

## 6. Hitos del día

1. 🗄️ Worker vivo con secrets ocultos (`"(hidden)"` en wrangler)
2. 📝 Primera transcripción española en vivo en el sidepanel
3. 🔊 Clase audible mientras se captura (playback)
4. 🧱 Segmentos webm válidos: fin de los `invalid_media_file`
5. 📚 Historial que sobrevive al cierre del panel
6. 🛡️ Captura blindada: URLs prohibidas y abortos manejados con mensaje humano
7. 🌳 Repo sincronizado tras la guerra del espacio en `docs `

## 7. Pendientes conocidos (con dueño y día)

| Pendiente | Dueño | Cuándo |
|---|---|---|
| Basura de videos en transcripciones ("¡Suscríbete!", créditos, "Subtitulado por…") | Filtro en prompt de DeepSeek | Día 3 |
| Branding: nombre/descripción/íconos siguen siendo `wxt-react-starter` | `wxt.config.ts` manifest + íconos | Día 5 |
| Bóveda permanente de sesiones + export Markdown/PDF | IndexedDB + UI de historial | Día 4 |
| Resúmenes estructurados (tema, puntos clave, conceptos, preguntas de examen) | Endpoint `/summarize` DeepSeek V4-Flash | Día 3 |
| STT local en navegador (costo $0, privacidad total) | transformers.js / whisper.cpp WASM | v0.2 |
| Modo Pizarra (visión con change-detection) y Modo Sistema (apps de escritorio) | Roadmap premium | v0.2 |
| Bot de Discord para servidores de estudio; Modo Micrófono (clases presenciales) | Roadmap de expansión | v0.3 |

## 8. Plan Día 3 (resumen operativo)

1. Worker: endpoint `/summarize` con DeepSeek V4-Flash (`response_format: json_object`, temperature 0.3)
2. Prompt system: apuntes estructurados + instrucción explícita de **filtrar basura no académica** y corregir errores obvios de transcripción usando el tema
3. Modo incremental con cache hits: resumen acumulado + nuevo texto como prefijo repetido
4. Sidepanel: pestaña "Apuntes" con render del JSON (tema, puntos clave, conceptos, preguntas de examen) + botón "Resumir ahora" y auto-cada 3 chunks
5. Cierre: commit + push + actualización de esta bitácora

## 9. Rituales permanentes (actualizados)

- **Apertura:** `git pull --rebase origin main` → `code .` → terminal 1 `npx wrangler dev` → terminal 2 `npm run dev`
- **Cierre:** commit descriptivo → `git push` → Ctrl+C en ambas terminales
- **Debug:** ¿qué vista miro? → último rojo antes del fallo → clic en la fuente → copiar mensaje textual
- **Seguridad:** secrets solo en `.dev.vars` y Cloudflare Secrets; nunca en código, chat, capturas o commits
- **Metodología:** cirugías para parches chicos; archivo completo cuando hay 3+ parches acumulados

---
*Próxima entrada: Día 3 — el río de texto se convierte en apuntes con cerebro.*

---------------------

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
