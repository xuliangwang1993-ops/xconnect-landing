# X-connect Workbench (PWA)

An incremental upgrade of the existing Render web bot (`xuliangwang1993-ops/bot`,
start command `node server-voice.mjs`) into a card-first workbench. It keeps the
existing `/voice` bridge and `/bridge/*` task endpoints, and adds a PWA shell,
gateway chat, Supabase-backed cards and a controlled subtitle inbox.

This is **not** a second backend and not a rewrite of the X-connect app. The
Flutter app remains the native client; this is the browser/PWA workbench and the
visual/interaction blueprint for a later desktop host.

## What is real

| Area | Implementation |
|---|---|
| Accounts | `sk-xc-…` gateway key verified against `GET /v1/me/balance`, or a SubRouter `sk-…` key verified against `/v1/models`. Either is sealed into an `HttpOnly` AES-GCM cookie; the browser never stores the key. |
| SubRouter tiers | Optional four-tier mode (`3X / 2X / 1X / 0.5X`). Keys live only in `SUBROUTER_TIER_KEYS`; the login page shows tier chips and, when `SUBROUTER_TIER_ACCESS` is set, requires that passphrase. Switching tiers swaps the server-side key and keeps the same card namespace. |
| Models | Live `GET /v1/models` from the gateway (57 models at the time of writing). The top-bar abbreviation does not change the real `model_id`. |
| Chat | `POST /api/chat` streams SSE from `POST /v1/chat/completions`; conversations are stored server-side unless Temporary Chat is on. |
| Cards | Supabase `public.work_checkpoints`, one row per card, with stable `c_…` id, source, original text and row version. |
| Organize / review / approve | Three separate endpoints and three separate visual states. Review is an independent LLM call; approval is an explicit user action. |
| Execution | Existing `/bridge/*` claim/complete flow is preserved. For the preview, `AUTO_EXECUTE=1` runs a real server-side LLM worker; set it to `0` to use the PC bridge only. Task rows are persisted under `__task__` so task status survives a Render restart. |
| Subtitle inbox | Scoped encrypted token → `POST /api/inbox` → draft card is saved first, then organized asynchronously. Duplicate batch/index or the same text within 10 minutes is deduped. |
| Voice | Existing `/voice` WebSocket + Doubao realtime session. Short-lived `xcv1` token from `/api/voice-token`; speaker is whitelisted; collapsing the panel does not close the socket. |
| Storage isolation | Every card/conversation/settings row is namespaced by `sha256("xc-workbench-v1|" + gateway_user_id)`. A second gateway user sees zero cards and a direct card-id fetch returns 404 (verified). |
| PWA | Web App Manifest, standalone display, icons, static-only Service Worker, versioned cache, update banner, offline banner, logout cache clearing. |
| Desktop host | `desktop/` contains a minimal Electron 27 wrapper with always-on-top, compact and full modes. It is a plan/seed, not built or verified in this environment. |

## What is deliberately not claimed

- The in-page floating orb is **not** a cross-app / cross-window system overlay.
  iPhone does not allow that for a PWA. A desktop always-on-top window needs the
  native host in `desktop/`.
- The browser cannot read other apps’ audio or subtitles, cannot click “拷贝字幕”
  for the user, and cannot bind Back Tap. The Subtitle settings page gives exact
  manual steps and a real receive endpoint.
- The preview’s built-in LLM executor is a real LLM call, but it is not the PC
  agent/contracts/assignment runtime. With `AUTO_EXECUTE=0` the existing PC bridge
  is the executor. This is labelled in the UI.
- Audio capture/playback was not verified with a real microphone in this
  environment. Token issuance, 401-without-token and WebSocket upgrade were
  verified.
- Install prompts and Service Worker behavior depend on the target browser. The
  embedded test browser has no `navigator.serviceWorker`; Chrome/Safari checks
  are listed below.
- Supabase storage uses a server-side service account (the existing
  `cli@x-connect.local` user) with application-level namespace isolation. It is
  not per-customer Supabase RLS; a production hardening step would move to the
  `/v1/sync/token` JWT path or a dedicated table with per-user RLS.
- Render’s free web service can spin down. The preview is not a production SLA.

## Run locally

```sh
npm install
cp .env.example .env        # fill the values; never commit it
set -a; . ./.env; set +a
npm start                   # http://127.0.0.1:8789
```

Required for the full preview:

