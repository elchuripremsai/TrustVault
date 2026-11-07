# TrustVault

Secure document sharing with a real, tamper-evident audit trail. Built for the SNOVASYS Fresher Hiring Challenge 2026.

**Live URL:** _add your Render URL here after deploying_
**Repository:** _add your GitHub URL here_

> **Honest status (read this first).** The backend Jest suite was run locally against a PostgreSQL test database:
> all 23 tests passed. This does not replace testing the full application in your deployment environment. Follow the
> setup below and verify the frontend, API, database, and file storage before submitting or sharing a live instance.

## What it does

Companies upload confidential files, share them with chosen people (read or edit), revoke access instantly, and keep an
audit trail where every event is chained to the previous one with a SHA-256 hash.

The rule that matters most: **an unauthorised user can never read, download, edit or delete a document.**

## Features

- Login/logout with bcrypt password hashing, httpOnly cookie session, CSRF token, rate-limited login
- Three roles: **Admin**, **Owner**, **Viewer** (role is re-read from the database on every request)
- Upload with size limit, extension allow-list, magic-byte check, random storage names, private storage
- Per-document permissions (READ / EDIT) with granted-by, dates and revoke history
- Files are streamed through an authenticated endpoint; permission is checked in the database on every request
- Version tracking (upload a new version of a document)
- Append-only audit log (database trigger) with a SHA-256 hash chain and a "Verify chain" button
- Admin dashboard: totals, 7-day activity chart, suspicious-activity flags, filterable audit log, user management
- Owner dashboard: documents, search + category filter, sharing, per-document history
- Viewer dashboard: only documents with an active permission

## Tech stack

React + Vite + Tailwind CSS + React Router + Axios + Lucide + Recharts · Node.js + Express · PostgreSQL + Prisma ·
Jest + Supertest · Render for hosting.

## Architecture

```
Browser (React)  --/api-->  Express API  --Prisma-->  PostgreSQL
                               |
                               +--> private file folder (never served statically)
```

Every document request goes through `requireAuth` (who are you?) and then `requireDocAccess` (what may you do with
THIS document?). `requireDocAccess` reads the owner and the active permission row from the database each time, so
revoking access works on the very next request. No access returns 404 (the document's existence is not revealed);
too little access returns 403. Every refusal is written to the audit log as `DENIED`.

```
server/src/access.js          <- the one place that decides document access
server/src/audit.js           <- hash chain + verification
server/src/storage.js         <- upload validation + private files
server/src/routes/*.js        <- auth, documents, admin
server/prisma/                <- schema, migration, seed
server/tests/security.test.js <- the 14 required security scenarios (+ extras)
client/src/                   <- React app
database/schema.sql           <- same SQL as the Prisma migration
```

## Run it on your computer

You need Node.js 18+ and PostgreSQL.

```bash
# 1. Create two databases (one for the app, one for tests)
createdb trustvault
createdb trustvault_test

# 2. Backend
cd server
cp .env.example .env            # then edit DATABASE_URL and set JWT_SECRET (openssl rand -hex 32)
cp .env.test.example .env.test  # edit DATABASE_URL (database name must contain "test")
npm install
npx prisma generate
npx prisma migrate deploy       # creates all tables, indexes and the audit trigger
npm run seed                    # creates the 3 demo accounts + 1 sample document
npm run dev                     # API on http://localhost:4000

# 3. Frontend (new terminal)
cd client
npm install
npm run dev                     # app on http://localhost:5173
```

Instead of Prisma migrate you can run `psql trustvault -f database/schema.sql`, then `npx prisma generate`.

### Environment variables

| Where | Name | Meaning |
|---|---|---|
| server | `DATABASE_URL` | PostgreSQL connection string |
| server | `JWT_SECRET` | Random string, at least 32 characters |
| server | `CLIENT_ORIGIN` | Frontend URL for CORS, no trailing slash |
| server | `PORT` | Default 4000 |
| server | `STORAGE_DIR` | Private folder for uploaded files (default `server/storage`) |
| server | `MAX_FILE_BYTES` | Upload limit, default 10 MB |
| server | `SEED_SAMPLE` | Set to `false` to seed users only |
| client | `VITE_API_URL` | Full API URL for production builds (leave empty if you proxy `/api`) |

## Demo accounts (demo only)

Password for all three: `TrustVault#Demo26`

| Role | Email |
|---|---|
| Admin | admin@trustvault.demo |
| Owner | owner@trustvault.demo |
| Viewer | viewer@trustvault.demo |

Never use these on a real system. Create real users from the Admin > Users page and deactivate the demo ones.

## Tests

```bash
cd server
npm test
```

Needs the `trustvault_test` database with the migration applied
(`DATABASE_URL=...trustvault_test npx prisma migrate deploy`). The test setup refuses to run against any database whose
name does not contain "test", because every test run wipes all tables.

The tests cover the 14 required scenarios plus CSRF, failed login auditing and admin endpoint protection.

**Prove the tests are real:** temporarily comment out the permission check in `requireDocAccess`
(`server/src/access.js`), run `npm test`, and watch the unauthorised-access and revocation tests fail. Put the check back.
Do this yourself before claiming it in your submission.

## Deploying on Render

The repository includes a Render Blueprint at [`render.yaml`](./render.yaml). In Render, choose **New → Blueprint** and select the repository. Review the services and plans before applying; the API persistent disk and database require paid plans. The static site calls the API directly, so the API's `CLIENT_ORIGIN` must match the frontend URL. If Render assigns a different URL, update `CLIENT_ORIGIN` in the API service and `VITE_API_URL` in the static site build environment.

1. **Database:** New > PostgreSQL. Copy the *Internal* database URL.
2. **API:** New > Web Service from your GitHub repo.
   - Root directory `server`, build command `npm install && npm run build`, start command `npm start`
   - Env: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN` (your frontend URL)
   - **Files:** Render's normal disk is wiped on every deploy and restart. Add a persistent disk (paid plan), mount it at
     `/var/data`, and set `STORAGE_DIR=/var/data/storage`. On a free plan, uploaded files will disappear (accepted limitation).
3. **Frontend:** New > Static Site from the same repo.
   - Root directory `client`, build command `npm install && npm run build`, publish directory `dist`
   - Redirects/Rewrites: add `/*` -> `/index.html` (Rewrite), so page refreshes work.
   - Recommended: also add a Rewrite from `/api/*` to `https://YOUR-API.onrender.com/api/*` and leave `VITE_API_URL` empty.
     The browser then talks to one site only, which avoids third-party-cookie blocking (Safari blocks cross-site cookies).
   - Alternative: set `VITE_API_URL=https://YOUR-API.onrender.com/api` (works in browsers that allow cross-site cookies).
4. **Create demo users:** from your computer run
   `cd server && DATABASE_URL="<Render EXTERNAL database URL>" SEED_SAMPLE=false npm run seed`
   (`SEED_SAMPLE=false` because the sample file would be saved on your computer, not on the server).
5. Check the live site: log in as each role, upload, share, revoke, and check the audit log.

Neither deployment path was tested while generating this project. Expect to adjust.

## More documents

- `API_DOCUMENTATION.md` - every endpoint
- `THREATS.md` - threat model, mitigations, tests and accepted risks
- `PROMPTS.md` - AI usage log (**you must fill it with your real entries**)
