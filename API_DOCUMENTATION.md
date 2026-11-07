# TrustVault API

Base path: `/api`. Authentication is an httpOnly cookie set by `POST /auth/login`.
Every `POST`, `PUT`, `PATCH` and `DELETE` must also send the header `x-csrf-token` with the `csrf` value returned by login (or `GET /auth/me`).
Errors look like `{ "error": "message" }`.

## Auth

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/auth/login` | anyone | Body `{email, password}`. 10 failed attempts per 15 min per IP. Returns `{user, csrf}` |
| GET | `/auth/me` | logged in | Returns `{user, csrf}` |
| POST | `/auth/logout` | logged in | Clears the cookie |

## Documents

| Method | Path | Needs | Notes |
|---|---|---|---|
| GET | `/documents?q=&category=` | logged in | My documents + documents with an active permission for me |
| GET | `/documents/activity` | logged in | Last 10 audit events on documents I own |
| POST | `/documents` | OWNER role | multipart: `title`, `category`, `description`, `file` |
| GET | `/documents/:id` | READ+ | Details and version list. Logged as VIEW |
| GET | `/documents/:id/download?version=&preview=1` | READ+ | Streams the file. Logged as DOWNLOAD (or VIEW with `preview=1`) |
| PUT | `/documents/:id` | EDIT+ | Body: any of `title`, `description`, `category` |
| POST | `/documents/:id/versions` | EDIT+ | multipart `file`. Creates the next version |
| DELETE | `/documents/:id` | document owner | Deletes the document and its files |

## Permissions (document owner only)

| Method | Path | Notes |
|---|---|---|
| GET | `/documents/:id/permissions` | Active and revoked permissions |
| POST | `/documents/:id/permissions` | Body `{email, type: "READ"|"EDIT"}` |
| DELETE | `/documents/:id/permissions/:permId` | Revokes. Effective on the next request |
| GET | `/documents/:id/audit` | Audit history of this document |

## Admin (ADMIN role)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats` | Totals, 7-day chart, recent uploads and events, suspicious activity |
| GET | `/admin/users` | List users |
| POST | `/admin/users` | Body `{email, name, password (10+ chars), role}` |
| PATCH | `/admin/users/:id` | Body `{role?, isActive?}`. Cannot change yourself |
| GET | `/admin/documents` | Metadata only (no contents, no storage paths) |
| GET | `/admin/audit?userId=&documentId=&action=&result=&from=&to=&page=&limit=` | Filterable audit log |
| GET | `/admin/audit/verify` | Recomputes the hash chain. `{valid, checked, brokenAtId?}` |

There is intentionally no endpoint that updates or deletes audit records.

## Status codes

`401` not logged in · `403` logged in but not allowed (or bad CSRF) · `404` no access / not found (existence not revealed) ·
`400` invalid input or rejected file · `413` file too large · `409` duplicate.
