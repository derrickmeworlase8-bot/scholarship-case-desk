const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const { runScan } = require('./public/rules.js');
const caseLog = require('./db.js');

const ROOT = __dirname;
const PUBLIC_DIR = path.resolve(ROOT, 'public');
const ENV_PATH = path.join(ROOT, '.env');
const ENV_EXAMPLE_PATH = path.join(ROOT, '.env.example');

// ---------------------------------------------------------------------------
// Tiny built-in .env loader — no dotenv package required.
// ---------------------------------------------------------------------------
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Used everywhere a "do we have a real key?" check happens, so the
// .env.example placeholder is never mistaken for a configured key.
function hasRealKey(varName) {
  const key = process.env[varName];
  return Boolean(key) && !key.startsWith('your-') && !key.startsWith('choose-');
}

// Prefer Anthropic (higher quality) if both are set; fall back to the free
// Groq tier; null means no AI provider is configured at all yet.
function getProvider() {
  if (hasRealKey('ANTHROPIC_API_KEY')) return 'anthropic';
  if (hasRealKey('GROQ_API_KEY')) return 'groq';
  return null;
}

function ensureEnvFileExists() {
  if (!fs.existsSync(ENV_PATH) && fs.existsSync(ENV_EXAMPLE_PATH)) {
    fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
  }
}

function saveKeyToEnvFile(varName, key) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const re = new RegExp(`^${varName}=.*$`, 'm');
  if (re.test(content)) {
    content = content.replace(re, `${varName}=${key}`);
  } else {
    content += `${content.endsWith('\n') || !content ? '' : '\n'}${varName}=${key}\n`;
  }
  fs.writeFileSync(ENV_PATH, content, 'utf8');
}

