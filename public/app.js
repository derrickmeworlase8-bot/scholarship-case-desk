// ---------- Case number ----------
document.getElementById('case-no').textContent = 'FILE NO. ' + Math.floor(100000 + Math.random() * 899999);

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------------------------------------------------------------------------
// Rule-based pattern scan — runs entirely in the browser, instant, free.
// RULES and runScan() come from rules.js (loaded before this file), which is
// shared with the server so the case log can store the same score.
// ---------------------------------------------------------------------------
function scanBlockHTML(scanResult) {
  const { score, hits } = scanResult;
  let level, color;
  if (score >= 75) { level = 'SEVERE'; color = 'var(--stamp-red)'; }
  else if (score >= 45) { level = 'HIGH'; color = 'var(--stamp-red)'; }
  else if (score >= 20) { level = 'MODERATE'; color = 'var(--stamp-amber)'; }
  else { level = 'LOW'; color = 'var(--stamp-green)'; }

  const tags = hits.length
    ? `<div class="tag-row">${hits.map((h) => `<span class="tag">${h.label}</span>`).join('')}</div>`
    : `<p class="no-flags">No known scam patterns matched in the automated scan.</p>`;

  return `
    <div class="scan-block">
      <h3>Automated Pattern Scan</h3>
      <div class="meter"><div class="meter-fill" style="width:${score}%;background:${color};"></div></div>
      <span class="risk-label" style="color:${color};">${level} RISK · ${score}/100</span>
      ${tags}
    </div>`;
}

// ---------------------------------------------------------------------------
// AI review — calls this app's own backend at /api/analyze.
// The Anthropic API key lives only on the server (see server.js); nothing
// secret is ever sent to or stored in the browser.
// ---------------------------------------------------------------------------
async function callBackend(payload) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'The review service returned an error.');
  }
  return data;
}

function verdictStampHTML(verdict, confidence) {
  let cls, label;
  if (verdict === 'likely scam') { cls = 'scam'; label = 'Flagged: Likely Scam'; }
  else if (verdict === 'likely legitimate') { cls = 'legit'; label = 'Verified: Likely Legitimate'; }
  else { cls = 'uncertain'; label = 'Uncertain — Verify Further'; }
  return `
    <div class="verdict-wrap">
      <div>
        <div class="stamp ${cls}">${label}</div>
        <div class="confidence">AI confidence: ${confidence}/100</div>
      </div>
    </div>`;
}

function aiBlockHTML(ai) {
  if (ai.aiUnavailable) {
    return `
      <div class="scan-block" style="border-left:3px solid var(--stamp-amber);">
        <h3>AI Case Review</h3>
        <p class="no-flags" style="font-style:normal;">${escapeHTML(ai.message)}</p>
      </div>`;
  }
  const flags = ai.redFlags && ai.redFlags.length
    ? `<div class="tag-row">${ai.redFlags.map((f) => `<span class="tag">${escapeHTML(f)}</span>`).join('')}</div>`
    : `<p class="no-flags">No red flags identified by the AI review.</p>`;
  const positives = ai.positiveSigns && ai.positiveSigns.length
    ? `<div class="tag-row">${ai.positiveSigns.map((f) => `<span class="tag positive">${escapeHTML(f)}</span>`).join('')}</div>`
    : '';
  return `
    <div class="scan-block">
      <h3>AI Case Review</h3>
      ${verdictStampHTML(ai.verdict, ai.confidence)}
      ${flags}
      ${positives}
      <p class="reasoning">${escapeHTML(ai.reasoning || '')}</p>
      <div class="action"><b>Recommended next step</b>${escapeHTML(ai.recommendedAction || '')}</div>
    </div>`;
}

function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---------- TEXT TAB WIRING ----------
const textInput = document.getElementById('text-input');
const textBtn = document.getElementById('text-analyze-btn');
const textLoading = document.getElementById('text-loading');
const textError = document.getElementById('text-error');
const textResults = document.getElementById('text-results');

textBtn.addEventListener('click', async () => {
  const text = textInput.value.trim();
  textError.style.display = 'none';
  if (text.length < 20) {
    textError.textContent = 'Paste a bit more of the actual offer text — need at least a sentence or two to run a review.';
    textError.style.display = 'block';
    return;
  }
  textResults.classList.remove('show');
  textResults.innerHTML = '';
  textBtn.disabled = true;
  textLoading.style.display = 'flex';

  const scan = runScan(text);
  let html = scanBlockHTML(scan);

  const school = document.getElementById('text-school').value.trim();
  const country = document.getElementById('text-country').value;

  try {
    const ai = await callBackend({ mode: 'text', text, school, country });
    html += aiBlockHTML(ai);
  } catch (err) {
    textError.textContent = err.message || 'Something went wrong running the AI review.';
    textError.style.display = 'block';
  }

  textResults.innerHTML = html;
  textResults.classList.add('show');
  textLoading.style.display = 'none';
  textBtn.disabled = false;
});

