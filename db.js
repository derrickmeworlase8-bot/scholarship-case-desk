const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'case-log.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

function readAll() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Could not read case log, starting fresh:', e.message);
    return [];
  }
}

function writeAll(cases) {
  fs.writeFileSync(DB_FILE, JSON.stringify(cases, null, 2), 'utf8');
}

/**
 * Log one completed AI review. Only a short excerpt of the submitted text is
 * kept (never a full screenshot/image) — enough to spot patterns across
 * cases, not a full copy of what the student submitted.
 */
function insertCase({ mode, excerpt, scanScore, verdict, confidence, redFlags }) {
  const cases = readAll();
  const nextId = cases.reduce((max, c) => Math.max(max, c.id || 0), 0) + 1;
  cases.push({
    id: nextId,
    created_at: new Date().toISOString(),
    mode,
    excerpt: (excerpt || '').slice(0, 400),
    scan_score: Number.isFinite(scanScore) ? scanScore : null,
    ai_verdict: verdict || null,
    ai_confidence: Number.isFinite(confidence) ? confidence : null,
    red_flags: Array.isArray(redFlags) ? redFlags : []
  });
  writeAll(cases);
}

function getRecentCases(limit = 100) {
  const cases = readAll();
  return cases.slice(-limit).reverse();
}

function getStats() {
  const cases = readAll();
  const total = cases.length;
  const byVerdictMap = {};
  const flagCounts = {};
  for (const c of cases) {
    const v = c.ai_verdict || 'unknown';
    byVerdictMap[v] = (byVerdictMap[v] || 0) + 1;
    for (const f of c.red_flags || []) flagCounts[f] = (flagCounts[f] || 0) + 1;
  }
  const byVerdict = Object.entries(byVerdictMap).map(([verdict, n]) => ({ verdict, n }));
  const topFlags = Object.entries(flagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, count]) => ({ label, count }));
  return { total, byVerdict, topFlags };
}

module.exports = { insertCase, getRecentCases, getStats };
