// ============ CONFIG ============
const NUM_RIDDLES = 8;

// ============ STATE ============
let teams = {}; // keyed by team number => duplicates ignored automatically

// ============ DECODER (mirrors finishGame: "team|r,h,t;r,h,t;...") ============
function decodeResult(str) {
  const parts = str.trim().split('|');
  if (parts.length !== 2) throw new Error('Bad format');
  const team = parseInt(parts[0], 10);
  if (isNaN(team) || team < 1 || team > 32) throw new Error('Bad team number');

  const segs = parts[1].split(';');
  if (segs.length !== NUM_RIDDLES) throw new Error('Wrong step count');

  const steps = segs.map((seg, i) => {
    const [r, h, t] = seg.split(',').map(Number);
    if ([r, h, t].some(isNaN)) throw new Error('Bad segment');
    return { step: i + 1, riddle: r, hintUsed: h === 1, completedAt: t };
  });

  const finishAt = steps[steps.length - 1].completedAt;
  const hintsTotal = steps.filter(s => s.hintUsed).length;
  return { team, steps, finishAt, hintsTotal };
}

// ============ INGEST ============
function addResult(str) {
  let data;
  try { data = decodeResult(str); }
  catch (e) { return { status: 'err', msg: 'Unreadable code' }; }

  if (teams[data.team]) return { status: 'dup', msg: `Team ${data.team} already recorded` };

  teams[data.team] = data;
  saveData();
  renderAll();
  return { status: 'ok', msg: `Team ${data.team} added`, team: data.team };
}

// ============ HELPERS ============
function secondsToTime(secs) {
  if (secs < 0) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(Math.floor(secs/3600))}:${pad(Math.floor((secs%3600)/60))}:${pad(secs%60)}`;
}
function durationStr(secs) {
  if (secs < 0) return '—';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function riddleDurations(t) {
  const durs = [];
  for (let i = 0; i < t.steps.length; i++) {
    if (t.steps[i].completedAt < 0) { durs.push(-1); continue; }
    const prev = i === 0 ? t.steps[0].completedAt : t.steps[i-1].completedAt;
    durs.push(Math.max(0, t.steps[i].completedAt - prev));
  }
  return durs;
}

// ============ RENDER: LEADERBOARD ============
function renderLeaderboard() {
  const el = document.getElementById('leaderboard');
  const list = Object.values(teams).sort((a, b) => {
    if (a.finishAt < 0) return 1;
    if (b.finishAt < 0) return -1;
    return a.finishAt - b.finishAt;
  });
  if (!list.length) { el.innerHTML = '<div class="empty">No teams recorded yet.</div>'; return; }

  const rows = list.map((t, i) => {
    const rankClass = i < 3 ? `rank-${i+1}` : '';
    return `<tr>
      <td class="rank ${rankClass}">${i+1}</td>
      <td><span class="team-chip">${t.team}</span></td>
      <td>${secondsToTime(t.finishAt)}</td>
      <td>${t.hintsTotal}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<table>
    <thead><tr><th>Rank</th><th>Team</th><th>Finished At</th><th>Hints</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

// ============ RENDER: HINT PANEL ============
function renderHintPanel() {
  const el = document.getElementById('hintPanel');
  const list = Object.values(teams).sort((a, b) => b.hintsTotal - a.hintsTotal);
  if (!list.length) { el.innerHTML = '<div class="empty">No data yet.</div>'; return; }
  const max = NUM_RIDDLES;
  el.innerHTML = `<table><tbody>${list.map(t => `
    <tr>
      <td><span class="team-chip">${t.team}</span></td>
      <td style="width:100%">
        <div style="background:var(--surface);border-radius:6px;height:14px;overflow:hidden;">
          <div style="width:${(t.hintsTotal/max)*100}%;height:100%;background:linear-gradient(90deg,var(--neon-magenta),var(--neon-gold));"></div>
        </div>
      </td>
      <td>${t.hintsTotal}/${max}</td>
    </tr>`).join('')}</tbody></table>`;
}

// ============ RENDER: PROGRESS GRAPH ============
function renderChart() {
  const canvas = document.getElementById('progressChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = 300;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const finishers = Object.values(teams)
    .filter(t => t.finishAt >= 0)
    .map(t => t.finishAt)
    .sort((a, b) => a - b);

  const pad = { l: 46, r: 20, t: 20, b: 34 };
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;

  ctx.strokeStyle = 'rgba(120,160,255,0.1)';
  ctx.fillStyle = '#7e8db0';
  ctx.font = '11px Inter, sans-serif';
  const yMax = Math.max(1, finishers.length);
  for (let i = 0; i <= yMax; i++) {
    const y = pad.t + plotH - (i / yMax) * plotH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillText(i, pad.l - 22, y + 4);
  }

  if (finishers.length < 1) {
    ctx.fillStyle = '#7e8db0';
    ctx.fillText('Waiting for finishers…', W/2 - 60, H/2);
    return;
  }

  const tMin = finishers[0];
  const tMax = finishers[finishers.length - 1];
  const span = Math.max(1, tMax - tMin);

  ctx.fillStyle = '#7e8db0';
  ctx.fillText(secondsToTime(tMin), pad.l, H - 12);
  ctx.fillText(secondsToTime(tMax), W - pad.r - 50, H - 12);

  const pts = finishers.map((t, i) => ({
    x: pad.l + ((t - tMin) / span) * plotW,
    y: pad.t + plotH - ((i + 1) / yMax) * plotH
  }));

  ctx.strokeStyle = '#22d3ee';
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t + plotH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#e935c1';
  pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill(); });
}