// ---------------------------------------------------------------------------
// First-run wizard: if there's no key yet and this is an interactive
// terminal, ask for one once and save it — auto-detecting Groq (free, keys
// start with gsk_) vs Anthropic (paid, keys start with sk-ant-). Non-
// interactive runs (Docker, hosting platforms) just warn and continue.
// ---------------------------------------------------------------------------
function promptForApiKeyIfMissing() {
  return new Promise((resolve) => {
    if (getProvider()) {
      resolve();
      return;
    }
    if (!process.stdin.isTTY) {
      console.warn('\n[warning] No AI provider key set, and this isn\'t an interactive terminal.');
      console.warn('Set GROQ_API_KEY (free) or ANTHROPIC_API_KEY (paid) as an environment variable and restart.');
      console.warn('The automated pattern scan will still work without either — only AI Case Review needs one.\n');
      resolve();
      return;
    }
    console.log('\n──────────────────────────────────────────────────────────');
    console.log('No AI provider key found yet.');
    console.log('Free, no card required: console.groq.com → API Keys → Create Key (starts with gsk_)');
    console.log('Higher-quality, paid:   console.anthropic.com → Settings → API Keys (starts with sk-ant-)');
    console.log('(Automated Pattern Scan works fine without either — only AI Case Review needs one.)');
    console.log('──────────────────────────────────────────────────────────\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Paste a key now (or press Enter to skip for now): ', (answer) => {
      const key = answer.trim();
      if (!key) {
        rl.close();
        console.log('Skipped. Add GROQ_API_KEY or ANTHROPIC_API_KEY to .env any time and restart.\n');
        resolve();
        return;
      }
      if (key.startsWith('sk-ant-')) {
        rl.close();
        saveKeyToEnvFile('ANTHROPIC_API_KEY', key);
        process.env.ANTHROPIC_API_KEY = key;
        console.log('Saved as an Anthropic key — you won\'t be asked again on this computer.\n');
        resolve();
      } else if (key.startsWith('gsk_')) {
        rl.close();
        saveKeyToEnvFile('GROQ_API_KEY', key);
        process.env.GROQ_API_KEY = key;
        console.log('Saved as a free Groq key — you won\'t be asked again on this computer.\n');
        resolve();
      } else {
        rl.question('Couldn\'t tell from the format — is that a (g)roq or (a)nthropic key? ', (which) => {
          rl.close();
          if (which.trim().toLowerCase().startsWith('g')) {
            saveKeyToEnvFile('GROQ_API_KEY', key);
            process.env.GROQ_API_KEY = key;
            console.log('Saved as a Groq key.\n');
          } else {
            saveKeyToEnvFile('ANTHROPIC_API_KEY', key);
            process.env.ANTHROPIC_API_KEY = key;
            console.log('Saved as an Anthropic key.\n');
          }
          resolve();
        });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// AI review — two interchangeable providers behind one interface.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a scholarship-fraud screening assistant helping a student decide whether a scholarship offer is trustworthy. You will be given text describing a scholarship listing, email, or message (it may have been transcribed from an image).

Respond with ONLY a raw JSON object, no markdown fences, no preamble, no commentary outside the object, in exactly this shape:
{
  "verdict": "likely legitimate" | "uncertain" | "likely scam",
  "confidence": <integer 0-100>,
  "redFlags": [ up to 6 short phrases, empty array if none ],
  "positiveSigns": [ up to 4 short phrases, empty array if none ],
  "reasoning": "2-3 plain-English sentences explaining the verdict",
  "recommendedAction": "1 sentence describing the single best next step for the student",
  "transcribed": "if this text was read from an image, the transcribed text; otherwise omit this field"
}

Base the assessment on known scholarship-scam patterns: any upfront payment, requests for bank/SSN/wire details, guaranteed-win claims, artificial urgency, unsolicited "you've been selected" contact, vague or unverifiable sponsors, and no real application process. Weigh these against signs of legitimacy: a real application process, a named and verifiable sponsor, institutional contact channels, and realistic selection criteria. If the message includes a line noting student-provided context (a school and/or country), use it only to check consistency between the offer's claims and that context — a claimed affiliation that doesn't fit is a red flag, but missing context is never itself suspicious. Do not falsely flag ordinary legitimate scholarships that simply have standard application steps. If the text is too short or unclear to assess, say so plainly in "reasoning" and use "uncertain".`;

function extractJSON(raw) {
  const cleaned = (raw || '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

async function callAnthropic(contentBlocks) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contentBlocks }]
    })
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error((data.error && data.error.message) || 'The Anthropic API returned an error.');
    err.statusCode = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
    throw err;
  }
  const textParts = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text);
  try {
    return extractJSON(textParts.join('\n'));
  } catch (e) {
    const err = new Error('The AI review returned an unreadable response. Please try again.');
    err.statusCode = 502;
    throw err;
  }
}

// Groq's API is OpenAI-compatible — same request shape, different host/auth.
async function callGroq(messages, needsVision) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = needsVision ? process.env.GROQ_VISION_MODEL : (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');
  if (needsVision && !model) {
    const err = new Error("Image screening isn't set up on the free provider for this deployment yet. Paste the text instead, or ask whoever runs this site to set GROQ_VISION_MODEL (or add an Anthropic key) to enable image review.");
    err.statusCode = 501;
    throw err;
  }
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, max_tokens: 1000, messages })
  });
  const data = await resp.json();
  if (!resp.ok) {
    const err = new Error((data.error && data.error.message) || 'The Groq API returned an error.');
    err.statusCode = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
    throw err;
  }
  const raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  try {
    return extractJSON(raw);
  } catch (e) {
    const err = new Error('The AI review returned an unreadable response. Please try again.');
    err.statusCode = 502;
    throw err;
  }
}

function buildContextNote(school, country) {
  const countryNames = { us: 'United States', ca: 'Canada', uk: 'United Kingdom', other: 'another country' };
  const parts = [];
  if (school) parts.push(`school: ${school}`);
  if (country && countryNames[country]) parts.push(`country: ${countryNames[country]}`);
  if (!parts.length) return '';
  return `Student-provided context (${parts.join(', ')}) — use this to check whether the offer's claimed sponsor and details are consistent with this school/country; a mismatch is itself a red flag, but the absence of context is not.\n\n`;
}

async function runAIReview(mode, text, image, school, country) {
  const provider = getProvider();
  if (!provider) {
    return {
      aiUnavailable: true,
      message: "AI Case Review isn't turned on for this site yet — the person running it hasn't added a Groq (free) or Anthropic key. The Automated Pattern Scan above still works on its own."
    };
  }

  const contextNote = buildContextNote(school, country);

  if (provider === 'anthropic') {
    const contentBlocks = mode === 'image'
      ? [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
          { type: 'text', text: contextNote + 'Transcribe the visible offer text from this image, then screen it as instructed.' }
        ]
      : [{ type: 'text', text: contextNote + text.trim() }];
    return callAnthropic(contentBlocks);
  }

  // provider === 'groq'
  if (mode === 'image') {
    const dataUrl = `data:${image.mediaType};base64,${image.data}`;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [
        { type: 'text', text: contextNote + 'Transcribe the visible offer text from this image, then screen it as instructed.' },
        { type: 'image_url', image_url: { url: dataUrl } }
      ] }
    ];
    return callGroq(messages, true);
  }
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: contextNote + text.trim() }
  ];
  return callGroq(messages, false);
}

// ---------------------------------------------------------------------------
// Small in-memory rate limiter — protects your API budget from abuse.
// ---------------------------------------------------------------------------
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const record = requestLog.get(ip) || { count: 0, windowStart: now };
  if (now - record.windowStart > WINDOW_MS) {
    record.count = 0;
    record.windowStart = now;
  }
  record.count += 1;
  requestLog.set(ip, record);
  return record.count > MAX_REQUESTS_PER_WINDOW;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of requestLog.entries()) {
    if (now - record.windowStart > WINDOW_MS) requestLog.delete(ip);
  }
}, WINDOW_MS).unref();

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function sendJSON(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJSONBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('That upload is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid request body.'));
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.resolve(PUBLIC_DIR, '.' + urlPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJSON(res, 403, { error: 'Forbidden' });
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function checkAdmin(req) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;
  const headerKey = req.headers['x-admin-key'];
  const url = new URL(req.url, 'http://localhost');
  const queryKey = url.searchParams.get('key');
  return (headerKey || queryKey) === adminKey;
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------
async function handleRequest(req, res) {
  try {
    const urlPath = req.url.split('?')[0];

    if (req.method === 'GET' && urlPath === '/api/health') {
      const provider = getProvider();
      sendJSON(res, 200, {
        status: 'ok',
        provider: provider || 'none',
        model: provider === 'groq' ? (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile') : (process.env.CLAUDE_MODEL || 'claude-sonnet-5'),
        apiKeyConfigured: Boolean(provider)
      });
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/analyze') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (isRateLimited(ip)) {
        sendJSON(res, 429, { error: 'Too many checks from this device recently. Please wait a bit before trying another one.' });
        return;
      }

      let body;
      try {
        body = await readJSONBody(req, 12 * 1024 * 1024);
      } catch (e) {
        sendJSON(res, 400, { error: e.message });
        return;
      }

      const { mode, text, image, school, country } = body || {};
      if (mode === 'image') {
        if (!image || !image.data || !image.mediaType) {
          sendJSON(res, 400, { error: 'Missing image data.' });
          return;
        }
      } else {
        if (!text || text.trim().length < 20) {
          sendJSON(res, 400, { error: 'Please provide at least a sentence or two of the actual offer text.' });
          return;
        }
      }

      let parsed;
      try {
        parsed = await runAIReview(mode, text, image, school, country);
      } catch (e) {
        console.error('Analyze error:', e.message);
        sendJSON(res, e.statusCode || 500, { error: e.message });
        return;
      }

      if (parsed.aiUnavailable) {
        sendJSON(res, 200, parsed);
        return;
      }

      if (process.env.LOG_CASES !== 'false') {
        try {
          const excerptSource = mode === 'image' ? (parsed.transcribed || '') : text;
          const scan = runScan(excerptSource);
          caseLog.insertCase({
            mode,
            excerpt: excerptSource,
            scanScore: scan.score,
            verdict: parsed.verdict,
            confidence: parsed.confidence,
            redFlags: parsed.redFlags
          });
        } catch (logErr) {
          console.error('Case log insert failed:', logErr);
        }
      }

      sendJSON(res, 200, parsed);
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/admin/cases') {
      if (!checkAdmin(req)) {
        sendJSON(res, process.env.ADMIN_KEY ? 401 : 501, {
          error: process.env.ADMIN_KEY ? 'Invalid or missing admin key.' : 'The staff dashboard is disabled. Set ADMIN_KEY in your .env to enable it.'
        });
        return;
      }
      sendJSON(res, 200, caseLog.getRecentCases(100));
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/admin/stats') {
      if (!checkAdmin(req)) {
        sendJSON(res, process.env.ADMIN_KEY ? 401 : 501, {
          error: process.env.ADMIN_KEY ? 'Invalid or missing admin key.' : 'The staff dashboard is disabled. Set ADMIN_KEY in your .env to enable it.'
        });
        return;
      }
      sendJSON(res, 200, caseLog.getStats());
      return;
    }

    if (req.method === 'GET') {
      serveStatic(req, res);
      return;
    }

    sendJSON(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Unhandled server error:', err);
    sendJSON(res, 500, { error: 'Unexpected server error.' });
  }
}

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') cmd = `open "${url}"`;
  else if (platform === 'win32') cmd = `start "" "${url}"`;
  else cmd = `xdg-open "${url}"`;
  exec(cmd, () => { /* best-effort — fine if this fails headlessly */ });
}

async function main() {
  ensureEnvFileExists();
  loadEnvFile(ENV_PATH);
  await promptForApiKeyIfMissing();

  const PORT = process.env.PORT || 3000;
  const server = http.createServer((req, res) => { handleRequest(req, res); });
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    const provider = getProvider();
    console.log(`\nScholarship Case Desk running at ${url}`);
    console.log(`AI provider: ${provider ? provider : 'none configured — Automated Pattern Scan only'}`);
    console.log('Press Ctrl+C to stop.\n');
    if (process.stdin.isTTY) openBrowser(url);
  });
}

main();
