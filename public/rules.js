// Shared between public/app.js (runs in the browser) and server.js (runs in
// Node, only to compute a score for the case log). Edit RULES to tune what
// the automated scanner catches — no other file needs to change.

const RULES = [
  { label: 'Upfront fee requested', weight: 25, re: /\b(application fee|processing fee|registration fee|handling fee|small fee|verification fee|shipping fee|insurance fee)\b/i },
  { label: 'Wire transfer / gift card payment', weight: 35, re: /\b(wire transfer|western union|moneygram|gift card|cash app|venmo|zelle)\b/i },
  { label: 'Requests sensitive info upfront', weight: 30, re: /\b(social security number|\bssn\b|social insurance number|national insurance number|\bni number\b|bank account number|routing number|sort code|credit card number|debit card number)\b/i },
  { label: '"Guaranteed win" language', weight: 25, re: /\b(guaranteed to win|100% guaranteed|you('| )?ve already won|you('| )?re a winner|no one is ever (turned down|rejected))\b/i },
  { label: 'Artificial urgency', weight: 15, re: /\b(act now|limited time|expires (today|tonight|soon)|respond within \d+\s?(hours|minutes)|offer ends)\b/i },
  { label: 'Unsolicited "you were selected"', weight: 15, re: /\b(you (have|'ve) been (selected|chosen)|congratulations,? you)\b/i },
  { label: 'No real application required', weight: 15, re: /\b(no essay required|no application (needed|required)|automatically qualify|no strings attached)\b/i },
  { label: 'Vague, unverifiable sponsor', weight: 10, re: /\b(anonymous donor|private benefactor|national scholarship (committee|program))\b/i },
  { label: 'Dollar amount "reserved" for you', weight: 20, re: /\$[\d,]+(\.\d{2})?\s*(has been|is)\s*(reserved|awarded|waiting)\s*for you/i },
  { label: 'Personal email domain for official contact', weight: 10, re: /(contact|reply|respond)[^.]{0,25}(gmail\.com|yahoo\.com|hotmail\.com|outlook\.com)/i }
];

function runScan(text) {
  const hits = RULES.filter((r) => r.re.test(text || ''));
  const score = Math.min(100, hits.reduce((s, r) => s + r.weight, 0));
  return { score, hits };
}

// Works as a plain <script> in the browser (RULES/runScan become script-scope
// globals other scripts on the page can read) and as a CommonJS module in Node.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RULES, runScan };
}