// ============ RENDER: FUN FACTS ============
function renderFacts() {
  const el = document.getElementById('factList');
  const list = Object.values(teams);
  if (!list.length) { el.innerHTML = '<div class="fact-card"><div class="fact-value">Add a team to begin.</div></div>'; return; }

  const facts = [];
  const finished = list.filter(t => t.finishAt >= 0).sort((a,b) => a.finishAt - b.finishAt);
  if (finished.length) facts.push(['First to Finish', `Team <em>${finished[0].team}</em> at ${secondsToTime(finished[0].finishAt)}`]);

  const byHints = [...list].sort((a,b) => b.hintsTotal - a.hintsTotal);
  facts.push(['Most Hints Used', `Team <em>${byHints[0].team}</em> — ${byHints[0].hintsTotal} hints`]);
  const least = [...list].sort((a,b) => a.hintsTotal - b.hintsTotal)[0];
  facts.push(['Fewest Hints Used', `Team <em>${least.team}</em> — ${least.hintsTotal} hints`]);

  let longest = { secs: -1, team: null, riddle: null };
  list.forEach(t => riddleDurations(t).forEach((d, i) => {
    if (d > longest.secs) longest = { secs: d, team: t.team, riddle: t.steps[i].riddle };
  }));
  if (longest.team !== null) facts.push(['Longest on One Riddle', `Team <em>${longest.team}</em> — ${durationStr(longest.secs)} on Riddle ${longest.riddle}`]);

  let fastest = { secs: Infinity, team: null, riddle: null };
  list.forEach(t => riddleDurations(t).forEach((d, i) => {
    if (i !== 0 && d >= 0 && d < fastest.secs) fastest = { secs: d, team: t.team, riddle: t.steps[i].riddle };
  }));
  if (fastest.team !== null) facts.push(['Fastest Riddle Solve', `Team <em>${fastest.team}</em> — ${durationStr(fastest.secs)} on Riddle ${fastest.riddle}`]);

  const totalHints = list.reduce((s, t) => s + t.hintsTotal, 0);
  facts.push(['Total Hints Used', `<em>${totalHints}</em> across ${list.length} team${list.length>1?'s':''}`]);

  const perfect = list.filter(t => t.hintsTotal === 0).map(t => t.team);
  if (perfect.length) facts.push(['Flawless Runs (0 hints)', `Team${perfect.length>1?'s':''} <em>${perfect.join(', ')}</em>`]);

  el.innerHTML = facts.map(([label, val]) =>
    `<div class="fact-card"><div class="fact-label">${label}</div><div class="fact-value">${val}</div></div>`
  ).join('');
}

// ============ RENDER ALL ============
function renderAll() {
  document.getElementById('teamCount').textContent = Object.keys(teams).length;
  renderLeaderboard();
  renderHintPanel();
  renderChart();
  renderFacts();
}

// ============ PERSISTENCE ============
function saveData() { try { localStorage.setItem('organizerData', JSON.stringify(teams)); } catch(e) {} }
function loadData() {
  try { const s = localStorage.getItem('organizerData'); if (s) teams = JSON.parse(s); } catch(e) {}
  renderAll();
}
function resetAll() {
  if (!confirm('Clear ALL recorded team data? This cannot be undone.')) return;
  teams = {}; saveData(); renderAll();
  setStatus('', 'Data cleared');
}

// ============ MANUAL ENTRY ============
function manualEntry() {
  const str = prompt('Paste the QR code contents (format: team|r,h,t;...):');
  if (!str) return;
  const res = addResult(str);
  setStatus(res.status, res.msg);
  if (res.status === 'ok') flashSuccess();
}

// ============ IMAGE DECODING (works from file://) ============
function handleFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;
  let ok = 0, dup = 0, err = 0, lastMsg = '';
  let pending = files.length;

  files.forEach(file => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data.data, data.width, data.height);
      if (code) {
        const res = addResult(code.data);
        if (res.status === 'ok') { ok++; if (res.status==='ok') flashSuccess(); }
        else if (res.status === 'dup') dup++;
        else err++;
        lastMsg = res.msg;
      } else { err++; lastMsg = 'No QR found in image'; }
      URL.revokeObjectURL(img.src);
      if (--pending === 0) finalizeBatch(ok, dup, err, files.length, lastMsg);
    };
    img.onerror = () => {
      err++; lastMsg = 'Could not read image file';
      if (--pending === 0) finalizeBatch(ok, dup, err, files.length, lastMsg);
    };
    img.src = URL.createObjectURL(file);
  });
  document.getElementById('qrFile').value = '';
}

function finalizeBatch(ok, dup, err, total, lastMsg) {
  if (total === 1) {
    const type = ok ? 'ok' : dup ? 'dup' : 'err';
    setStatus(type, lastMsg);
  } else {
    setStatus(ok ? 'ok' : 'err', `Added ${ok} · Duplicates ${dup} · Errors ${err}`);
  }
}

function setStatus(type, msg) {
  const el = document.getElementById('scanStatus');
  el.className = 'scan-status' + (type ? ' ' + type : '');
  el.textContent = msg;
}
function flashSuccess() {
  const m = document.querySelector('.main');
  m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash');
  setTimeout(() => m.classList.remove('flash'), 600);
}

// ============ DRAG & DROP ============
function setupDragDrop() {
  const dz = document.getElementById('dropzone');
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover');
  }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    if (files && files.length) handleFiles(files);
  });

  // Allow dropping anywhere on the page too
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    if (e.target.closest('#dropzone')) return; // already handled
    if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
}

// ============ INIT ============
window.addEventListener('load', () => { loadData(); setupDragDrop(); });
window.addEventListener('resize', renderChart);