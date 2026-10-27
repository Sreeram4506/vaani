# Vaanii voice campaign dashboard

## Run locally

This is a Vite application and must be served over HTTP. Do not open `index.html` directly with a `file://` URL.

```bash
npm install
cp .env.example .env
npm run dev:full
```

Open the exact `http://localhost:<port>` URL printed by Vite (normally `http://localhost:5173`).

`dev:full` starts both the Vite dashboard and the local API. With `TEST_MODE=true`, no real calls are made. The API supports campaign start/pause, health checks, webhook-callback simulation, and a provider webhook intake endpoint.

## Deploying to Render

Create a **Web Service** using this repository (or deploy via the included `render.yaml` Blueprint).
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`

Render supplies the `PORT` environment variable dynamically; do not hard-code `PORT=8787` in Render's Environment Variables tab. The production server automatically binds to `0.0.0.0:$PORT` and serves both the compiled Vite dashboard and the API backend. Add the remaining variables from `.env.example` in the Render dashboard, and set `EXOTEL_STATUS_CALLBACK_URL` to your Render public URL followed by `/api/webhooks/exotel`.

## Exotel setup

The project is configured for Exotel Programmable Voice. Start in `TEST_MODE=true`; the **Simulate test call** action creates a local call record and never dials a number. For a live Exotel voice-AI test, set `TEST_MODE=false` only after filling the Exotel fields in `.env`: Account SID, API key, API token, approved ExoPhone caller ID, and a public `wss://` bidirectional bot stream. The optional `EXOTEL_STATUS_CALLBACK_URL` should point to the public `/api/webhooks/exotel` route.

Exotel credentials belong only in `.env`, which must stay out of source control.

## Checks

```bash
npm run build
npm run lint
```
