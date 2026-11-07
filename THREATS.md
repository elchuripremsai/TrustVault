# TrustVault threat model

Each threat lists: how it works, how TrustVault defends, how it is tested, and accepted risks.
"Tests" refer to `server/tests/security.test.js`. **Run the tests yourself and record the real results; this document does
not claim they pass.**

## 1. IDOR (insecure direct object reference)
- **Attack:** change the document ID in a URL (`/documents/123` to `/documents/124`) to read someone else's file.
- **Defence:** IDs are random UUIDs, and every `/documents/:id` route runs `requireDocAccess`, which checks owner/permission in the database. A document you cannot access returns 404, the same as one that does not exist. Malformed IDs are rejected before the query.
- **Tests:** 3, 4, 9.
- **Accepted:** the 404-for-everything rule hides existence, but response timing could still differ slightly.

## 2. Broken access control
- **Attack:** call an endpoint the UI hides (delete, share, admin pages).
- **Defence:** all authorisation is server-side. `requireRole` guards role routes, `requireDocAccess('OWNER' | 'EDIT' | 'READ')` guards document routes. The frontend's role is never trusted; the role is read from the database on each request.
- **Tests:** 5, 6, 10, 11, 14 and "non-admins cannot use admin endpoints".
- **Accepted:** a new route added later without a guard would be open. Review every new route.

## 3. Privilege escalation
- **Attack:** a viewer grants themselves EDIT, or edits their own role.
- **Defence:** only the document owner can grant; only admins can change roles, and admins cannot change their own role. Roles come from the database, not the token.
- **Tests:** 11, 5b.
- **Accepted:** an admin can create other admins (by design). Ownership is by `ownerId`; if an owner is later demoted to VIEWER they still own existing documents.

## 4. Revoked access abuse
- **Attack:** keep reading after access was removed, using a cached link or open session.
- **Defence:** no signed or public file URLs exist. Each download re-checks the database, so revocation applies on the next request. Previews are fetched as blobs, not cached links (`Cache-Control: no-store`).
- **Tests:** 7, 8.
- **Accepted:** a user can still keep a file they already downloaded; software cannot un-download it.

## 5. Brute-force login
- **Attack:** guess passwords.
- **Defence:** bcrypt (cost 12), login rate limit (10 failures per 15 minutes per IP), identical error message for wrong email and wrong password, a dummy bcrypt comparison for unknown emails to even out timing, every failure audited and flagged on the admin dashboard.
- **Tests:** "wrong password is rejected and audited" (the rate limiter is switched off in tests, so it is **not** automatically tested).
- **Accepted:** no account lockout and no MFA. Behind a proxy, rate limits depend on `trust proxy` reading the right IP.

## 6. SQL injection
- **Attack:** put SQL in a form field or query string.
- **Defence:** all queries go through Prisma (parameterised). The only raw SQL is a fixed advisory-lock call. Inputs are validated with Zod.
- **Tests:** no dedicated test. Honest gap; add one that sends `' OR 1=1 --` in search and login.
- **Accepted:** none known, but unreviewed by a security professional.

## 7. File upload attacks
- **Attack:** upload an executable, a script, or a file disguised with a fake extension.
- **Defence:** extension allow-list, blocked-extension list (checked on every dot-segment, so `a.pdf.exe` fails), magic-byte check, 10 MB limit, empty files refused, random storage names, files stored outside any public folder with mode 0600, downloaded as attachments with `nosniff` (Helmet).
- **Tests:** 13, 13b, 13c.
- **Accepted:** DOCX/XLSX are ZIP files and are accepted by their ZIP signature only; there is **no malware scanning** and no macro inspection (macro formats are blocked by extension). Text files are accepted if they are valid UTF-8.

## 8. Path traversal
- **Attack:** use `../../etc/passwd` as a filename or ID to reach other files.
- **Defence:** user filenames are never used on disk. Storage names are random UUIDs and `pathFor()` rejects anything not matching the exact pattern. Document IDs must be UUID-shaped.
- **Tests:** 9 (traversal-style ID returns 404). Upload name cleaning was checked with a throwaway script, not an automated test.
- **Accepted:** none known.

## 9. Session theft
- **Attack:** steal the login cookie (XSS, network sniffing).
- **Defence:** httpOnly cookie (JavaScript cannot read it), `secure` in production, 2-hour expiry, Helmet headers including a restrictive CSP, React escapes output. The CSRF token lives in `sessionStorage` (it is useless without the cookie).
- **Tests:** none automated.
- **Accepted:** no server-side session list, so a stolen JWT works until it expires or the account is deactivated (deactivation is checked on every request). No "log out everywhere".

## 10. CSRF
- **Attack:** a malicious site makes your browser send a state-changing request with your cookie.
- **Defence:** every non-GET request must carry `x-csrf-token` matching a value inside the signed JWT; rejected attempts are audited. In production the cookie is `SameSite=None` (needed when frontend and API are on different domains), so the token is the main protection.
- **Tests:** "state-changing requests without the CSRF token are rejected".
- **Accepted:** the login request itself has no CSRF token (login CSRF).

## 11. Audit log tampering
- **Attack:** edit or delete audit rows to hide actions.
- **Defence:** no API route can change audit data; a database trigger rejects `UPDATE` and `DELETE`; each event stores `previousHash` and `currentHash`, and "Verify chain" recomputes everything. Audit writes happen inside the same transaction as the action.
- **Tests:** 12a, 12b, 12c.
- **Accepted:** someone with database owner rights can drop the trigger, and if they rewrite the **entire** chain consistently, or delete the newest rows, the chain still verifies. Mitigation (not built): periodically copy the latest hash somewhere outside the database.

## 12. Race conditions
- **Attack:** send two requests at once (double grant, grant and revoke at the same moment, two audit writes sharing a previous hash).
- **Defence:** grants and revokes run in transactions; a partial unique index allows only one active permission per user per document; audit writes take a PostgreSQL advisory lock so the chain stays linear.
- **Tests:** none for concurrency. Honest gap.
- **Accepted:** a download that started just before a revoke will finish streaming.

## 13. Insecure direct file URLs
- **Attack:** guess or reuse a link such as `/uploads/report.pdf`.
- **Defence:** there is no static file route. Files exist only in a private folder under random names and are streamed through `GET /documents/:id/download` after a database permission check. Storage names are never returned by any API.
- **Tests:** 4 and 14 (no content or storage names in refused or admin responses).
- **Accepted:** on Render's free plan files are not persistent; see README.

## Other limits to be honest about
- No email verification, password reset, or MFA.
- No encryption of files at rest beyond what the hosting disk provides.
- The Admin "Documents" list intentionally shows metadata only.
- Not independently penetration-tested.
