# Local setup and optional integrations

Dependencies, local MongoDB, auth and Finnhub are installed/configured in this checkout. Run `node scripts/check-env.mjs` to check variable names and presence without displaying values. Run `npm run dev` and open http://localhost:3000. The dashboard does not place trades.

AI/email remain unconfigured by owner choice (28Sep2026). No account purchase or new provider key is required for login, watchlist, charts and saved alert definitions. The watchlist clearly displays that notifications are disabled.

When providers are selected, add private values locally to `.env`; never commit them or paste them into chat:

- AI: select existing `AI_PROVIDER=gemini|minimax|siray`, then its matching key. Optional model overrides: `GEMINI_MODEL`, `MINIMAX_MODEL`. No keys selected or imported automatically.
- Mail: existing Nodemailer Gmail adapter uses `NODEMAILER_EMAIL` and `NODEMAILER_PASSWORD` (app password). Another SMTP provider requires changing transporter settings. No real mail was sent during verification.
- Jobs: configure `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` and mail first. `OPENSTOCK_ENABLE_EMAIL_JOBS=false` is the safe default. Enable explicitly only when ready to send welcome, weekly summary, price alert and re-engagement emails to actual dashboard users. Weekly summaries also require an AI key. Schedules use UTC.
- Kit is optional upstream tooling, no longer required for these dashboard jobs. No global Kit broadcast is used for individual alerts or inactive-user messages.

Price alert delivery marks an alert triggered only after SMTP acceptance. Inngest durable per-alert steps retry failed DB writes without resending a successful send in the same run. Individual failures do not block other users. SMTP acceptance is not proof of inbox delivery. Ambiguous SMTP failure or process failure before a durable send checkpoint can produce duplicates; exactly-once delivery requires a provider with idempotency support. No scheduler or external delivery was enabled in this setup pass.

Validation: `npm test`, `npm run lint`, `npm run build` (checks types and lint), and isolated real Chrome browser paths. Provider integration tests remain skipped until an explicitly selected key is supplied. Existing lint warnings remain; they do not block build. Existing package changes from original installation were preserved.
