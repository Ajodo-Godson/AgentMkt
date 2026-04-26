import { CAPABILITY_TAGS } from "@agentmkt/contracts";

const capOptions = CAPABILITY_TAGS.map(
  (t) => `<option value="${t}">${t}</option>`,
).join("");

const capCheckboxes = CAPABILITY_TAGS.map(
  (t) => `
    <label class="cap">
      <input type="checkbox" name="cap" value="${t}" />
      <span>${t}</span>
    </label>`,
).join("");

export const devUiHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>AgentMkt — Marketplace Dev</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root {
    --fg: #0f1116;
    --muted: #5b6270;
    --bg: #fafbfc;
    --panel: #ffffff;
    --line: #e5e7eb;
    --accent: #3a86ff;
    --bad: #d62828;
    --good: #1f7a3a;
    --warn: #b25e00;
  }
  * { box-sizing: border-box }
  body {
    margin: 0; padding: 32px;
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--fg); background: var(--bg);
  }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { margin: 32px 0 12px; font-size: 16px; font-weight: 600; }
  .lede { color: var(--muted); margin: 0 0 24px; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    background: #fff5cc; color: #6b4d00; font-size: 11px; font-weight: 600;
    border: 1px solid #ffd966; margin-left: 8px; vertical-align: middle;
  }
  .panel {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 16px; margin-bottom: 16px;
  }
  label { display: block; margin: 8px 0 4px; font-size: 12px; color: var(--muted); }
  input[type=text], input[type=number], select, textarea {
    width: 100%; padding: 8px 10px; border: 1px solid var(--line);
    border-radius: 6px; font: inherit; background: #fff;
  }
  textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; min-height: 80px; }
  button {
    background: var(--fg); color: #fff; border: 0; border-radius: 6px;
    padding: 8px 14px; cursor: pointer; font: inherit; font-weight: 500;
  }
  button:hover { background: #1a1d24; }
  button.secondary { background: #fff; color: var(--fg); border: 1px solid var(--line); }
  button.secondary:hover { background: #f3f4f6; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; }
  .row > * { flex: 1 1 160px; }
  .row > button { flex: 0 0 auto; }
  .caps { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 6px; }
  .cap { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); font-size: 13px; }
  th { font-weight: 600; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .src-internal { color: var(--good); font-weight: 600; }
  .src-402index { color: var(--accent); font-weight: 600; }
  pre.json {
    background: #f3f4f6; border: 1px solid var(--line); border-radius: 6px;
    padding: 10px; overflow: auto; font-size: 12px; max-height: 300px;
    margin: 8px 0 0;
  }
  .verdict-PASS { color: var(--good); font-weight: 600; }
  .verdict-FAIL_RETRYABLE { color: var(--warn); font-weight: 600; }
  .verdict-FAIL_FATAL { color: var(--bad); font-weight: 600; }
  .stars { display: inline-flex; gap: 2px; }
  .stars input { display: none; }
  .stars label { display: inline-block; cursor: pointer; font-size: 18px; color: #cbd5e1; padding: 0 2px; margin: 0; }
  .stars input:checked ~ label,
  .stars label:hover, .stars label:hover ~ label { color: #f4b400; }
  .stars { direction: rtl; }
  .rate-form { display: none; padding: 12px; background: #f9fafb; border-radius: 6px; margin-top: 8px; }
  .rate-form.open { display: block; }
  .empty { color: var(--muted); font-style: italic; padding: 12px 0; }
  .new-ewma { color: var(--good); font-weight: 600; }
  .pill {
    display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px;
    background: #f1f5f9; color: var(--muted);
  }
</style>
</head>
<body>
  <h1>AgentMkt — Marketplace <span class="badge">DEV TOOL</span></h1>
  <p class="lede">Direct interface to the four §6.3 endpoints. Not the user-facing frontend (that's P4's job).</p>

  <!-- DISCOVER -->
  <div class="panel">
    <h2 style="margin-top:0">1. Discover workers</h2>
    <label>Capability tags (choose 1+)</label>
    <div class="caps">${capCheckboxes}</div>
    <div class="row" style="margin-top: 12px">
      <div>
        <label>Max price (sats)</label>
        <input id="d-maxprice" type="number" placeholder="(optional)" />
      </div>
      <div>
        <label>Min rating (0–5)</label>
        <input id="d-minrating" type="number" step="0.1" placeholder="(optional)" />
      </div>
      <div>
        <label>Limit</label>
        <input id="d-limit" type="number" value="5" />
      </div>
      <div>
        <label>Include external (402index)</label>
        <select id="d-external"><option value="true">true</option><option value="false">false</option></select>
      </div>
      <button onclick="runDiscover()">Discover</button>
    </div>
    <div id="d-results"></div>
  </div>

  <!-- VERIFY -->
  <div class="panel">
    <h2 style="margin-top:0">2. Verify a result</h2>
    <div class="row">
      <div>
        <label>Capability tag</label>
        <select id="v-cap">${capOptions}</select>
      </div>
      <div style="flex: 0 0 auto">
        <label>&nbsp;</label>
        <button class="secondary" onclick="loadVerifyExample()">Load valid example</button>
      </div>
      <div style="flex: 0 0 auto">
        <label>&nbsp;</label>
        <button class="secondary" onclick="loadVerifyBadExample()">Load bad example</button>
      </div>
    </div>
    <label>Spec (the original step description)</label>
    <input id="v-spec" type="text" value="summarize this article in 50 words" />
    <label>Result (StepResult JSON)</label>
    <textarea id="v-result">{"kind":"json","data":{"summary":"This is a concise summary of the input text covering the main ideas in roughly fifty words."}}</textarea>
    <div style="margin-top: 12px">
      <button onclick="runVerify()">Verify</button>
    </div>
    <div id="v-results"></div>
  </div>

  <!-- REGISTER WORKER -->
  <div class="panel">
    <h2 style="margin-top:0">3. Register a worker</h2>
    <div class="row">
      <div>
        <label>Type</label>
        <select id="w-type">
          <option value="human">human</option>
          <option value="agent">agent</option>
        </select>
      </div>
      <div>
        <label>Display name</label>
        <input id="w-name" type="text" value="Test Human" />
      </div>
      <div>
        <label>Owner user_id</label>
        <input id="w-owner" type="text" value="user_demo_buyer" />
      </div>
      <div>
        <label>Base price (sats)</label>
        <input id="w-price" type="number" value="500" />
      </div>
    </div>
    <div class="row">
      <div>
        <label>endpoint_url (agents)</label>
        <input id="w-endpoint" type="text" placeholder="http://localhost:5001/service" />
      </div>
      <div>
        <label>telegram_chat_id (humans)</label>
        <input id="w-tgchat" type="text" value="123456789" />
      </div>
    </div>
    <label>Capability tags</label>
    <select id="w-cap" multiple size="6">${capOptions}</select>
    <div style="margin-top: 12px">
      <button onclick="runRegister()">Register</button>
      <span style="color: var(--muted); font-size: 12px; margin-left: 8px">cmd/ctrl-click to multi-select</span>
    </div>
    <div id="w-results"></div>
  </div>

<script>
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function getCheckedCaps() {
  return $$('.cap input:checked').map((el) => el.value);
}

async function call(method, path, body) {
  const opts = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const json = await r.json();
  return { status: r.status, json };
}

function toJson(o) { return JSON.stringify(o, null, 2); }

function renderError(target, status, json) {
  target.innerHTML = '<pre class="json" style="border-color:#fecaca;background:#fff1f2;color:#7f1d1d">[' + status + '] ' + toJson(json) + '</pre>';
}

// ---- DISCOVER ----
async function runDiscover() {
  const caps = getCheckedCaps();
  const target = $('#d-results');
  if (caps.length === 0) {
    target.innerHTML = '<p class="empty">Select at least one capability tag.</p>';
    return;
  }
  const body = {
    capability_tags: caps,
    limit: Number($('#d-limit').value || 5),
    include_external: $('#d-external').value === 'true',
  };
  const mp = $('#d-maxprice').value;
  if (mp) body.max_price_sats = Number(mp);
  const mr = $('#d-minrating').value;
  if (mr) body.min_rating = Number(mr);

  target.innerHTML = '<p class="empty">Discovering…</p>';
  const { status, json } = await call('POST', '/discover', body);
  if (status !== 200) return renderError(target, status, json);

  const candidates = json.candidates || [];
  if (candidates.length === 0) {
    target.innerHTML = '<p class="empty">No candidates found.</p>';
    return;
  }
  let html = '<table><thead><tr>'
    + '<th>Display name</th><th>Type</th><th>Source</th><th>Capabilities</th>'
    + '<th class="num">Price (sats)</th><th class="num">EWMA</th><th class="num">Jobs</th><th></th>'
    + '</tr></thead><tbody>';
  candidates.forEach((c, i) => {
    const srcClass = 'src-' + c.source;
    html += '<tr>'
      + '<td><strong>' + c.display_name + '</strong><br><span class="pill">' + c.worker_id + '</span></td>'
      + '<td>' + c.type + '</td>'
      + '<td><span class="' + srcClass + '">' + c.source + '</span></td>'
      + '<td>' + c.capability_tags.map((t) => '<span class="pill">' + t + '</span>').join(' ') + '</td>'
      + '<td class="num">' + c.base_price_sats + '</td>'
      + '<td class="num">' + c.ewma.toFixed(2) + '</td>'
      + '<td class="num">' + c.total_jobs + '</td>'
      + '<td><button class="secondary" onclick="toggleRate(' + i + ')">Rate</button></td>'
      + '</tr>'
      + '<tr><td colspan="8" style="padding:0;border-bottom:0">'
      + buildRateForm(i, c)
      + '</td></tr>';
  });
  html += '</tbody></table>';
  target.innerHTML = html;
}

function buildRateForm(i, c) {
  const caps = c.capability_tags.map((t) => '<option value="' + t + '">' + t + '</option>').join('');
  return '<div class="rate-form" id="rate-' + i + '">'
    + '<div class="row">'
    + '<div><label>Capability</label><select id="rate-cap-' + i + '">' + caps + '</select></div>'
    + '<div><label>Source</label><select id="rate-src-' + i + '">'
    + '<option value="user">user (1–5)</option>'
    + '<option value="verifier">verifier (-1 to 1)</option>'
    + '<option value="system">system (-1 to 1)</option>'
    + '</select></div>'
    + '<div><label>Score</label><input id="rate-score-' + i + '" type="number" step="0.1" value="5" /></div>'
    + '<div><label>Reason</label><input id="rate-reason-' + i + '" type="text" value="manual rating from dev UI" /></div>'
    + '<button onclick="submitRating(\\'' + c.worker_id + '\\', ' + i + ')">Submit rating</button>'
    + '</div>'
    + '<div id="rate-result-' + i + '"></div>'
    + '</div>';
}

function toggleRate(i) {
  $('#rate-' + i).classList.toggle('open');
}

async function submitRating(worker_id, i) {
  const body = {
    worker_id,
    capability_tag: $('#rate-cap-' + i).value,
    job_id: 'job_seed_anchor',
    step_id: 'step_seed_' + worker_id + '_' + $('#rate-cap-' + i).value,
    source: $('#rate-src-' + i).value,
    score: Number($('#rate-score-' + i).value),
    reason: $('#rate-reason-' + i).value || undefined,
  };
  const target = $('#rate-result-' + i);
  target.innerHTML = '<p class="empty">Submitting…</p>';
  const { status, json } = await call('POST', '/ratings', body);
  if (status !== 201) return renderError(target, status, json);
  target.innerHTML = '<p>Rating <strong>' + json.rating_id + '</strong> recorded. New EWMA: <span class="new-ewma">' + json.new_ewma.toFixed(3) + '</span> — re-run Discover to see the ranking shift.</p>';
}

// ---- VERIFY ----
async function runVerify() {
  const target = $('#v-results');
  let result;
  try {
    result = JSON.parse($('#v-result').value);
  } catch (e) {
    target.innerHTML = '<p class="empty" style="color:var(--bad)">Result is not valid JSON: ' + e.message + '</p>';
    return;
  }
  const body = {
    capability_tag: $('#v-cap').value,
    spec: $('#v-spec').value,
    result,
  };
  target.innerHTML = '<p class="empty">Verifying…</p>';
  const { status, json } = await call('POST', '/verify', body);
  if (status !== 200) return renderError(target, status, json);
  const v = json.verdict;
  let html = '<p>Verdict: <span class="verdict-' + v.kind + '">' + v.kind + '</span>';
  if (v.confidence !== undefined) html += ' &middot; confidence ' + v.confidence.toFixed(2);
  if (v.reason) html += ' &middot; <em>' + v.reason + '</em>';
  html += '</p><pre class="json">' + toJson(json) + '</pre>';
  target.innerHTML = html;
}

const VERIFY_EXAMPLES = {
  summarization: {
    spec: 'summarize this article in 50 words',
    good: { kind: 'json', data: { summary: 'This is a concise summary of the input text covering the main ideas in roughly fifty words for the verifier.' } },
    bad: { kind: 'json', data: { summary: 'hi' } },
  },
  translation_fr: {
    spec: 'translate to French',
    good: { kind: 'json', data: { translated_text: 'Le chat est sur le tapis et la table est dans la cuisine.' } },
    bad: { kind: 'json', data: { translated_text: 'hello world' } },
  },
  translation_es: {
    spec: 'translate to Spanish',
    good: { kind: 'json', data: { translated_text: 'El gato está en la alfombra y la mesa está en la cocina.' } },
    bad: { kind: 'json', data: { translated_text: 'hello world' } },
  },
  tts_en: {
    spec: 'render this as English audio',
    good: { kind: 'json', data: { audio_url: 'https://cdn.example.com/audio/123.mp3' } },
    bad: { kind: 'json', data: { audio_url: 'not-a-url' } },
  },
  voiceover_human: {
    spec: 'record a 30-second French voiceover',
    good: { kind: 'file', mime_type: 'audio/mpeg', storage_url: 'https://cdn.example.com/voiceover.mp3' },
    bad: { kind: 'text', text: 'I forgot to record it' },
  },
  creative_writing_human: {
    spec: 'write a 500-word short story',
    good: { kind: 'text', text: 'It was a dark and stormy night...'.padEnd(200, ' more text') },
    bad: { kind: 'text', text: '' },
  },
};

function loadVerifyExample() {
  const cap = $('#v-cap').value;
  const ex = VERIFY_EXAMPLES[cap];
  if (!ex) {
    $('#v-spec').value = 'TODO: write a spec for ' + cap;
    $('#v-result').value = '{"kind":"json","data":{}}';
    return;
  }
  $('#v-spec').value = ex.spec;
  $('#v-result').value = toJson(ex.good);
}

function loadVerifyBadExample() {
  const cap = $('#v-cap').value;
  const ex = VERIFY_EXAMPLES[cap];
  if (!ex) return;
  $('#v-spec').value = ex.spec;
  $('#v-result').value = toJson(ex.bad);
}

// ---- REGISTER ----
async function runRegister() {
  const target = $('#w-results');
  const type = $('#w-type').value;
  const caps = Array.from($('#w-cap').selectedOptions).map((o) => o.value);
  const body = {
    type,
    owner_user_id: $('#w-owner').value,
    display_name: $('#w-name').value,
    capability_tags: caps,
    base_price_sats: Number($('#w-price').value),
  };
  if (type === 'agent') body.endpoint_url = $('#w-endpoint').value;
  if (type === 'human') body.telegram_chat_id = $('#w-tgchat').value;

  target.innerHTML = '<p class="empty">Registering…</p>';
  const { status, json } = await call('POST', '/workers', body);
  if (status !== 201) return renderError(target, status, json);
  target.innerHTML = '<p>Registered <strong>' + json.worker.id + '</strong>. <a href="/workers/' + json.worker.id + '" target="_blank">View JSON</a></p><pre class="json">' + toJson(json) + '</pre>';
}
</script>
</body>
</html>`;
