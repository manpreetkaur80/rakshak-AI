# 🛡️ RakshakAI — Intelligent Emergency Response & Resource Coordination Platform

> One place where emergency reports from many sources are understood, de-duplicated, prioritised and turned into a coordinated response — with live tracking of every unit on the map.

Built for **Bit N Builds '26 — Gujarat Round**, organised by **GDG DDU** (problem statement **PS-9**). Full-stack: **React + Vite** client, **Node.js + Express + MongoDB** API, **Socket.IO** for realtime.

**Live demo:** https://rakshak-ai-flame.vercel.app  ·  **API:** https://rakshak-ai-8d12.onrender.com/api/v1/health
   ![Command dashboard](docs/screenshots/dashboard.png)
   ![Live map with moving units](docs/screenshots/client.png)
   ![Mobile view](docs/screenshots/login.png)



---

## The problem

During an emergency the same event is reported many times, through many channels (phone calls, apps, sensors, hospitals, government alerts, field teams). Control rooms drown in duplicates, can't tell what is urgent or genuine, and lose time deciding which unit to send where.

## What RakshakAI does

| | |
|---|---|
| **Multi-source ingestion** | Web form, emergency calls, IoT sensors, hospital feeds, government alerts and field teams all enter through one pipeline (`/api/v1/ingest/<source>`, API-key protected, idempotent, sensor-threshold aware). |
| **AI classification** | Type (fire, flood, medical, accident, industrial, structural), severity and priority P1–P4. Uses **Google Gemini** when a key is set; otherwise a built-in weighted-keyword rule engine, so it always works. |
| **Duplicate detection** | Scores new reports against open incidents by distance, time and wording (synonym-aware). Operators merge, reject, or **undo** a merge. A call + an app report + a sensor about one fire become *one* incident ("3 reports from 3 sources"). |
| **Fake-report screening** | Every report gets a credibility score with reasons (prank wording, gibberish, flooding from one account…). Suspicious P1 reports raise a *warning*, not an alarm, and are never auto-dispatched. Operators can dismiss a false report. |
| **Smart dispatch** | Recommends a response *package* (lead unit + ambulance + police …) with distance, ETA and reasons. Units are claimed atomically — a busy unit can never be double-booked. One-click **auto-dispatch** (optionally fully automatic for P1) with a **recall** override. |
| **Live map** | Units drive to the incident along real roads (OSRM, straight-line fallback), position updated every second, and return to base afterwards. |
| **Escalation** | Unassigned P1/P2 incidents escalate warning → critical; assigned-but-not-arrived units raise "responder delayed" alerts. Thresholds are editable by admins. |
| **Notifications** | In-app bell (live), e-mail (SendGrid) and SMS (Twilio), routed by role, with retries and a delivery log. Falls back to a logged "console" provider without API keys. |
| **Analytics** | Response times, incidents by type/severity, hotspots, resource utilisation, **shortage forecast**, date-range filters and **CSV export**. |
| **Post-incident PDF report** | Overview, response times, units, sources, full timeline and resolution. |
| **Public tracking** | Citizens track an incident by ID and see status only — never internal details. |
| **Responsive** | Works on phones, tablets and desktops. |

### Roles

| Role | Can do |
|---|---|
| **Citizen** | Report an emergency (with photo & map location), track it |
| **Operator** | Command dashboard: review, merge, dispatch, recall, resolve, export |
| **Responder** | See assigned incidents, accept, go en route / on scene, resolve |
| **Hospital** | Receive casualty heads-ups, view resources |
| **Admin** | Everything above + users, settings, data sources, demo tools |

## How a report flows

```
 web form / call / sensor / hospital / govt / field
                    │
                    ▼
        normalise  →  classify (Gemini | rules)  →  credibility score
                    │
                    ▼
          duplicate check ──► operator: merge / reject / undo
                    │
                    ▼
     recommend units  ──►  dispatch (manual · one-click · automatic)  ──► recall
                    │
                    ▼
   responder: accept → en route → on scene → resolve (units freed)
                    │
        alerts · notifications · live map · analytics · PDF report
```

## Tech stack

- **Client:** React 19, Vite, React Router, Leaflet (react-leaflet), Recharts, Axios, Socket.IO client
- **Server:** Node 20+, Express 4, Mongoose 8 (MongoDB, 2dsphere geo queries), Socket.IO 4, JWT + bcrypt, node-cron, Multer, Helmet, express-rate-limit, PDFKit
- **Optional services:** Google Gemini, OSRM routing, SendGrid, Twilio
- **Tests:** Node's built-in test runner + Supertest (72 tests: unit + integration)

## Project structure

```
client/                React app (Vite)
  src/pages/           Dashboard, Incidents, IncidentDetails, Resources, Alerts, Analytics, Admin, Responder, Report/Track…
  src/components/      Layout, sidebar, live map, notification bell
server/
  server.js            HTTP + Socket.IO bootstrap, cron jobs
  src/models/          Incident, Resource, Alert, User, SourceReport, Notification, AnalyticsEvent…
  src/services/        ai, duplicate, credibility, dispatch, resource, movement, escalation,
                       notification, ingest, analytics, report, config
  src/controllers/ routes/ middleware/ sockets/ seed/
  test/                unit + integration tests
docs/                  design notes (AI, API, database, user flows)
```