document.getElementById('text-reset-btn').addEventListener('click', () => {
  textInput.value = '';
  document.getElementById('text-school').value = '';
  document.getElementById('text-country').value = '';
  textResults.classList.remove('show');
  textResults.innerHTML = '';
  textError.style.display = 'none';
});

// ---------- IMAGE TAB WIRING ----------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const previewWrap = document.getElementById('preview-wrap');
const previewImg = document.getElementById('preview-img');
const imageBtn = document.getElementById('image-analyze-btn');
const imageLoading = document.getElementById('image-loading');
const imageError = document.getElementById('image-error');
const imageResults = document.getElementById('image-results');
let selectedFile = null;

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile = file;
  dropzone.classList.add('has-file');
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewWrap.style.display = 'block';
  imageBtn.disabled = false;
  imageError.style.display = 'none';
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = () => reject(new Error('Could not read that image file.'));
    r.readAsDataURL(file);
  });
}

imageBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  imageError.style.display = 'none';
  imageResults.classList.remove('show');
  imageResults.innerHTML = '';
  imageBtn.disabled = true;
  imageLoading.style.display = 'flex';

  try {
    const base64 = await fileToBase64(selectedFile);
    const mediaType = selectedFile.type || 'image/png';
    const school = document.getElementById('image-school').value.trim();
    const country = document.getElementById('image-country').value;
    const ai = await callBackend({ mode: 'image', image: { mediaType, data: base64 }, school, country });
    const scanSource = (ai.transcribed || ai.reasoning || '') + ' ' + JSON.stringify(ai.redFlags || []);
    const scan = runScan(scanSource);
    imageResults.innerHTML = scanBlockHTML(scan) + aiBlockHTML(ai);
    imageResults.classList.add('show');
  } catch (err) {
    imageError.textContent = err.message || 'Something went wrong reading that image.';
    imageError.style.display = 'block';
  }

  imageLoading.style.display = 'none';
  imageBtn.disabled = false;
});

document.getElementById('image-reset-btn').addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  document.getElementById('image-school').value = '';
  document.getElementById('image-country').value = '';
  previewWrap.style.display = 'none';
  dropzone.classList.remove('has-file');
  imageBtn.disabled = true;
  imageResults.classList.remove('show');
  imageResults.innerHTML = '';
  imageError.style.display = 'none';
});

// ---------- CONTACT YOUR SCHOOL TAB WIRING ----------
// Uses SCHOOL_DIRECTORY / findSchool / buildSearchLinks from school-directory.js.
// Entirely client-side — no backend call, no AI cost.
const COUNTRY_LABELS = { us: 'United States', ca: 'Canada', uk: 'United Kingdom', other: 'Other' };

document.getElementById('contact-find-btn').addEventListener('click', () => {
  const school = document.getElementById('contact-school').value.trim();
  const country = document.getElementById('contact-country').value;
  const resultsEl = document.getElementById('contact-results');

  if (!school) {
    resultsEl.innerHTML = `<div class="error-box" style="display:block;">Enter a school name first.</div>`;
    return;
  }

  const match = findSchool(school);
  const links = buildSearchLinks(school, country);

  let html = '';
  if (match) {
    html += `
      <div class="school-card">
        <div class="name">${escapeHTML(match.name)}</div>
        <a class="school-link" href="${match.url}" target="_blank" rel="noopener">Official financial aid / student funding page →</a>
        <p class="verify-note">Before trusting this, check that the page you land on is on ${escapeHTML(match.name)}'s own official domain in your browser's address bar. Links can go stale — if this one looks wrong, use the search links below instead.</p>
      </div>`;
  }

  html += `
    <div class="school-card">
      <div class="name">${match ? 'Search for more, or a specific department' : `Search for ${escapeHTML(school)}'s official page`}</div>
      <p style="font-size:13px;color:var(--text-muted);margin:0 0 4px;">Scoped to ${escapeHTML(COUNTRY_LABELS[country] || 'official education')} domains where possible — always confirm the result is your school's own site before trusting any contact info on it.</p>
      <div class="search-links">
        <a href="${links.google}" target="_blank" rel="noopener">Search Google →</a>
        <a href="${links.bing}" target="_blank" rel="noopener">Search Bing →</a>
      </div>
    </div>`;

  resultsEl.innerHTML = html;
});
