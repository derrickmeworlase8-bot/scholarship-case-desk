# Scholarship Case Desk

An AI-assisted tool that helps students tell real scholarships from scams. Students paste a listing, email, or message — or upload a screenshot — and get two layers of screening:

1. **Automated Pattern Scan** — instant, runs in the browser, no API calls, works even with no key configured.
2. **AI Case Review** — sends the text (or transcribed screenshot) to Claude, which returns a verdict, a confidence score, specific red flags and positive signs, plain-English reasoning, and a recommended next step.

There's also a **Contact Your School** tab — students enter their school and country and get a verified link (for a starter list of well-known schools) or a safe, pre-built search-engine link scoped to official education domains for any other school — plus a **Field Guide** tab (hallmarks of legitimate scholarships, red flags, how to report a scam) and a **staff dashboard** (`/admin.html`) showing verdict breakdowns and the most common red flags logged across cases, so you can spot a new scam circulating at your school.

Students can also optionally tell it their school name and country when submitting a check — the AI review then also checks whether the offer's claimed sponsor is *consistent* with that school/country (a mismatch is a red flag; leaving it blank is never treated as suspicious). The pattern scanner also recognizes region-specific sensitive-ID requests: SSNs (US), Social Insurance Numbers (Canada), and National Insurance Numbers (UK).

**Zero npm install, zero manual file editing.** The whole thing runs on Node.js's built-in modules — no dependencies to download. The first time you start it, it asks you for your API key right in the terminal and saves it for you.

---

## Who does what

This trips people up, so to be explicit: **you set this up once.** Students never install anything, never touch a terminal, never see an API key — they just open a link (either `http://localhost:3000` on your own computer while it's running, or a real web address once you've deployed it — see §5). Everything below is a one-time job for whoever's running this for the school.

---

## 1. The one thing you actually need first: an AI key (or skip it — free option below)

The app works with **zero key at all** — the Automated Pattern Scan tab runs fully client-side. AI Case Review needs a key from one of two providers. Pick one:

### Option A — Groq (free, no credit card)
1. Go to **console.groq.com** and sign up with email or Google — no card required, ever, for the free tier.
2. Go to **API Keys → Create API Key**, name it, copy it (starts with `gsk_`).
3. That's it. Free tier limits (as of mid-2026): roughly 14,400 requests/day and 30 requests/minute — comfortably enough for a school's worth of scholarship checks.
4. Runs on Llama 3.3 70B by default — a strong open model, not Claude, but well-suited to this kind of structured screening task. Quality is good; if you ever want Claude's reasoning instead, add an Anthropic key later and it'll take priority automatically.
5. **Known limitation**: image/screenshot review isn't enabled by default on the free tier — Groq's vision-capable models change often, so you'd need to set `GROQ_VISION_MODEL` in `.env` to a current one from console.groq.com/docs/models. Text-based checks work fully either way.

### Option B — Anthropic (paid, generally higher quality, supports images out of the box)
1. Go to **console.anthropic.com** (redirects to **platform.claude.com**) and sign up.
2. Go to **Settings → Billing** and add a payment method — required before requests succeed, though new accounts often get a small amount of free starting credit.
3. Go to **Settings → API Keys → Create Key**, copy it immediately (starts with `sk-ant-`, shown once).
4. Set a monthly spending cap on the same page as a backstop. Real-world cost for this app is small — a few dollars for a semester of use, typically.

Don't have either yet? Skip to the next section — you'll be prompted the first time you run the app, and can paste a key in then (or skip and add one later, or never at all).

---

## 2. Run it

1. **Extract the zip.**
2. **Double-click the launcher for your system:**
   - Mac: `start.command`
   - Windows: `start.bat`
   - Linux, or if double-click doesn't work: open a terminal in the folder and run `./start.sh` (or just `node server.js`)
3. The first time, it'll ask you to paste a key right there in the terminal window (either kind — it auto-detects Groq vs Anthropic from the format). Paste it and hit Enter — it's saved automatically, you won't be asked again. (No key yet? Just press Enter to skip; the app still runs fully, and you can add a key later — see below.)
4. Your browser opens automatically to `http://localhost:3000`. That's the app.

That's the entire setup. No `npm install`, no opening `.env` in a text editor, no terminal commands to memorize.

**Only real prerequisite: Node.js itself.** If double-clicking the launcher does nothing, you probably don't have it installed — grab it free at **nodejs.org** (the "LTS" version), install it, then try the launcher again. This is unavoidable for any app that runs its own server; the alternative would be putting your API key directly in browser code, which anyone could then steal from your site's source — not something I'd wire up for you.

**Added your key late, or want to change it, or switch providers?** Open the `.env` file in any text editor, edit the `GROQ_API_KEY=` or `ANTHROPIC_API_KEY=` line, save, and restart the app. If both are filled in, Anthropic is used.

---

## 3. Project structure