```
PORT=8789
SESSION_SECRET=<32+ random chars>
VOICE_TOKEN_SECRET=<32+ random chars>
GATEWAY_BASE_URL=https://api.x-connect.ai
DEMO_GATEWAY_KEY=sk-xc-...          # optional demo button; server-side only
SUPA_URL=https://<project>.supabase.co
SUPA_ANON_KEY=...
SUPA_EMAIL=...
SUPA_PASSWORD=...                   # server-side only
ASSIST_MODEL=claude-haiku-4-5
AUTO_EXECUTE=1                      # 0 -> use the PC bridge only
DEFAULT_MODEL=claude-haiku-4-5
DOUBAO_API_KEY=...
DOUBAO_RESOURCE_ID=volc.speech.dialog
BOT_BRIDGE_PUBLIC_KEY_B64=...       # existing bridge public key
```

Tests:

```sh
npm test
```

`test/workbench.test.mjs` starts a mock gateway and deliberately runs with
Supabase disabled. It asserts that storage failures return `502`, never a fake
“saved” response.

## API surface added

All routes are same-origin and require the sealed session cookie unless noted.

| Route | Purpose |
|---|---|
| `POST /api/session` | `{key}` or `{demo:true}` → sealed cookie |
| `POST /api/logout` | clear cookie |
| `GET /api/me` | account + balance |
| `GET /api/models` | gateway model list |
| `GET /api/bootstrap` | account, models, cards, conversations, settings, voice config |
| `POST /api/chat` | SSE proxy to the gateway; saves conversation unless `temporary` |
| `GET/POST /api/cards` | list / create |
| `GET/PATCH/DELETE /api/cards/:id` | read / edit (same id) / delete |
| `POST /api/cards/:id/organize` | LLM organizer |
| `POST /api/cards/:id/review` | independent LLM reviewer |
| `POST /api/cards/:id/approve` | explicit approval → task queue |
| `POST /api/cards/:id/voice` | append a final ASR line to the selected card |
| `GET/POST/PATCH/DELETE /api/conversations` | conversation management (rename included) |
| `GET/PUT /api/settings` | layout, theme, model, quickbar |
| `POST /api/ingest-token` | mint a 90-day, inbox-scoped token |
| `POST /api/inbox` | `Bearer xcw1…` token; saves a draft then organizes async |
| `POST /api/voice-token` | 120s `xcv1` voice token |
| `GET /api/tasks` | tasks for the signed-in account |
| `GET /healthz` | existing Render health |
| `GET /api/health` | workbench health/build/storage |

## Subtitle shortcut (iOS)

1. Settings → Accessibility → Touch → Back Tap → Double Tap → choose the shortcut.
   The web page cannot bind this for the user.
2. Shortcuts app → new shortcut: `Get Clipboard` → `Get Contents of URL`.
3. URL: `https://<preview>/api/inbox`; method `POST`; header
   `Authorization: Bearer <inbox token>`; JSON body:
   `{"text":"<clipboard>","source":{"kind":"subtitle","app":"External App","batch":"<date>","index":0}}`.
4. In the external app, manually tap “拷贝字幕”, then trigger Back Tap.

The token only creates draft cards. It cannot read cards or approve execution.
The settings page has a “发送测试字幕” button that exercises this exact endpoint.

## PWA verification

- `GET /manifest.webmanifest` → name/scope/start_url/icons/standalone.
- `GET /sw.js` → `const BUILD = '<build>'`; never caches `/api/`, `/voice`,
  `/bridge/`, `/healthz`.
- Chrome/Edge desktop: DevTools → Application → Manifest / Service Workers;
  install icon in the address bar. Safari iOS: Share → Add to Home Screen.
- Update: deploy a new `BUILD_ID` (or a new Render commit), reload; the waiting
  worker shows “已下载新版本”, and “刷新” posts `SKIP_WAITING`.
- Offline: DevTools offline; the shell loads from cache, `/api/*` fails, drafts
  stay in `localStorage`, and the banner says the content was not submitted.
- Logout: cookie cleared, `xcw_*` localStorage removed, all caches deleted.

## Files

```
server-voice.mjs       existing voice/bridge server + workbench router
workbench.mjs          auth, gateway, Supabase, cards, chat, inbox, voice token
public/index.html      PWA shell
public/styles.css      responsive visual system / themes / intro
public/app.js          client state, rendering, chat, voice, settings
public/sw.js           static-only service worker
public/manifest.webmanifest
public/icons/          generated from the supplied crystal X
public/assets/         crystal X + Space Grotesk (OFL)
test/                  voice auth + workbench contract tests
desktop/               minimal Electron always-on-top host (seed)
```

## Asset credits

- Crystal X brand asset supplied by the project.
- Space Grotesk, Copyright 2020 The Space Grotesk Project Authors, SIL Open Font
  License 1.1 (`public/assets/fonts/OFL.txt`).
- No third-party logo or wordmark is used to imply endorsement.