## Run it locally

Requires **Node 20+** and a **MongoDB** (local or Atlas).

```bash
# 1. Backend
cd server
cp .env.example .env     # set MONGODB_URI and a JWT_SECRET (16+ chars)
npm install
npm run seed             # demo users, units and incidents
npm run dev              # http://localhost:5000

# 2. Client (new terminal)
cd client
npm install
npm run dev              # http://localhost:5173
```

Demo logins created by the seed:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ps9demo.com` | `admin123` |
| Operator | `operator@ps9demo.com` | `operator123` |
| Responder | `responder1@ps9demo.com` | `responder123` |
| Hospital | `hospital@ps9demo.com` | `hospital123` |
| Citizen | `citizen@ps9demo.com` | `citizen123` |

> ⚠️ These are demo credentials. Change them (or remove the quick-login buttons) before exposing a deployment publicly.

**Try it:** log in as admin → **Admin → Market Fire Demo Simulation** (plays a full incident in ~90 s), or **Data Sources → Multi-source fire scenario**. To see units move: dispatch, then as a responder click **Accept → En Route**.

## Configuration (`server/.env`)

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string (**required**) |
| `JWT_SECRET` | Long random string (**required**) |
| `CLIENT_URL` | Frontend origin for CORS, no trailing slash |
| `INGEST_API_KEY` | Key for machine feeds (`x-api-key`) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional AI classification (rules are used otherwise) |
| `SENDGRID_API_KEY`, `NOTIFY_FROM_EMAIL` | Optional e-mail delivery |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Optional SMS delivery |
| `OSRM_URL`, `MOVEMENT_SPEED_KMH` | Road routing / unit speed (`OSRM_URL=off` disables routing) |
| `AUTO_DISPATCH=true` | Turn automatic dispatch on by default (also editable in Admin) |
| `ESCALATION_P1_*`, `ESCALATION_P2_*` | Default escalation minutes |

Client (`client/.env`, only when the API is on another domain): `VITE_API_URL=https://your-backend`.

## API at a glance

All routes are under `/api/v1`. Auth is a Bearer JWT; roles are enforced server-side.

```
POST   /auth/register | /auth/login            GET /auth/me
POST   /incidents                              create a report (public)
GET    /incidents  /incidents/:id              list / detail (public gets a safe view)
POST   /incidents/:id/{merge,unmerge,reject-duplicate,classify,summary}
POST   /incidents/:id/{assign,auto-dispatch,recall,dismiss,escalate,resolve,status,accept}
GET    /incidents/:id/report                   PDF post-incident report
GET    /resources   /resources/recommendations/:incidentId
POST   /ingest/{sensor|call|hospital|govt|field}      machine feeds (x-api-key)
GET    /notifications  PATCH /notifications/preferences  GET /notifications/log
GET    /analytics/{overview,types,severity,response-time,hotspots,shortages,export}
GET/PUT /admin/config      GET/POST/PATCH /admin/users
```

Realtime (Socket.IO): `incident:*`, `alert:created`, `resource:location`, `resource:route`, `notification:new`.
Staff sockets get full events; public sockets only receive `{ publicId, status, updatedAt }`.

## Security

Passwords hashed with bcrypt · JWT auth with role checks on every protected route · public tracking exposes status only · input validation and rate limiting · Helmet headers · regex-injection-safe search · CSV export is formula-injection safe · caller phone numbers masked · image uploads restricted to PNG/JPG/WebP · API-key comparison is timing-safe.

## Tests

```bash
cd server
npm run test:unit   # no database needed
npm test            # unit + integration (needs MongoDB; uses MONGODB_URI_TEST,
                    # default mongodb://127.0.0.1:27017/ps9_integration_test — this DB is DROPPED by the tests)
```
On Windows run the tests from Git Bash or WSL (the script sets `NODE_ENV` inline).

## Deployment

Example free setup: **MongoDB Atlas** (database) + **Render** (backend) + **Vercel** (frontend).

1. **Atlas:** create a free cluster and a database user; allow your backend's IP (or `0.0.0.0/0`) under Network Access.
2. **Backend (Render → Web Service):** root directory `server`, build `npm install`, start `npm start`. Set `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `INGEST_API_KEY`, and `CLIENT_URL` (your Vercel URL, **no trailing slash**).
3. **Frontend (Vercel):** root directory `client`, env `VITE_API_URL=https://<your-backend>` (no trailing slash); redeploy after changing it.
4. **Load demo data once:** run `npm run seed` against the Atlas URI, or log in as admin → **Admin → Seed Resources**.

Notes: Render's free tier sleeps when idle and has a temporary disk (uploaded photos are lost on redeploy). Never commit `.env`; rotate any credential that was ever shared.

## Roadmap

Hospital bed capacity · voice and multilingual reporting · image analysis · citizen/responder chat · drone dispatch · offline-first PWA · cost estimation · SMS/WhatsApp inbound reports.

## Docs

Design notes live in [`docs/`](docs): AI design, API plan, database design, user flows and project overview.

---

Built at **Bit N Builds '26 (Gujarat Round)**, organised by GDG DDU. Contributions and feedback are welcome.