```
scholarship-case-desk/
├── server.js            Plain Node http server — no framework, no dependencies
├── db.js                  Case log, stored as JSON in data/case-log.json
├── start.command / .sh / .bat   Double-click launchers for Mac / Linux / Windows
├── package.json
├── .env                   Created automatically on first run — holds your API key
├── .env.example
├── .gitignore
├── Dockerfile             For containerized hosting later
├── render.yaml             Blueprint for a one-click Render deploy later
├── data/                  Case log lives here (auto-created, gitignored)
└── public/
    ├── index.html         The app students use (four tabs)
    ├── admin.html          Staff dashboard
    ├── style.css
    ├── rules.js            Shared scam-pattern rules (used by browser AND server)
    ├── school-directory.js  Verified contacts for well-known schools + safe search-link builder
    └── app.js
```

---

## 4. Staff dashboard (case history)

Every completed AI review is logged to `data/case-log.json` (created automatically): timestamp, mode, a short excerpt (first 400 characters, never a full screenshot), the pattern-scan score, and the AI's verdict/confidence/red flags.

To turn on the dashboard: open `.env`, set `ADMIN_KEY` to a long random string, restart the app, then visit `/admin.html`, enter the key, and click **Load**. Leave `ADMIN_KEY` blank and the dashboard stays disabled — it can't be exposed by accident.

To turn logging off entirely, set `LOG_CASES=false` in `.env`.

**Privacy note:** even a short excerpt could contain a student's name or other details they pasted in. Treat `data/case-log.json` and the admin key like any record with student data in it — don't share the key, don't commit `data/` to a public repo (already gitignored), and clear old entries periodically if you don't need long-term history.

---

## 5. Making it a real website (no local computer required)

Right now, the app only runs while your computer is running it — close the laptop and the link dies. When you're ready to make it a permanent web address students can bookmark, you'll deploy it to a host. This project is already set up for the easiest path:

### Render (recommended — free tier available, no server management)
1. Create a free GitHub account if you don't have one, and push this folder to a new repo (Render's docs walk through this if it's your first time: **render.com/docs/github**).
2. In Render, choose **New → Blueprint** and point it at your repo. Render will read the included `render.yaml` and set the service up automatically.
3. When prompted, paste in `GROQ_API_KEY` (free) or `ANTHROPIC_API_KEY` (paid) — just one is enough — and `ADMIN_KEY` if you want the dashboard. Deploy.
4. You'll get a permanent `https://your-app-name.onrender.com` address — that's what you share with students. Nothing needs to run on your computer anymore.

*(Render's exact steps shift occasionally — if anything on their site doesn't match this, their current docs win. I'm happy to walk through the deploy with you when you're ready.)*

### Docker (any host that runs containers — Fly.io, a VPS, etc.)
```bash
docker build -t scholarship-case-desk .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=your-key-here scholarship-case-desk
```

Either way, once it's deployed, the local "double-click and it opens a browser" workflow is only for your own testing — students would just visit the deployed URL directly.

---

## 6. Cost and abuse protection

- A simple rate limiter caps each device at 20 AI checks per 15 minutes (edit `MAX_REQUESTS_PER_WINDOW` and `WINDOW_MS` near the top of `server.js` to adjust).
- The Automated Pattern Scan tab costs nothing — pure JavaScript, no API call.
- Set a spending cap in the Anthropic console (see §1) as a backstop regardless.

---

## 7. Customizing it

- **Tune the automated scanner**: edit the `RULES` array in `public/rules.js` — shared by the browser and the server, so one edit updates both.
- **Change the AI's instructions**: edit `SYSTEM_PROMPT` in `server.js`.
- **Switch models**: set `GROQ_MODEL` (default `llama-3.3-70b-versatile`) or `CLAUDE_MODEL` (default `claude-sonnet-5`) in `.env` depending on which provider you're using.
- **Branding**: color tokens are at the top of `public/style.css`.
- **Field Guide content**: plain HTML in `public/index.html`, under `<section id="panel-guide">`.
- **School directory**: edit the `SCHOOL_DIRECTORY` array in `public/school-directory.js` — it's a small, hand-verified starter list (a handful of well-known schools in the US, Canada, and UK), not exhaustive by design. Add entries as `{ name, country, aliases, url }`, pointing to a general financial-aid/student-funding *landing page* rather than a specific phone/email (those go stale faster). Any school not in the list automatically gets a safe, pre-built search-engine link instead — no guessed URLs.

---

## 8. Known limitations (be upfront with students about these)

- This is a **screening aid, not proof**. It can't independently verify a sponsor is real — always recommend students confirm with their school's financial aid office.
- It can't browse a URL for them; they need to paste the actual text or a screenshot.
- The case log stores excerpts, not full submissions or images, and has no automatic retention limit yet.
- No batch-check mode (checking several offers in one go) yet — a reasonable next addition if you need it.

---

## License

MIT — do whatever you want with it.
