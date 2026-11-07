# AI usage log

**This file is a template. Fill it with your own real entries as you work.** Do not invent mistakes, tests or commit links;
the challenge asks for honesty. You need at least five dated entries, and at least two about authorisation, access control
or audit security.

How to collect an honest entry while you work:
1. After you ask an AI tool for something, run the code.
2. Write down what actually went wrong or was missing (a failing test, a bug you noticed in review, an insecure shortcut).
3. Fix it, commit, and paste the real commit link.

If the AI got something right and you changed nothing, say that. "No mistake found" is a valid, honest answer.

## Entry template (copy once per entry)

- **Date:** YYYY-MM-DD
- **AI tool used:**
- **Prompt (or summary):**
- **AI-generated output (short summary or excerpt):**
- **Specific mistake or limitation I found:**
- **My correction:**
- **Commit link:** https://github.com/<you>/<repo>/commit/<real-hash>
- **Topic:** (authorisation / access control / audit security / other)

---

## Entry 1
_(fill in)_

## Entry 2
_(fill in)_

## Entry 3
_(fill in)_

## Entry 4
_(fill in)_

## Entry 5
_(fill in)_

---

## Things worth reviewing in the generated code (starting points, not claimed mistakes)

These are places where AI-written security code commonly goes wrong. Check each one yourself; if you find a real problem, that
is a genuine entry.

- Does every document route use `requireDocAccess`, and does the 404 vs 403 behaviour match the tests?
- Are audit writes inside the same transaction as the change they describe?
- Does the hash input include every field, and is key order stable (`stable()` in `audit.js`)?
- Can a file be stored under a user-chosen name or path anywhere?
- Do cookies get the right `secure` / `sameSite` settings when frontend and API are on different domains?
