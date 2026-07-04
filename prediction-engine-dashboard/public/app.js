const state = {
  matches: null,
  currentFixture: null,
  prediction: null,
};

const $ = (sel) => document.querySelector(sel);

function fmtPct(value) {
  if (value == null) return '—';
  return `${Math.round(value * 1000) / 10}%`;
}

function fmtNum(value) {
  if (value == null) return '—';
  return String(value);
}

function formatKickoff(fixture) {
  if (fixture.kickoffLocal) return fixture.kickoffLocal;
  if (fixture.kickoffTime) {
    return new Date(fixture.kickoffTime).toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }) + ' UTC';
  }
  return 'Not available';
}

function groupFinishLabel(team) {
  if (team.groupFinish == null) return 'Group finish unavailable';
  const suffix = team.groupFinish === 1 ? 'st' : team.groupFinish === 2 ? 'nd' : team.groupFinish === 3 ? 'rd' : 'th';
  return `Group ${team.group ?? '—'} · ${team.groupFinish}${suffix}`;
}

function renderTeamBlock(team, align) {
  const displayName = team.officialName && team.officialName !== team.name
    ? `${team.name}`
    : team.name;

  return `
    <div class="team-block ${align === 'away' ? 'team-block--away' : ''}">
      <span class="team-flag">${team.flag ?? '🏳️'}</span>
      <span class="team-name">${displayName}</span>
      <span class="team-meta">${groupFinishLabel(team)}${team.seed != null ? ` · Seed #${team.seed}` : ''}</span>
    </div>
  `;
}

function renderMatchesList() {
  const list = $('#matches-list');
  const meta = $('#matches-meta');
  const notice = $('#synthetic-notice');

  const data = state.matches;

  if (data?.error) {
    meta.textContent = data.statusMessage;
    notice.className = 'notice notice--error';
    notice.classList.remove('hidden');
    notice.innerHTML = `<strong>${data.error}</strong> ${data.dataNote ?? ''}`;
    list.innerHTML = '<div class="state-box">No official knockout fixtures found from API-Football.</div>';
    return;
  }

  if (!data?.fixtures?.length) {
    meta.textContent = data?.statusMessage ?? 'No fixtures available';
    notice.classList.add('hidden');
    list.innerHTML = '<div class="state-box">No knockout fixtures available.</div>';
    return;
  }

  meta.textContent = `${data.statusMessage} · ${data.fixtures.length} matches · ${data.round} · Exported ${data.exportedAt ?? '—'}`;

  notice.classList.remove('hidden');

  if (data.isSynthetic) {
    notice.className = 'notice notice--danger';
    notice.innerHTML = `<strong>⚠ SYNTHETIC FALLBACK — NOT OFFICIAL FIXTURES</strong><br>${data.syntheticNote ?? ''}<br>${data.dataNote ?? ''}<br>Run <code>npm run update-knockout-fixtures</code> to load real API-Football knockout fixtures.`;
  } else {
    notice.className = 'notice notice--official';
    notice.innerHTML = `<strong>✓ Official API-Football fixtures loaded</strong> — ${data.dataNote ?? ''}`;
  }

  list.innerHTML = data.fixtures.map((fixture) => `
    <article class="match-card" data-home="${fixture.home.name}" data-away="${fixture.away.name}">
      <div class="match-card__meta">
        <span>${fixture.stage ?? fixture.round}</span>
        <span>Kickoff: ${formatKickoff(fixture)}</span>
        ${fixture.venue ? `<span>${fixture.venue}${fixture.city ? `, ${fixture.city}` : ''}</span>` : ''}
        ${fixture.isSynthetic ? '<span class="tag tag--warn">Synthetic</span>' : '<span class="tag tag--official">Official</span>'}
      </div>
      <div class="match-card__teams">
        ${renderTeamBlock(fixture.home, 'home')}
        <span class="vs">VS</span>
        ${renderTeamBlock(fixture.away, 'away')}
      </div>
      <button type="button" class="btn btn--primary btn-predict-match" data-home="${fixture.home.name}" data-away="${fixture.away.name}">Predict</button>
    </article>
  `).join('');

  list.querySelectorAll('.btn-predict-match').forEach((btn) => {
    btn.addEventListener('click', () => {
      openPrediction(btn.dataset.home, btn.dataset.away);
    });
  });
}

function showScreen(name) {
  $('#screen-matches').classList.toggle('hidden', name !== 'matches');
  $('#screen-detail').classList.toggle('hidden', name !== 'detail');
}

async function fetchPrediction(home, away) {
  const res = await fetch(`/api/predict?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}`);
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'Prediction failed');
  return data;
}

function renderProbBars(prediction, home, away) {
  const p = prediction.prediction;
  const rows = [
    { label: `${home} win`, value: p.winProbability },
    { label: 'Draw', value: p.drawProbability },
    { label: `${away} win`, value: p.lossProbability },
  ];

  $('#prob-bars').innerHTML = rows.map((row) => `
    <div class="prob-row">
      <div class="prob-label"><span>${row.label}</span><span>${fmtPct(row.value)}</span></div>
      <div class="prob-track"><div class="prob-fill" style="width:${Math.round((row.value ?? 0) * 100)}%"></div></div>
    </div>
  `).join('');
}

function renderDetail() {
  const { currentFixture: fixture, prediction: data } = state;
  if (!fixture || !data?.prediction) return;

  const pred = data.prediction;
  const stats = pred.expectedStats;
  const homeName = fixture.home.officialName ?? fixture.home.name;
  const awayName = fixture.away.officialName ?? fixture.away.name;

  $('#detail-round').textContent = fixture.stage ?? fixture.round;
  $('#detail-title').textContent = `${homeName} vs ${awayName}`;
  $('#detail-kickoff').textContent = `Kickoff: ${formatKickoff(fixture)}${fixture.venue ? ` · ${fixture.venue}` : ''}`;

  const synth = $('#detail-synthetic');
  if (fixture.isSynthetic) {
    synth.className = 'notice notice--danger';
    synth.classList.remove('hidden');
    synth.innerHTML = `<strong>⚠ SYNTHETIC FIXTURE</strong> ${fixture.syntheticNote ?? state.matches?.syntheticNote ?? ''}`;
  } else {
    synth.className = 'notice notice--official';
    synth.classList.remove('hidden');
    synth.innerHTML = '<strong>✓ Official API-Football fixture</strong>';
  }

  $('#hero-teams').innerHTML = `
    ${renderTeamBlock(fixture.home, 'home')}
    <span class="vs">VS</span>
    ${renderTeamBlock(fixture.away, 'away')}
  `;

  $('#hero-score').textContent = pred.scoreline?.selectedScoreline ?? pred.prediction.score;
  $('#hero-winner').textContent = `Winner: ${pred.prediction.winner}`;
  $('#hero-confidence').textContent = `Confidence ${fmtNum(pred.prediction.confidence)}/10`;

  const sl = pred.scoreline;
  if (sl) {
    $('#scoreline-poisson').textContent = sl.rawPoissonMostLikely ?? '—';
    $('#scoreline-representative').textContent = sl.representativeScoreline ?? '—';
    $('#scoreline-selected').textContent = sl.selectedScoreline ?? pred.prediction.score;
    $('#scoreline-reason').textContent = sl.selectionReason ?? '—';
    $('#scoreline-details').classList.remove('hidden');
  } else {
    $('#scoreline-poisson').textContent = '—';
    $('#scoreline-representative').textContent = '—';
    $('#scoreline-selected').textContent = pred.prediction.score ?? '—';
    $('#scoreline-reason').textContent = 'Scoreline diagnostics unavailable.';
  }

  renderProbBars(pred, homeName, awayName);

  $('#stat-xg').innerHTML = `
    <div class="stat-row"><span>${homeName}</span><span>${fmtNum(stats.expectedGoals.home)} xG</span></div>
    <div class="stat-row"><span>${awayName}</span><span>${fmtNum(stats.expectedGoals.away)} xG</span></div>
  `;

  const homeShots = stats.shots?.[pred.homeTeam] ?? stats.shots?.[homeName] ?? stats.shots?.[fixture.home.name];
  const awayShots = stats.shots?.[pred.awayTeam] ?? stats.shots?.[awayName] ?? stats.shots?.[fixture.away.name];
  $('#stat-shots').innerHTML = `
    <div class="stat-row"><span>${homeName}</span><span>${fmtNum(homeShots?.total)} shots (${fmtNum(homeShots?.onTarget)} SoT)</span></div>
    <div class="stat-row"><span>${awayName}</span><span>${fmtNum(awayShots?.total)} shots (${fmtNum(awayShots?.onTarget)} SoT)</span></div>
  `;

  const homeCorners = stats.corners[pred.homeTeam] ?? stats.corners[homeName] ?? stats.corners[fixture.home.name];
  const awayCorners = stats.corners[pred.awayTeam] ?? stats.corners[awayName] ?? stats.corners[fixture.away.name];
  $('#stat-corners').innerHTML = `
    <div class="stat-row"><span>${homeName}</span><span>${fmtNum(homeCorners)}</span></div>
    <div class="stat-row"><span>${awayName}</span><span>${fmtNum(awayCorners)}</span></div>
  `;

  $('#stat-cards').innerHTML = `
    <div class="stat-row"><span>Total cards</span><span>${fmtNum(stats.cards.total)}</span></div>
    <div class="stat-row"><span>${homeName}</span><span>${fmtNum(stats.cards.home)}</span></div>
    <div class="stat-row"><span>${awayName}</span><span>${fmtNum(stats.cards.away)}</span></div>
  `;

  const saveEntries = Object.entries(stats.saves || {});
  $('#stat-saves').innerHTML = saveEntries.length
    ? saveEntries.map(([key, val]) => `<div class="stat-row"><span>${key}</span><span>${fmtNum(val)}</span></div>`).join('')
    : '<div class="stat-row"><span>—</span><span>Not available</span></div>';

  const threats = pred.keyPlayerThreats;
  $('#threats-grid').innerHTML = `
    <div class="threat-col">
      <h3>${homeName}</h3>
      ${renderThreats(threats.home)}
    </div>
    <div class="threat-col">
      <h3>${awayName}</h3>
      ${renderThreats(threats.away)}
    </div>
  `;

  $('#breakdown-text').textContent = pred.breakdown || '—';

  const limitations = [...(pred.limitations || [])];
  if (pred.pairingNote) limitations.unshift(pred.pairingNote);
  $('#limitations-list').innerHTML = limitations.map((item) => `<li>${item}</li>`).join('') || '<li>No limitations recorded.</li>';
}

function renderThreats(rows) {
  if (!rows?.length) return '<p class="threat-stats">No player threat data available.</p>';
  return rows.map((t) => `
    <div class="threat-item">
      <div class="threat-name">${t.name}</div>
      <div class="threat-stats">${t.worldCupGoals ?? '—'} WC G · ${t.worldCupAssists ?? '—'} WC A · threat ${fmtNum(t.threatScore)}</div>
      ${t.note ? `<div class="threat-stats">${t.note}</div>` : ''}
    </div>
  `).join('');
}

async function openPrediction(home, away) {
  showScreen('detail');
  $('#hero-score').textContent = '…';
  $('#hero-winner').textContent = 'Running prediction…';
  $('#breakdown-text').textContent = 'Loading…';

  const fixture = state.matches?.fixtures?.find(
    (row) => row.home.name === home && row.away.name === away,
  ) ?? null;

  state.currentFixture = fixture;

  try {
    const data = await fetchPrediction(home, away);
    state.prediction = data;
    if (data.fixture) state.currentFixture = data.fixture;
    renderDetail();
  } catch (err) {
    $('#breakdown-text').textContent = err.message;
    $('#limitations-list').innerHTML = `<li>${err.message}</li>`;
  }
}

async function loadMatches() {
  const res = await fetch('/api/matches');
  const data = await res.json();
  state.matches = data;
  renderMatchesList();
}

function exportJson() {
  if (!state.prediction) return;
  const blob = new Blob([JSON.stringify(state.prediction, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edgestats-prediction-${state.currentFixture?.home.name}-vs-${state.currentFixture?.away.name}.json`.replace(/\s+/g, '-').toLowerCase();
  a.click();
  URL.revokeObjectURL(url);
}

async function copyBreakdown() {
  const text = state.prediction?.prediction?.breakdown;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  $('#btn-copy').textContent = 'Copied!';
  setTimeout(() => { $('#btn-copy').textContent = 'Copy Breakdown'; }, 1500);
}

function bindEvents() {
  $('#btn-back').addEventListener('click', () => showScreen('matches'));
  $('#btn-back-bottom').addEventListener('click', () => showScreen('matches'));
  $('#btn-predict').addEventListener('click', () => {
    if (state.currentFixture) {
      openPrediction(state.currentFixture.home.name, state.currentFixture.away.name);
    }
  });
  $('#btn-export').addEventListener('click', exportJson);
  $('#btn-copy').addEventListener('click', copyBreakdown);
}

bindEvents();
loadMatches().catch((err) => {
  $('#matches-list').innerHTML = `<div class="state-box">${err.message}</div>`;
});

const params = new URLSearchParams(window.location.search);
if (params.get('home') && params.get('away')) {
  loadMatches().then(() => openPrediction(params.get('home'), params.get('away')));
}
