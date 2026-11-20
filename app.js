'use strict';
/* Giełda od Zera: aplikacja edukacyjna oparta na metodologii pakietu trader
   (skaner, planer wyjścia, wehikuł czasu, menedżer budżetu, strażnik ryzyka). */

/* ========== 1. Narzędzia ========== */
const PL = 'pl-PL';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (x) => typeof x === 'number' && isFinite(x);
const fmtN = (x, d = 2) => (isNum(x) ? x.toLocaleString(PL, { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
const fmtP = (x, d = 1, sign = true) => (isNum(x) ? (sign && x > 0 ? '+' : '') + (x * 100).toLocaleString(PL, { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : '–');
const fmtPu = (x, d = 1) => fmtP(x, d, false);
const fmtM = (x, cur = 'PLN', d = 2) => (isNum(x) ? (cur === 'USD' ? (x < 0 ? '-' : '') + '$' + fmtN(Math.abs(x), d) : fmtN(x, d) + ' zł') : '–');
const fmtBig = (x, cur = 'PLN') => {
  if (!isNum(x)) return '–';
  const u = cur === 'USD' ? ' USD' : ' zł';
  if (x >= 1e12) return fmtN(x / 1e12, 2) + ' bln' + u;
  if (x >= 1e9) return fmtN(x / 1e9, 1) + ' mld' + u;
  if (x >= 1e6) return fmtN(x / 1e6, 1) + ' mln' + u;
  if (x >= 1e3) return fmtN(x / 1e3, 0) + ' tys.' + u;
  return fmtN(x, 0) + u;
};
const fmtD = (iso) => (iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '–');
const floor2 = (x) => Math.floor(x * 100 + 1e-7) / 100;
const round2 = (x) => Math.round(x * 100 + 1e-7) / 100;
const tdp = (t) => Math.max(0, Math.round(-Math.log10(t)));
const floorT = (x, t = 0.01) => +(Math.floor(x / t + 1e-7) * t).toFixed(tdp(t));
const roundT = (x, t = 0.01) => +(Math.round(x / t + 1e-7) * t).toFixed(tdp(t));
const fmtPx = (x, s) => fmtM(x, s.cur, s.tick < 0.01 && Math.abs(x) < 100 ? 4 : 2);
const fmtDur = (d) => {
  if (!isNum(d)) return '–';
  const r = Math.round(d);
  if (r < 62) return r + ' ' + (r === 1 ? 'dzień' : 'dni');
  const m = d / 30.44;
  if (m < 24) return Math.round(m) + ' mies.';
  return fmtN(d / 365.25, 1) + ' roku';
};
const fmtQty = (q, s) => (s && s.frac ? fmtN(q, 4) : String(q));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const uid = () => Math.random().toString(36).slice(2, 10);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const pctile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
const plural = (n, a, b, c) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ========== 2. Dane i wskaźniki ========== */
let DATA = null, BY = {}, FX = [];

function sma(a, n) {
  const o = new Array(a.length).fill(null); let s = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; }
  return o;
}
function rsiW(c, n = 14) {
  const o = new Array(c.length).fill(null); if (c.length <= n) return o;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const ch = c[i] - c[i - 1]; if (ch > 0) g += ch; else l -= ch; }
  g /= n; l /= n; o[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const ch = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(ch, 0)) / n; l = (l * (n - 1) + Math.max(-ch, 0)) / n;
    o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return o;
}
function atrW(h, l, c, n = 14) {
  const o = new Array(c.length).fill(null); let s = 0, a = null;
  for (let i = 1; i < c.length; i++) {
    const tr = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    if (i <= n) { s += tr; if (i === n) { a = s / n; o[i] = a; } } else { a = (a * (n - 1) + tr) / n; o[i] = a; }
  }
  return o;
}
function prep(s) {
  const b = s.bars;
  s.d = b.map((x) => x[0]); s.o = b.map((x) => x[1]); s.h = b.map((x) => x[2]);
  s.l = b.map((x) => x[3]); s.c = b.map((x) => x[4]); s.v = b.map((x) => x[5]);
  s.sma20 = sma(s.c, 20); s.sma50 = sma(s.c, 50); s.sma200 = sma(s.c, 200);
  s.rsi = rsiW(s.c, 14); s.atr = atrW(s.h, s.l, s.c, 14);
  s.last = s.c.length - 1; s.f = s.f || {};
  s.cls = s.cls || (s.m === 'PL' ? 'akcje-pl' : 'akcje-us');
  s.ppy = s.m === 'CR' ? 365 : 252;
  s.tick = s.tick || 0.01;
  s.hasVol = sum(s.v.slice(-20)) > 0;
  s.dmax = []; let mx = -Infinity;
  for (let i = 0; i < s.c.length; i++) { mx = Math.max(mx, s.c[i]); s.dmax.push(mx); }
  if (Array.isArray(s.wd) && Array.isArray(s.wc) && s.wd.length === s.wc.length && s.wd.length > 10) {
    const iso = (x) => new Date(x * 864e5).toISOString().slice(0, 10);
    s.wdate = s.wd.map(iso); s.wend = s.wd.map((x) => iso(x + 6)); s.wmax = [];
    let w = -Infinity; for (const c of s.wc) { w = Math.max(w, c); s.wmax.push(w); }
  } else { delete s.wd; delete s.wc; }
  delete s.bars;
}
const CLASSES = {
  'akcje-pl': 'Akcje GPW', 'akcje-us': 'Akcje USA', indeksy: 'Indeksy i rynki świata', 'sektory-us': 'Sektory USA',
  'branze-us': 'Branże USA', 'sektory-pl': 'Sektory GPW', surowce: 'Surowce', obligacje: 'Obligacje', krypto: 'Kryptowaluty', waluty: 'Waluty',
};
const MKT = { PL: 'GPW Warszawa', US: 'USA', CR: 'Kryptowaluty, notowane całą dobę' };
const isEquity = (s) => s.cls === 'akcje-pl' || s.cls === 'akcje-us';
const tradable = (s) => s.hasVol && !s.synthetic;
const flowAt = (s, i) => (s.cflow ? s.cflow[i] : clvAt(s, i) * dvAt(s, i));
const PL_SECTORS = {
  'PL-BANKI': ['Banki', ['PKO', 'PEO', 'MBK', 'ALR', 'BHW', 'MIL'], 'Banki z GPW.'],
  'PL-ENERGIA': ['Paliwa i energetyka', ['PKN', 'PGE', 'TPE', 'ENA'], 'Orlen i grupy energetyczne.'],
  'PL-SUROWCE': ['Surowce i chemia', ['KGH', 'JSW', 'ATT'], 'Miedź, węgiel koksowy i nawozy.'],
  'PL-GRY': ['Gry', ['CDR', 'TEN', 'PLW'], 'Producenci gier wideo.'],
  'PL-HANDEL': ['Handel i konsumpcja', ['LPP', 'DNP', 'PCO', 'ALE'], 'Sklepy i handel internetowy.'],
  'PL-BUDOWA': ['Budownictwo i deweloperzy', ['BDX', 'DOM', '1AT'], 'Budowa i mieszkania.'],
  'PL-FINANSE': ['Ubezpieczenia i finanse', ['PZU', 'XTB', 'KRU'], 'Finanse poza bankami.'],
  'PL-TELEKOM': ['Telekomunikacja i IT', ['CPS', 'OPL', 'ACP'], 'Łączność, media i informatyka.'],
  'PL-PRZEMYSL': ['Przemysł i dystrybucja', ['KTY', 'CAR'], 'Produkcja i hurt.'],
};
function buildComposite(id, name, ids, about, cal) {
  const mem = ids.map((x) => BY[x]).filter(Boolean);
  if (mem.length < 2 || !cal) return null;
  const maps = mem.map((m) => { const mp = new Map(); m.d.forEach((d, i) => mp.set(d, i)); return mp; });
  const bars = [], cflow = [], cdv = [];
  let lvl = 100;
  for (let t = 0; t < cal.d.length; t++) {
    const date = cal.d[t];
    let ro = 0, rh = 0, rl = 0, rc = 0, n = 0, F = 0, DV = 0;
    mem.forEach((m, k) => {
      const i = maps[k].get(date);
      if (i == null || i === 0) return;
      const pc = m.c[i - 1];
      ro += m.o[i] / pc; rh += m.h[i] / pc; rl += m.l[i] / pc; rc += m.c[i] / pc; n++;
      const dv = m.v[i] * m.c[i]; F += clvAt(m, i) * dv; DV += dv;
    });
    if (!n) { if (!bars.length) continue; ro = rh = rl = rc = 1; n = 1; }
    const p = lvl, o = (p * ro) / n, c = (p * rc) / n;
    const h = Math.max((p * rh) / n, o, c), l = Math.min((p * rl) / n, o, c);
    lvl = c;
    bars.push([date, o, h, l, c, c > 0 ? DV / c : 0]); cflow.push(F); cdv.push(DV);
  }
  return { s: id, y: id, n: name, cls: 'sektory-pl', sec: 'Sektor GPW (koszyk)', about: about + ' Koszyk liczony w aplikacji, równe wagi: ' + mem.map((m) => m.n).join(', ') + '.', m: 'PL', cur: 'PLN', members: mem.map((m) => m.s), synthetic: 1, bars, cflow, cdv };
}
function setData(d) {
  DATA = d; BY = {}; FX = d.fx || [];
  RRG_CACHE.clear(); Z_CACHE.clear();
  d.stocks = d.stocks.filter((s) => !s.synthetic);
  for (const s of d.stocks) { prep(s); BY[s.s] = s; }
  for (const [id, [name, ids, about]] of Object.entries(PL_SECTORS)) {
    const cs = buildComposite(id, name, ids, about, BY.PKO);
    if (cs) { prep(cs); BY[id] = cs; d.stocks.push(cs); }
  }
}
function fxAt(date) {
  if (!FX.length) return 4;
  let lo = 0, hi = FX.length - 1;
  if (date <= FX[0][0]) return FX[0][1];
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (FX[m][0] <= date) lo = m; else hi = m - 1; }
  return FX[lo][1];
}
const fxI = (s, i) => (s.cur === 'USD' ? fxAt(s.d[i]) : 1);

function trendOf(s, t) {
  const c = s.c[t], a = s.sma50[t], b = s.sma200[t];
  if (a == null || b == null) return 'brak';
  if (c > b && a > b) return 'up';
  if (c < b && a < b) return 'down';
  return 'mixed';
}
const TREND = { up: ['Wzrostowy', 'good'], down: ['Spadkowy', 'bad'], mixed: ['Mieszany', 'warn'], brak: ['Za mało danych', ''] };

function metrics(s, t = s.last) {
  if (t === s.last && s._m) return s._m;
  const out = metricsRaw(s, t);
  if (t === s.last) s._m = out;
  return out;
}
function metricsRaw(s, t) {
  const c = s.c, ch = (k) => (t - k >= 0 ? c[t] / c[t - k] - 1 : null), P = s.ppy;
  const f = Math.max(0, t - P + 1);
  let hi = -Infinity, lo = Infinity, hiC = -Infinity, peak = -Infinity, mdd = 0;
  for (let i = f; i <= t; i++) {
    hi = Math.max(hi, s.h[i]); lo = Math.min(lo, s.l[i]); hiC = Math.max(hiC, c[i]);
    peak = Math.max(peak, c[i]); mdd = Math.min(mdd, c[i] / peak - 1);
  }
  let su = 0, sq = 0, n = 0;
  for (let i = Math.max(1, f); i <= t; i++) { const r = Math.log(c[i] / c[i - 1]); su += r; sq += r * r; n++; }
  const vol = n > 2 ? Math.sqrt((sq - (su * su) / n) / (n - 1)) * Math.sqrt(P) : null;
  let to = 0, tn = 0;
  for (let i = Math.max(0, t - 19); i <= t; i++) { to += s.vu ? s.v[i] : c[i] * s.v[i]; tn++; }
  let maxGap = 0;
  for (let i = Math.max(1, t - 9); i <= t; i++) maxGap = Math.max(maxGap, Math.abs(s.o[i] / c[i - 1] - 1));
  return {
    price: c[t], d1: ch(1), w1: ch(P === 365 ? 7 : 5), m1: ch(Math.round(P / 12)), m3: ch(Math.round(P / 4)), m6: ch(Math.round(P / 2)), y1: ch(P), y3: ch(3 * P),
    ytd: (() => { const y = s.d[t].slice(0, 4); let k = t; while (k > 0 && s.d[k - 1].slice(0, 4) === y) k--; return k > 0 ? c[t] / c[k - 1] - 1 : null; })(),
    hi52: hi, lo52: lo, fromHi: c[t] / hiC - 1, mdd, vol, turnover: (to / tn) * fxI(s, t),
    rsi: s.rsi[t], atr: s.atr[t], atrPct: s.atr[t] / c[t], sma20: s.sma20[t], sma50: s.sma50[t], sma200: s.sma200[t],
    maxGap, trend: trendOf(s, t),
  };
}

/* Reguły skanera dziennego (z trader-scanner) plus trzy reguły kontekstu dla początkujących. */
const RULES = {
  breakout_20d: { n: 'Wybicie 20 dni', src: 'skaner', d: 'Ostatnie zamknięcie jest wyższe niż każde z 20 poprzednich.' },
  bull_flag: { n: 'Flaga byka', src: 'skaner', d: 'Wzrost o ponad 10% w ciągu 10 sesji, a potem 5 zamknięć w przedziale do 5%.' },
  reclaim_ma20: { n: 'Powrót nad średnią 20', src: 'skaner', d: 'Poprzednie zamknięcie pod średnią z 20 sesji, ostatnie nad nią.' },
  oversold: { n: 'Wyprzedanie (RSI < 30)', src: 'skaner', d: 'RSI z 14 sesji poniżej 30: kurs spadał szybko i mocno.' },
  oversold_bounce: { n: 'Odbicie z wyprzedania', src: 'skaner', d: 'Poprzedniego dnia RSI poniżej 30, ostatnie zamknięcie wyżej niż poprzednie.' },
  trend_up: { n: 'Trend wzrostowy', src: 'kontekst', d: 'Cena nad średnią z 200 sesji, a średnia z 50 sesji nad średnią z 200.' },
  near_high: { n: 'Blisko szczytu roku', src: 'kontekst', d: 'Zamknięcie najwyżej 5% pod najwyższym zamknięciem z 52 tygodni.' },
  deep_dd: { n: 'Głęboko pod szczytem', src: 'kontekst', d: 'Zamknięcie ponad 30% pod najwyższym zamknięciem z 52 tygodni.' },
  near_ath: { n: 'Blisko ATH', src: 'kontekst', d: 'Zamknięcie najwyżej 3% pod najwyższym zamknięciem w całej dostępnej historii.' },
};
function hiClose(s, t) { let m = -Infinity; for (let i = Math.max(0, t - s.ppy + 1); i <= t; i++) m = Math.max(m, s.c[i]); return m; }
function tagAt(s, t, k) {
  const c = s.c;
  switch (k) {
    case 'breakout_20d': if (t < 20) return false; for (let i = t - 20; i < t; i++) if (c[i] >= c[t]) return false; return true;
    case 'bull_flag': {
      if (t < 15) return false;
      if (!(c[t - 5] / c[t - 15] - 1 > 0.1)) return false;
      let mx = -Infinity, mn = Infinity;
      for (let i = t - 4; i <= t; i++) { mx = Math.max(mx, c[i]); mn = Math.min(mn, c[i]); }
      return (mx - mn) / mn <= 0.05;
    }
    case 'reclaim_ma20': return t >= 20 && s.sma20[t - 1] != null && c[t - 1] < s.sma20[t - 1] && c[t] > s.sma20[t];
    case 'oversold': return s.rsi[t] != null && s.rsi[t] < 30;
    case 'oversold_bounce': return t >= 1 && s.rsi[t - 1] != null && s.rsi[t - 1] < 30 && c[t] > c[t - 1];
    case 'trend_up': return trendOf(s, t) === 'up';
    case 'near_high': return t >= 60 && c[t] >= 0.95 * hiClose(s, t);
    case 'deep_dd': return t >= 60 && c[t] <= 0.7 * hiClose(s, t);
    case 'near_ath': return t >= 60 && c[t] >= 0.97 * athCloseAt(s, t);
  }
  return false;
}
const tagsAt = (s, t) => Object.keys(RULES).filter((k) => tagAt(s, t, k));

/* ========== 3. Plan transakcji: wyjście, wielkość, ryzyko ========== */
const STOP_RULES = {
  atr: { n: 'Wielokrotność ATR pod wejściem', unit: '× ATR', def: 2, step: 0.5 },
  pct: { n: 'Procent pod wejściem', unit: '%', def: 5, step: 0.5 },
  low20: { n: 'Pod minimum z 20 sesji', unit: null },
  sma50: { n: 'Pod średnią z 50 sesji', unit: null },
  price: { n: 'Własna cena stopu', unit: 'cena', step: 0.01 },
};
function calcStop(s, t, entry, rule, val) {
  let raw;
  if (rule === 'atr') raw = entry - val * s.atr[t];
  else if (rule === 'pct') raw = entry * (1 - val / 100);
  else if (rule === 'low20') { let m = Infinity; for (let i = Math.max(0, t - 19); i <= t; i++) m = Math.min(m, s.l[i]); raw = m - 0.01; }
  else if (rule === 'sma50') raw = s.sma50[t] == null ? NaN : s.sma50[t] - 0.01;
  else raw = +val;
  return floorT(raw, s.tick);
}
function stopRuleText(rule, val, s, t, entry, cur) {
  const m = (x) => fmtM(x, cur);
  if (rule === 'atr') return `wejście ${m(entry)} − ${fmtN(val, 1)} × ATR ${m(s.atr[t])}, zaokrąglone w dół`;
  if (rule === 'pct') return `wejście ${m(entry)} − ${fmtN(val, 1)}%, zaokrąglone w dół`;
  if (rule === 'low20') return 'grosz pod najniższą ceną z ostatnich 20 sesji';
  if (rule === 'sma50') return `grosz pod średnią z 50 sesji (${m(s.sma50[t])})`;
  return 'Twoja cena';
}
function exitPlan(entry, stop, R, tick = 0.01) {
  const o = { entry, stop, R, errors: [] };
  if (!isNum(entry) || entry <= 0) { o.errors.push('Podaj cenę wejścia większą od zera.'); return o; }
  if (!isNum(stop) || stop >= entry) {
    o.errors.push(`Stop musi być poniżej ceny wejścia. Przy tej regule wychodzi ${fmtN(stop)}, a wejście to ${fmtN(entry)}. Wybierz inną regułę albo niższy stop.`);
    return o;
  }
  if (stop <= 0) { o.errors.push('Stop wychodzi poniżej zera. Wybierz bliższy stop.'); return o; }
  o.risk = entry - stop; o.riskPct = o.risk / entry;
  if (o.risk < entry * 0.0005) { o.errors.push('Stop jest za blisko wejścia (mniej niż 0,05% ceny). Zwykły spread i szum wyrzucą Cię od razu.'); return o; }
  o.target = roundT(entry + R * o.risk, tick);
  if (o.target <= entry) { o.errors.push('Cel musi być powyżej ceny wejścia.'); return o; }
  o.rr = (o.target - entry) / o.risk;
  return o;
}
function sizeIt(plan, cfg, ctx) {
  const { cash, equity, fx } = ctx, q = ctx.qstep || 1;
  const fl = (x) => floorT(x, q);
  const e = plan.entry * fx, r = plan.risk * fx, comm = cfg.commission_pct / 100;
  const buffer = (equity * cfg.cash_buffer_pct) / 100;
  const posCap = (equity * cfg.max_position_pct) / 100;
  const L = [
    { k: 'loss', n: 'Maks. strata na transakcję', math: `${fmtM(cfg.max_loss)} / ${fmtM(r)} ryzyka na jednostkę`, sh: fl(cfg.max_loss / r) },
    { k: 'pos', n: 'Limit pozycji', math: `${fmtN(cfg.max_position_pct, 0)}% konta = ${fmtM(posCap)} / ${fmtM(e)}`, sh: fl(posCap / e) },
    { k: 'order', n: 'Maks. zlecenie', math: `${fmtM(cfg.max_order)} / ${fmtM(e)}`, sh: fl(cfg.max_order / e) },
    { k: 'cash', n: 'Gotówka po buforze', math: `(${fmtM(cash)} − ${fmtM(buffer)} bufora) / ${fmtM(e * (1 + comm))} z prowizją`, sh: fl(Math.max(0, cash - buffer) / (e * (1 + comm))) },
  ];
  let min = L[0];
  for (const x of L) if (x.sh < min.sh) min = x;
  const shares = Math.max(0, min.sh);
  return { limits: L, decider: min.k, shares, value: shares * e, maxLoss: shares * r, fee: shares * e * comm, fx, buffer };
}
function riskCheck(o) {
  const { cfg, plan, size, sym, cash, equity, isTraining, dayTrades = 0, dayRisk = 0, atr } = o;
  const C = [];
  const add = (ok, k, text, level) => C.push({ k, text, level: level || (ok ? 'ok' : 'no') });
  const fx = size.fx, value = size.value, loss = size.maxLoss;
  const has = size.shares > 0;
  add(has, o.frac ? 'Ilość większa od zera' : 'Co najmniej 1 akcja', has ? (o.frac ? `${fmtN(size.shares, 4)} jednostki.` : `${size.shares} ${plural(size.shares, 'akcja', 'akcje', 'akcji')}.`) : 'Przy Twoich limitach nie mieści się ani jedna jednostka. Stop jest za daleko, limit straty za mały albo jedna akcja kosztuje więcej niż Twój limit zlecenia.');
  add(plan.stop < plan.entry, 'Stop ustawiony', `Stop ${fmtN(plan.stop)} poniżej wejścia ${fmtN(plan.entry)}.`);
  add(loss <= cfg.max_loss + 1e-6, 'Strata przy stopie', `${o.frac ? fmtN(size.shares, 4) : size.shares} × ${fmtM(plan.risk * fx)} = ${fmtM(loss)} (limit ${fmtM(cfg.max_loss)})`);
  add(plan.rr >= cfg.min_rr - 1e-9, 'Zysk do ryzyka', `${fmtN(plan.rr, 2)} (minimum ${fmtN(cfg.min_rr, 1)})`);
  add(value <= (equity * cfg.max_position_pct) / 100 + 1e-6, 'Wielkość pozycji', `${fmtM(value)}, czyli ${fmtPu(value / equity)} konta (limit ${fmtN(cfg.max_position_pct, 0)}%)`);
  const after = cash - value - size.fee;
  add(after >= size.buffer - 1e-6, 'Bufor gotówki', `Po zakupie zostaje ${fmtM(after)} (bufor ${fmtM(size.buffer)})`);
  const okOrder = !has || (value >= cfg.min_order && value <= cfg.max_order + 1e-6);
  add(okOrder, 'Wielkość zlecenia', `${fmtM(value)} (od ${fmtM(cfg.min_order, 'PLN', 0)} do ${fmtM(cfg.max_order, 'PLN', 0)})`);
  const blocked = (cfg.blocked || '').toUpperCase().split(/[\s,;]+/).filter(Boolean);
  add(!blocked.includes(sym.toUpperCase()), 'Lista zablokowanych', blocked.includes(sym.toUpperCase()) ? `${sym} jest na Twojej liście zablokowanych.` : 'Spółka nie jest zablokowana.');
  if (isTraining) {
    add(dayTrades < cfg.max_trades_day, 'Transakcje dziś', `${dayTrades} z ${cfg.max_trades_day} dozwolonych`);
    add(dayRisk + loss <= cfg.max_daily_loss + 1e-6, 'Dzienny limit straty', `${fmtM(dayRisk)} już dziś + ${fmtM(loss)} = ${fmtM(dayRisk + loss)} (limit ${fmtM(cfg.max_daily_loss)})`);
  } else {
    add(true, 'Limity dzienne', 'Liczone w treningu, gdzie sesje mijają naprawdę. Tutaj sprawdzasz pojedynczy plan.', 'na');
  }
  if (isNum(atr) && plan.risk < 0.5 * atr) add(true, 'Szum rynku', `Stop jest bliżej niż pół dziennego ruchu (ATR ${fmtN(atr)}). Zwykłe wahania mogą go szybko trafić.`, 'wa');
  const pass = C.every((c) => c.level !== 'no');
  return { pass, checks: C };
}
function buildTrade(o) {
  const { s, t, entry, stopRule, stopVal, R, cfg } = o;
  const stop = calcStop(s, t, entry, stopRule, stopVal);
  const plan = exitPlan(entry, stop, R, s.tick);
  if (plan.errors.length) return { plan, ok: false };
  const fx = fxI(s, t);
  const size = sizeIt(plan, cfg, { cash: o.cash, equity: o.equity, fx, qstep: s.frac ? 0.0001 : 1 });
  const risk = riskCheck({ cfg, plan, size, sym: s.s, frac: !!s.frac, cash: o.cash, equity: o.equity, isTraining: o.isTraining, dayTrades: o.dayTrades, dayRisk: o.dayRisk, atr: s.atr[t] });
  return { plan, size, risk, fx, ok: risk.pass };
}

/* ========== 4. Wehikuł czasu: Monte Carlo i historia ========== */
function mcTrade({ s, t, entry, stop, target, H, poolN, reps = 10000, seed = 19 }) {
  const start = Math.max(1, t - poolN + 1);
  const pool = [];
  for (let i = start; i <= t; i++) { const pc = s.c[i - 1]; pool.push([s.o[i] / pc, s.h[i] / pc, s.l[i] / pc, s.c[i] / pc]); }
  const rnd = mulberry32(seed), risk = entry - stop, R = (target - entry) / risk;
  const closes = Array.from({ length: H + 1 }, () => new Float64Array(reps));
  let tg = 0, st = 0, ne = 0, green = 0, sumR = 0, gapStop = 0, gapTgt = 0, worstR = 0;
  const paths = [];
  for (let r = 0; r < reps; r++) {
    let p = entry, done = false, out = null, rr = 0;
    closes[0][r] = entry;
    for (let d = 1; d <= H; d++) {
      const k = pool[(rnd() * pool.length) | 0];
      const o = p * k[0], h = p * k[1], l = p * k[2], c = p * k[3];
      if (!done) {
        if (o <= stop) { done = true; out = 's'; rr = (o - entry) / risk; gapStop++; }
        else if (l <= stop) { done = true; out = 's'; rr = -1; }
        else if (o >= target) { done = true; out = 't'; rr = (o - entry) / risk; gapTgt++; }
        else if (h >= target) { done = true; out = 't'; rr = R; }
      }
      p = c; closes[d][r] = c;
    }
    if (!done) { out = 'n'; rr = (p - entry) / risk; }
    if (out === 't') tg++; else if (out === 's') st++; else ne++;
    if (out === 't' || (out === 'n' && p > entry)) green++;
    sumR += rr; worstR = Math.min(worstR, rr);
    if (r < 36) { const pa = []; for (let d = 0; d <= H; d++) pa.push(closes[d][r]); paths.push(pa); }
  }
  const band = { p5: [], p25: [], p50: [], p75: [], p95: [] };
  let final = null;
  for (let d = 0; d <= H; d++) {
    const a = closes[d].slice().sort();
    band.p5.push(pctile(a, 0.05)); band.p25.push(pctile(a, 0.25)); band.p50.push(pctile(a, 0.5));
    band.p75.push(pctile(a, 0.75)); band.p95.push(pctile(a, 0.95));
    if (d === H) final = a;
  }
  const lo = pctile(final, 0.01), hi = pctile(final, 0.99), nb = 24, bw = (hi - lo) / nb || 1;
  const bins = new Array(nb).fill(0);
  for (const v of final) { const b = Math.floor((v - lo) / bw); if (b >= 0 && b < nb) bins[b]++; }
  return {
    reps, seed, H, poolN: pool.length, entry, stop, target, R,
    tgt: tg / reps, stp: st / reps, nei: ne / reps, green: green / reps, avgR: sumR / reps, worstR,
    gapStop: gapStop / reps, gapTgt: gapTgt / reps,
    med: pctile(final, 0.5), q05: pctile(final, 0.05), q95: pctile(final, 0.95),
    band, paths, hist: { lo, bw, bins },
  };
}
function historyTest({ s, H, stopRule, stopVal, R, filter, upto }) {
  let n = 0, tg = 0, st = 0, ne = 0, sR = 0, gaps = 0;
  for (let i = 200; i <= upto - H; i++) {
    if (filter !== 'all' && !tagAt(s, i, filter)) continue;
    const entry = s.c[i], stop = calcStop(s, i, entry, stopRule, stopVal);
    if (!(stop < entry) || stop <= 0) continue;
    const risk = entry - stop, target = roundT(entry + R * risk, s.tick);
    let out = 'n', rr = 0;
    for (let j = i + 1; j <= i + H; j++) {
      const o = s.o[j], h = s.h[j], l = s.l[j];
      if (o <= stop) { out = 's'; rr = (o - entry) / risk; gaps++; break; }
      if (l <= stop) { out = 's'; rr = -1; break; }
      if (o >= target) { out = 't'; rr = (o - entry) / risk; break; }
      if (h >= target) { out = 't'; rr = R; break; }
    }
    if (out === 'n') rr = (s.c[i + H] - entry) / risk;
    n++; sR += rr; if (out === 't') tg++; else if (out === 's') st++; else ne++;
  }
  return { n, tg, st, ne, avgR: n ? sR / n : null, gaps, from: s.d[200], to: s.d[Math.max(200, upto - H)] };
}
function verdictOf(r) {
  const hit = r.tgt + r.stp;
  if (hit < 0.01) return { head: 'Za mało rozstrzygnięć', cls: 'warn', lines: [`Prawie żadna powtórka nie trafiła ani w cel, ani w stop w ${r.H} sesji. Wydłuż horyzont albo przybliż cel i stop.`] };
  const share = r.tgt / hit, be = 1 / (1 + r.R), diff = (share - be) * 100;
  let head, cls;
  if (Math.abs(diff) < 5) { head = Math.abs(r.R - 1) < 1e-9 ? 'Blisko rzutu monetą' : 'Blisko progu opłacalności'; cls = 'warn'; }
  else if (Math.abs(diff) < 15) { head = diff > 0 ? 'Lekko w stronę celu' : 'Lekko w stronę stopu'; cls = diff > 0 ? 'good' : 'bad'; }
  else { head = diff > 0 ? 'Wyraźnie w stronę celu' : 'Wyraźnie w stronę stopu'; cls = diff > 0 ? 'good' : 'bad'; }
  const lines = [`Cel pierwszy ${fmtPu(r.tgt)}, stop pierwszy ${fmtPu(r.stp)}. Przy celu ${fmtN(r.R, 1)}R cel musi przyjść pierwszy w ${fmtPu(be)} powtórek, które trafiły w którąś stronę. Przyszedł w ${fmtPu(share)}.`];
  if (r.nei > 0.4) lines.push(`${fmtPu(r.nei)} powtórek nie trafiło ani w cel, ani w stop w ${r.H} sesji. O nich decyduje cena na końcu.`);
  if ((diff >= 5 && r.avgR < 0) || (diff <= -5 && r.avgR > 0)) lines.push(`Średnie R (${fmtN(r.avgR, 2)}) wskazuje w drugą stronę przez powtórki bez rozstrzygnięcia i luki cenowe.`);
  return { head, cls, lines, share, be };
}
function annualStats(s) {
  const c = s.c, n = c.length - 1;
  const g = Math.pow(c[n] / c[0], 252 / n) - 1;
  let su = 0, sq = 0;
  for (let i = 1; i <= n; i++) { const r = Math.log(c[i] / c[i - 1]); su += r; sq += r * r; }
  const vol = Math.sqrt((sq - (su * su) / n) / (n - 1)) * Math.sqrt(252);
  return { mu: g, sigma: vol };
}
function mcLong({ init, monthly, years, mu, sigma, reps = 4000, seed = 7 }) {
  const rnd = mulberry32(seed);
  const m = (Math.log(1 + mu) - (sigma * sigma) / 2) / 12, sd = sigma / Math.sqrt(12);
  const Y = years, vals = Array.from({ length: Y + 1 }, () => new Float64Array(reps));
  let spare = null;
  const gauss = () => {
    if (spare != null) { const z = spare; spare = null; return z; }
    let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd();
    const rr = Math.sqrt(-2 * Math.log(u)); spare = rr * Math.sin(2 * Math.PI * v); return rr * Math.cos(2 * Math.PI * v);
  };
  for (let r = 0; r < reps; r++) {
    let v = init; vals[0][r] = v;
    for (let k = 1; k <= Y * 12; k++) { v = v * Math.exp(m + sd * gauss()) + monthly; if (k % 12 === 0) vals[k / 12][r] = v; }
  }
  const out = { p10: [], p25: [], p50: [], p75: [], p90: [], dep: [] };
  for (let y = 0; y <= Y; y++) {
    const a = vals[y].slice().sort();
    out.p10.push(pctile(a, 0.1)); out.p25.push(pctile(a, 0.25)); out.p50.push(pctile(a, 0.5));
    out.p75.push(pctile(a, 0.75)); out.p90.push(pctile(a, 0.9)); out.dep.push(init + monthly * 12 * y);
    if (y === Y) out.lossShare = a.filter((x) => x < init + monthly * 12 * Y).length / reps;
  }
  return out;
}

/* ========== 5. Rotacja kapitału: siła względna (RRG) i szacowane przepływy ========== */
const ROT = { smooth: 10, norm: 50, mom: 10 };
const ROT_GROUPS = {
  klasy: { n: 'Klasy aktywów', ids: ['SPY', 'ETFBW20TR', 'EFA', 'EEM', 'GLD', 'DBC', 'TLT', 'SHY', 'HYG', 'BTC', 'UUP'], bench: 'ACWI', d: 'Po jednym przedstawicielu każdej klasy: akcje USA, Polski, świata, złoto, surowce, obligacje, krypto i dolar.' },
  'sektory-us': { n: 'Sektory USA', cls: 'sektory-us', bench: 'SPY', d: '11 sektorów S&P 500 (fundusze SPDR).' },
  'branze-us': { n: 'Branże i tematy USA', cls: 'branze-us', bench: 'SPY', d: 'Węższe branże: półprzewodniki, biotechnologia, banki regionalne i inne.' },
  'sektory-pl': { n: 'Sektory GPW', cls: 'sektory-pl', bench: 'ETFBW20TR', d: 'Koszyki spółek z GPW z równymi wagami, policzone w aplikacji. Przepływy to suma przepływów spółek z koszyka.' },
  swiat: { n: 'Rynki świata', ids: ['SPY', 'QQQ', 'IWM', 'RSP', 'EFA', 'EEM', 'VGK', 'EWG', 'EWJ', 'MCHI', 'INDA', 'EWZ', 'EPOL'], bench: 'ACWI', d: 'Kraje, regiony i style rynku akcji.' },
  polska: { n: 'Polska na tle świata', ids: ['ETFBW20TR', 'ETFBM40TR', 'ETFBS80TR', 'EPOL'], bench: 'ACWI', d: 'Duże, średnie i małe spółki z GPW (przez ETF-y) oraz Polska widziana z USA, względem akcji świata.' },
  surowce: { n: 'Surowce', cls: 'surowce', bench: 'ACWI', d: 'Metale, energia i rolnictwo względem akcji świata.' },
  obligacje: { n: 'Obligacje', cls: 'obligacje', bench: 'BND', d: 'Krótkie, długie, inflacyjne, firmowe i polskie obligacje.' },
  krypto: { n: 'Kryptowaluty', cls: 'krypto', bench: 'BTC', d: 'Altcoiny względem bitcoina. Zmień benchmark na ACWI, żeby porównać krypto z akcjami.' },
  'akcje-us': { n: 'Akcje USA', cls: 'akcje-us', bench: 'SPY', d: 'Pojedyncze spółki z USA względem S&P 500.' },
  'akcje-pl': { n: 'Akcje GPW', cls: 'akcje-pl', bench: 'ETFBW20TR', d: 'Pojedyncze spółki z GPW względem WIG20TR.' },
};
const BENCHES = { ACWI: 'Akcje świata (ACWI)', SPY: 'S&P 500 (SPY)', ETFBW20TR: 'WIG20TR (ETF Beta)', BND: 'Obligacje USA (BND)', BTC: 'Bitcoin', SHY: 'Gotówka w USD (SHY)', DBC: 'Koszyk surowców (DBC)' };
const QUAD = {
  lead: ['Liderzy', 'good', 'Silniejsze od benchmarku i przewaga rośnie.'],
  weak: ['Słabnące', 'warn', 'Wciąż silniejsze od benchmarku, ale przewaga maleje.'],
  lag: ['Maruderzy', 'bad', 'Słabsze od benchmarku i dalej tracą.'],
  impr: ['Poprawiające się', 'accent', 'Słabsze od benchmarku, ale zaczynają odrabiać.'],
};
const quadOf = (r, m) => (r == null || m == null ? null : r >= 100 ? (m >= 100 ? 'lead' : 'weak') : m >= 100 ? 'impr' : 'lag');
function alignTo(a, b) {
  const out = new Array(b.c.length).fill(null); let j = -1;
  for (let i = 0; i < b.d.length; i++) { while (j + 1 < a.d.length && a.d[j + 1] <= b.d[i]) j++; if (j >= 0) out[i] = a.c[j]; }
  return out;
}
const RRG_CACHE = new Map();
function rrg(a, b) {
  const key = a.s + '|' + b.s;
  if (RRG_CACHE.has(key)) return RRG_CACHE.get(key);
  const ac = alignTo(a, b), n = b.c.length, rs = new Array(n).fill(null);
  for (let i = 0; i < n; i++) if (ac[i] != null) rs[i] = (100 * ac[i]) / b.c[i];
  const k = 2 / (ROT.smooth + 1), sm = new Array(n).fill(null); let e = null;
  for (let i = 0; i < n; i++) { if (rs[i] == null) { e = null; continue; } e = e == null ? rs[i] : e + k * (rs[i] - e); sm[i] = e; }
  const ratio = new Array(n).fill(null), mom = new Array(n).fill(null), N = ROT.norm;
  let s1 = 0, s2 = 0, len = 0;
  for (let i = 0; i < n; i++) {
    if (sm[i] == null) { s1 = 0; s2 = 0; len = 0; continue; }
    s1 += sm[i]; s2 += sm[i] * sm[i]; len++;
    if (len > N) { s1 -= sm[i - N]; s2 -= sm[i - N] * sm[i - N]; len = N; }
    if (len === N) { const mean = s1 / N, sd = Math.sqrt(Math.max(1e-12, s2 / N - mean * mean)); ratio[i] = 100 + (sm[i] - mean) / sd; }
  }
  for (let i = ROT.mom; i < n; i++) if (ratio[i] != null && ratio[i - ROT.mom] != null) mom[i] = 100 + (ratio[i] - ratio[i - ROT.mom]);
  const out = { rs, ratio, mom };
  RRG_CACHE.set(key, out);
  return out;
}
const clvAt = (s, i) => { const r = s.h[i] - s.l[i]; return r > 0 ? (s.c[i] - s.l[i] - (s.h[i] - s.c[i])) / r : 0; };
const dvAt = (s, i) => (s.vu ? s.v[i] : s.v[i] * s.c[i]) * fxI(s, i);
function cmfAt(s, t, n) { let a = 0, b = 0; for (let i = Math.max(0, t - n + 1); i <= t; i++) { a += clvAt(s, i) * s.v[i]; b += s.v[i]; } return b > 0 ? a / b : null; }
function flowStats(s, t = s.last) {
  if (!s.hasVol || t < 30) return null;
  if (s.cflow) {
    const F = s.cflow, D = s.cdv, rs = (a, x, y) => { let z = 0; for (let i = Math.max(0, x); i <= y; i++) z += a[i]; return z; };
    const cm = (tt, n) => { const dv = rs(D, tt - n + 1, tt); return dv > 0 ? rs(F, tt - n + 1, tt) / dv : null; };
    const avgC = rs(D, t - 20, t - 1) / 20;
    return { cmf5: cm(t, 5), cmf20: cm(t, 20), cmf20y: cm(t - 1, 20), cmf20w: cm(t - 5, 20), rvol: avgC > 0 ? D[t] / avgC : null, f1: F[t], f5: rs(F, t - 4, t), f20: rs(F, t - 19, t), avgDV: avgC };
  }
  let avg = 0; for (let i = t - 20; i < t; i++) avg += dvAt(s, i); avg /= 20;
  const fl = (k) => { let x = 0; for (let i = t - k + 1; i <= t; i++) x += clvAt(s, i) * dvAt(s, i); return x; };
  return { cmf5: cmfAt(s, t, 5), cmf20: cmfAt(s, t, 20), cmf20y: cmfAt(s, t - 1, 20), cmf20w: cmfAt(s, t - 5, 20), rvol: avg > 0 ? dvAt(s, t) / avg : null, f1: fl(1), f5: fl(5), f20: fl(20), avgDV: avg };
}
const Z_CACHE = new Map();
function z200(s) {
  if (Z_CACHE.has(s.s)) return Z_CACHE.get(s.s);
  const xs = [];
  for (let i = 0; i <= s.last; i++) if (s.sma200[i]) xs.push(s.c[i] / s.sma200[i] - 1);
  let z = null;
  if (xs.length >= 120) { const m = sum(xs) / xs.length, sd = Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1)); z = sd > 0 ? (xs[xs.length - 1] - m) / sd : null; }
  Z_CACHE.set(s.s, z);
  return z;
}
function groupMembers(gk, benchId) {
  const G = ROT_GROUPS[gk];
  const list = G.ids ? G.ids.map((id) => BY[id]).filter(Boolean) : DATA.stocks.filter((s) => s.cls === G.cls);
  return list.filter((s) => s.s !== benchId);
}
function rotRows(gk, benchId, tail = 'd') {
  const b = BY[benchId], tb = b.last;
  const rows = groupMembers(gk, benchId).map((s) => {
    const g = rrg(s, b), pts = [];
    const step = tail === 'w' ? 5 : 1, N = tail === 'w' ? 8 : 10;
    for (let k = N; k >= 0; k--) { const i = tb - k * step; if (i >= 0 && g.ratio[i] != null && g.mom[i] != null) pts.push([g.ratio[i], g.mom[i], i]); }
    const rel = (k) => (g.rs[tb] != null && g.rs[tb - k] != null ? g.rs[tb] / g.rs[tb - k] - 1 : null);
    return {
      s, r: g.ratio[tb], mo: g.mom[tb], r1: g.ratio[tb - 1], mo1: g.mom[tb - 1], mo5: g.mom[tb - 5],
      q0: quadOf(g.ratio[tb], g.mom[tb]), q1: quadOf(g.ratio[tb - 1], g.mom[tb - 1]), q5: quadOf(g.ratio[tb - 5], g.mom[tb - 5]),
      pts, m: metrics(s), fl: flowStats(s), rel1m: rel(21), rel6: rel(126), z: z200(s),
      relPE: isNum(s.f.pe) && b.f && isNum(b.f.pe) && s.f.pe > 0 ? s.f.pe / b.f.pe : null,
    };
  }).filter((x) => x.r != null);
  const rank = (key, out) => rows.filter((x) => x[key] != null).sort((a, c) => c[key] - a[key]).forEach((x, i) => { x[out] = i + 1; });
  rank('r', 'rank'); rank('r1', 'rank1');
  rows.forEach((x) => { x.dRank = x.rank && x.rank1 ? x.rank1 - x.rank : 0; });
  return { rows, b, tb };
}
function rotLists(rows) {
  const score = (x) => x.r - 100 + 2 * (x.mo - 100);
  const lead = rows.filter((x) => x.q0 === 'lead' && x.m.price > (x.m.sma50 ?? Infinity) && (!x.fl || x.fl.cmf20 > 0)).sort((a, b) => score(b) - score(a));
  const impr = rows.filter((x) => x.q0 === 'impr').sort((a, b) => b.mo - a.mo);
  const weak = rows.filter((x) => x.q0 === 'weak').sort((a, b) => a.mo - b.mo);
  const out = rows.filter((x) => (x.q0 === 'lag' || x.q0 === 'weak') && (x.fl ? x.fl.cmf20 < 0 : x.q0 === 'lag')).sort((a, b) => (a.fl?.cmf20 ?? 0) - (b.fl?.cmf20 ?? 0) || a.r - b.r);
  const cheap = rows
    .filter((x) => x.rel6 != null && x.rel6 < -0.05 && ((x.z != null && x.z < -1) || (x.relPE != null && x.relPE < 0.85) || x.m.fromHi < -0.2))
    .map((x) => ({ ...x, turning: x.q0 === 'impr' || (x.mo5 != null && x.mo > x.mo5 && (!x.fl || (x.fl.cmf5 ?? 0) > (x.fl.cmf20 ?? 0))) }))
    .sort((a, b) => Number(b.turning) - Number(a.turning) || a.rel6 - b.rel6);
  return { lead, impr, weak, out, cheap };
}

/* ========== 6. Szczyt wszech czasów (ATH) i cykle hossa/bessa ========== */
function athCloseAt(s, t) {
  let m = s.dmax[t];
  if (s.wend) {
    const d = s.d[t]; let lo = 0, hi = s.wend.length - 1, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (s.wend[mid] < d) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    if (k >= 0) m = Math.max(m, s.wmax[k]);
  }
  return m;
}
function athInfo(s) {
  if (s._ath) return s._ath;
  let p, d, ex, h0, full;
  if (s.ath && isNum(s.ath.p)) { p = s.ath.p; d = s.ath.d; ex = !!s.ath.ex; h0 = s.h0 || s.d[0]; full = true; }
  else { p = -Infinity; for (let i = 0; i <= s.last; i++) if (s.h[i] > p) { p = s.h[i]; d = s.d[i]; } ex = true; h0 = s.d[0]; full = false; }
  if (s.h[s.last] > p) { p = s.h[s.last]; d = s.d[s.last]; ex = true; }
  s._ath = { p, d, ex, h0, full, from: s.c[s.last] / p - 1, days: Math.round((Date.parse(s.d[s.last]) - Date.parse(d)) / 864e5) };
  return s._ath;
}
const CYCLE_TH = { obligacje: 0.1, waluty: 0.1, indeksy: 0.2, 'sektory-us': 0.2, 'branze-us': 0.2, 'sektory-pl': 0.2, 'akcje-pl': 0.3, 'akcje-us': 0.3, surowce: 0.3, krypto: 0.5 };
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
/* Cykl: spadek o co najmniej th od szczytu (bessa), dołek, powrót powyżej starego szczytu (nowe ATH),
   a hossa trwa od dołka do szczytu, z którego zaczyna się kolejna bessa. */
function cyclesOf(c, th) {
  const cyc = []; let peak = c[0], pi = 0, cur = null;
  for (let i = 1; i < c.length; i++) {
    if (c[i] > peak) {
      if (cur && cur.ri == null) cur.ri = i;
      peak = c[i]; pi = i;
    } else if ((!cur || cur.ri != null) && c[i] / peak - 1 <= -th) {
      cur = { pi, p: peak, ti: i, t: c[i], ri: null }; cyc.push(cur);
    } else if (cur && cur.ri == null && c[i] < cur.t) { cur.ti = i; cur.t = c[i]; }
  }
  cyc.forEach((x, k) => { if (x.ri != null) { x.topi = k + 1 < cyc.length ? cyc[k + 1].pi : pi; x.topDone = k + 1 < cyc.length; } });
  return { cyc, pi };
}
function cycleStats(s, th) {
  th = th || CYCLE_TH[s.cls] || 0.2;
  const d = s.wdate || s.d, c = s.wc || s.c, n = c.length;
  const { cyc, pi } = cyclesOf(c, th);
  const rows = cyc.map((x) => ({
    peakD: d[x.pi], peak: x.p, troughD: d[x.ti], trough: x.t, depth: x.t / x.p - 1, bearDays: dayDiff(d[x.pi], d[x.ti]),
    recD: x.ri != null ? d[x.ri] : null, recDays: x.ri != null ? dayDiff(d[x.ti], d[x.ri]) : null,
    topD: x.topi != null ? d[x.topi] : null, top: x.topi != null ? c[x.topi] : null,
    bullDays: x.topi != null ? dayDiff(d[x.ti], d[x.topi]) : null, bullDone: !!x.topDone, gain: x.topi != null ? c[x.topi] / x.t - 1 : null,
  }));
  const avg = (a) => (a.length ? sum(a) / a.length : null);
  const rec = rows.filter((r) => r.recDays != null).map((r) => r.recDays);
  const bull = rows.filter((r) => r.bullDone).map((r) => r.bullDays);
  const bear = rows.filter((r) => r.recD != null).map((r) => r.bearDays);
  const depth = rows.filter((r) => r.recD != null).map((r) => r.depth);
  const last = rows[rows.length - 1], lastD = d[n - 1], lastC = c[n - 1];
  let state;
  if (last && last.recD == null) {
    state = { k: 'down', peakD: last.peakD, peak: last.peak, troughD: last.troughD, trough: last.trough, depth: last.depth,
      fromTrough: lastC / last.trough - 1, toPeak: last.peak / lastC - 1, daysFromPeak: dayDiff(last.peakD, lastD), daysFromTrough: dayDiff(last.troughD, lastD) };
  } else {
    const st = last ? last.troughD : d[0], base = last ? last.trough : c[0];
    state = { k: 'up', start: st, days: dayDiff(st, lastD), gain: lastC / base - 1, peakD: d[pi], dd: lastC / c[pi] - 1, first: !last };
  }
  return { th, rows, avgRec: avg(rec), nRec: rec.length, avgBull: avg(bull), nBull: bull.length, avgBear: avg(bear), nBear: bear.length, avgDepth: avg(depth), state, from: d[0], weekly: !!s.wdate };
}

/* ========== Eksport dla testów w Node ========== */
if (typeof module !== 'undefined') {
  module.exports = { setData, metrics, tagsAt, tagAt, calcStop, exitPlan, sizeIt, riskCheck, buildTrade, mcTrade, historyTest, verdictOf, mcLong, annualStats, rrg, flowStats, rotRows, rotLists, athInfo, cycleStats, BYref: () => BY };
}

/* ========== 5. Interfejs ========== */
if (typeof document !== 'undefined') (function () {
  const main = document.getElementById('view');
  const statusEl = document.getElementById('status');
  const LS_KEY = 'gielda-od-zera-v1';

  const DEFAULT_CFG = { budget: 10000, cash_buffer_pct: 10, max_loss: 100, max_position_pct: 30, max_order: 5000, min_order: 100, min_rr: 1.5, max_trades_day: 3, max_daily_loss: 300, commission_pct: 0.2, blocked: '', profile: 'long', anim: 'auto' };
  const fresh = () => ({ v: 1, cfg: { ...DEFAULT_CFG }, lessons: {}, journal: [], sessions: [], plans: [], active: null, prog: {} });
  let S = fresh();

  const UI = {
    route: 'start',
    scan: { mkt: 'all', rules: [], sort: 'turnover' },
    an: { sym: 'PKO', range: '1R', ctype: 'line', sma: { 20: true, 50: true, 200: true }, th: null },
    plan: { sym: 'PKO', entry: null, stopRule: 'atr', stopVal: 2, R: 2, setup: '', note: '' },
    mc: { mode: 'trade', sym: 'PKO', entry: null, stopRule: 'atr', stopVal: 2, R: 2, H: 20, pool: 504, filter: 'all', seed: 19 },
    mcRes: null, histRes: null,
    lt: { init: 5000, monthly: 500, years: 15, preset: 'global', mu: 7, sigma: 16, acct: 'zwykly' },
    train: { sym: 'random', len: 60, blind: true, range: 126, buyOpen: false, buy: { stopRule: 'atr', stopVal: 2, R: 2, note: '' } },
    rot: { g: 'sektory-us', bench: null, tail: 'd', sel: null, sort: 'r' },
    lastSummary: null, gloss: '', chat: [], confirmReset: false,
  };

  /* ----- Zapis postępów: konto (db) z kopią w przeglądarce ----- */
  const Store = { ref: null, mode: 'local', timer: null, writing: false, again: false, cloudTried: false };
  function loadLocal() { try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function adopt(d) {
    if (!d || typeof d !== 'object') return;
    const f = fresh();
    S = { ...f, ...d, cfg: { ...f.cfg, ...(d.cfg || {}) }, prog: { ...(d.prog || {}) }, lessons: { ...(d.lessons || {}) } };
    for (const k of ['journal', 'sessions', 'plans']) if (!Array.isArray(S[k])) S[k] = [];
    if (S.active && (!BY[S.active.sym] || !isNum(S.active.i))) S.active = null;
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* tylko wygoda */ }
    if (!Store.ref) return;
    clearTimeout(Store.timer);
    Store.timer = setTimeout(flush, 900);
  }
  async function flush() {
    if (!Store.ref) return;
    if (Store.writing) { Store.again = true; return; }
    Store.writing = true; setStatus('saving');
    try { await Store.ref.set(JSON.parse(JSON.stringify(S))); setStatus('cloud'); }
    catch (e) { setStatus('cloud-err'); }
    Store.writing = false;
    if (Store.again) { Store.again = false; flush(); }
  }
  async function initCloud() {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      const ref = db.doc('data/users/' + id + '/state');
      const snap = await Promise.race([ref.get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
      Store.ref = ref; Store.mode = 'cloud';
      if (snap.exists) { adopt(snap.data()); try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* */ } render(); }
      else flush();
      setStatus('cloud');
    } catch (e) { Store.ref = null; }
  }
  function setStatus(m) {
    if (m) Store.mode = m;
    const map = { local: ['Postępy: ta przeglądarka', ''], cloud: ['Postępy zapisane na koncie', 'good'], saving: ['Zapisuję…', ''], 'cloud-err': ['Nie udało się zapisać na koncie', 'warn'] };
    const [t, c] = map[Store.mode] || map.local;
    const built = DATA?.built ? new Date(DATA.built) : null;
    const age = DATA?.as_of ? Math.floor((Date.now() - Date.parse(DATA.as_of)) / 864e5) : 0;
    const upd = built ? built.toLocaleString(PL, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const html = `<span class="chip" title="Pobrano: ${esc(upd)}. Dane odświeżają się automatycznie w dni robocze o 23:00.">Notowania do ${fmtD(DATA?.as_of)}</span>${age > 4 ? `<span class="chip warn">Dane sprzed ${age} dni</span>` : ''}<span class="chip ${c}">${t}</span>`;
    document.querySelectorAll('[data-status]').forEach((el) => { el.innerHTML = html; });
    void statusEl;
  }

  /* ----- Mentor AI (capability sample) ----- */
  let SAMPLE = null;
  (async () => {
    try { if (window.claude && typeof window.claude.use === 'function') SAMPLE = await window.claude.use('sample'); } catch (e) { SAMPLE = null; }
    showMentors();
  })();
  function showMentors() { document.querySelectorAll('[data-mentor]').forEach((m) => { m.hidden = !SAMPLE; }); }
  const MENTOR_RULES = `Jesteś cierpliwym mentorem osoby, która dopiero uczy się giełdy w Polsce. Zasady:
- Piszesz po polsku, prostym językiem i krótko: najwyżej około 180 słów. Możesz użyć krótkiej listy punktów.
- Tłumaczysz, co znaczą liczby i jakie są ryzyka. Każdy termin fachowy objaśniasz w kilku słowach.
- Nie mówisz, czy kupić, sprzedać albo trzymać. Nie podajesz celów cenowych ani prognoz. Nie obiecujesz zysków.
- Na końcu podajesz jeden konkretny krok, który warto sprawdzić samodzielnie (np. raport spółki, konto demo, kolejny trening).
- Dane pochodzą z darmowego, opóźnionego źródła i mogą zawierać błędy. Wspomnij o tym, jeśli jakaś liczba wygląda podejrzanie.`;
  function md(text) {
    const lines = esc(text).split(/\n/);
    let h = '', ul = false;
    for (let ln of lines) {
      ln = ln.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^\s*[-*•]\s+/.test(ln)) { if (!ul) { h += '<ul>'; ul = true; } h += '<li>' + ln.replace(/^\s*[-*•]\s+/, '') + '</li>'; }
      else {
        if (ul) { h += '</ul>'; ul = false; }
        if (ln.trim()) h += /^#{1,4}\s/.test(ln) ? '<p><b>' + ln.replace(/^#{1,4}\s/, '') + '</b></p>' : '<p>' + ln + '</p>';
      }
    }
    if (ul) h += '</ul>';
    return h;
  }
  const MENTOR_ERR = { not_granted: 'Mentor jest wyłączony, bo nie zezwolono na użycie Claude w tej aplikacji.', rate_limited: 'Za dużo pytań naraz. Spróbuj za chwilę.', cancelled: '' };
  function mentorBox(id, btnLabel, withInput) {
    return `<div class="mentor" data-mentor="${id}" ${SAMPLE ? '' : 'hidden'}>
      <div class="row between"><b>Mentor AI</b><span class="faint">Odpowiada Claude, korzystając z Twojego konta. Tłumaczy, ale nie mówi, co kupić.</span></div>
      <div class="row">
        <button class="btn sm primary" data-act="mentor" data-id="${id}">${btnLabel}</button>
        ${withInput ? `<input id="mq-${id}" placeholder="Albo zadaj własne pytanie…" style="flex:1 1 220px" aria-label="Pytanie do mentora">` : ''}
      </div>
      <div class="out" id="mo-${id}" aria-live="polite"></div>
    </div>`;
  }
  async function askMentor(id, btn) {
    if (!SAMPLE) return;
    const out = document.getElementById('mo-' + id);
    const q = document.getElementById('mq-' + id)?.value?.trim() || '';
    const ctx = MENTOR_CTX[id] ? MENTOR_CTX[id]() : '';
    let input;
    if (id === 'chat') {
      if (!q) { out.innerHTML = '<p class="faint">Wpisz pytanie.</p>'; return; }
      UI.chat.push({ role: 'user', content: q });
      UI.chat = UI.chat.slice(-8);
      input = [{ role: 'user', content: MENTOR_RULES + '\n\nZaraz zadam pytania o giełdę. Odpowiadaj zgodnie z tymi zasadami.' }, { role: 'assistant', content: 'Dobrze. O co chcesz zapytać?' }, ...UI.chat];
    } else {
      input = `${MENTOR_RULES}\n\nDane z aplikacji:\n${ctx}\n\n${q ? 'Pytanie użytkownika: ' + q : 'Zadanie: wyjaśnij te dane początkującemu.'}`;
    }
    btn.disabled = true; out.innerHTML = '<p class="faint">Myślę…</p>';
    try {
      const { text } = await SAMPLE(input, { onText: ({ text }) => { out.innerHTML = md(text); }, cache: id !== 'chat' });
      out.innerHTML = md(text);
      if (id === 'chat') { UI.chat.push({ role: 'assistant', content: text }); const i = document.getElementById('mq-chat'); if (i) i.value = ''; }
    } catch (e) {
      if (id === 'chat') UI.chat.pop();
      out.innerHTML = (e && e.text ? md(e.text) : '') + `<p class="faint">${esc(MENTOR_ERR[e?.code] ?? 'Mentor nie odpowiedział. Spróbuj ponownie później.')}</p>`;
      if (e?.code === 'not_granted') { SAMPLE = null; }
    } finally { btn.disabled = false; }
  }
  const MENTOR_CTX = {};

  /* ----- Wykresy (canvas) ----- */
  const RO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => { for (const e of es) e.target._chart?.draw(); }) : null;
  /* Wzrost wykresów: postęp p od 0 do 1, krzywa ease-out ze skilla taste. Raz na widok i klucz danych;
     przy ograniczeniu ruchu od razu stan końcowy. */
  const RMQ = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const ANIM_KEYS = new Map();
  const motionOK = () => { const m = S.cfg.anim || 'auto'; return m === 'on' || (m === 'auto' && !RMQ.matches); };
  function regChart(cv, chart, anim) {
    cv._chart = chart; chart.cv = cv; chart.p = 1;
    if (RO) RO.observe(cv);
    const seen = anim && anim.key != null && ANIM_KEYS.get(cv.id) === anim.key;
    if (anim && anim.key != null) ANIM_KEYS.set(cv.id, anim.key);
    if (anim && !seen && motionOK() && !document.hidden && (anim.from ?? 0) < 1) {
      const from = clamp(anim.from || 0, 0, 1), dur = anim.dur || 1100;
      let t0 = null;
      chart.p = from; chart.animating = true;
      const step = (ts) => {
        if (!cv.isConnected || chart.cancelAnim) { chart.animating = false; return; }
        if (t0 == null) t0 = ts;
        const q = Math.min(1, (ts - t0) / dur);
        chart.p = from + (1 - from) * easeOut(q); chart.draw();
        if (q < 1) requestAnimationFrame(step); else chart.animating = false;
      };
      requestAnimationFrame(step);
      // gdy przeglądarka wstrzyma klatki (ukryte okno, zrzut miniatury), wykres i tak dochodzi do stanu końcowego
      setTimeout(() => { if (chart.animating && cv.isConnected) { chart.cancelAnim = true; chart.animating = false; chart.p = 1; chart.draw(); } }, dur + 600);
    }
    chart.draw();
  }
  /* Etykieta z datą przy czole rosnącej linii. */
  function headLabel(ctx, C, text, x, y, xMax) {
    ctx.font = C.mono; const tw = ctx.measureText(text).width + 12;
    const lx = Math.min(x + 10, xMax - tw), ly = Math.max(12, y - 18);
    ctx.fillStyle = C.ink; roundRect(ctx, lx, ly - 9, tw, 18, 4); ctx.fill();
    ctx.fillStyle = C.bg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, lx + 6, ly + 0.5);
  }
  function redrawAll() { document.querySelectorAll('canvas').forEach((cv) => cv._chart?.draw()); }
  function colors() {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    return {
      ink: g('--ink'), ink2: g('--ink-2'), ink3: g('--ink-3'), line: g('--line'), surface: g('--surface'), bg: g('--bg'),
      accent: g('--accent'), good: g('--good'), bad: g('--bad'), warn: g('--warn'), c1: g('--c1'), c2: g('--c2'), c3: g('--c3'),
      goodBg: g('--good-bg'), badBg: g('--bad-bg'), warnBg: g('--warn-bg'), accent2: g('--accent-2'),
      s1: g('--seq-1'), s2: g('--seq-2'), s3: g('--seq-3'), s4: g('--seq-4'),
      mono: '11px "JetBrains Mono", ui-monospace, Consolas, monospace', sans: '12px "Host Grotesk", system-ui, sans-serif',
    };
  }
  function fit(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function niceTicks(lo, hi, count) {
    const span = hi - lo || Math.abs(hi) || 1, raw = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw))), nrm = raw / mag;
    const step = (nrm < 1.5 ? 1 : nrm < 3 ? 2 : nrm < 7 ? 5 : 10) * mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return { ticks: out, step };
  }
  const tickDec = (step) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);
  function yGrid(ctx, C, ticks, step, Y, x0, x1, fmt) {
    ctx.font = C.mono; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineWidth = 1;
    for (const t of ticks) {
      const y = Math.round(Y(t)) + 0.5;
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = C.ink3; ctx.fillText(fmt ? fmt(t) : fmtN(t, tickDec(step)), x1 + 8, y);
    }
  }
  function tagLabel(ctx, C, text, x, y, bg, fg, w) {
    ctx.font = C.mono; const tw = Math.max(w || 0, ctx.measureText(text).width + 10);
    ctx.fillStyle = bg; roundRect(ctx, x, y - 9, tw, 18, 4); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 5, y + 0.5);
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const MON = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  function showTip(tip, cv, x, html, y) {
    tip.innerHTML = html; tip.hidden = false;
    const bw = cv.clientWidth, tw = tip.offsetWidth;
    tip.style.left = (x + 16 + tw > bw ? Math.max(0, x - tw - 16) : x + 16) + 'px';
    tip.style.top = (y == null ? 8 : clamp(y + 14, 0, Math.max(0, cv.clientHeight - tip.offsetHeight))) + 'px';
  }
  const fmtSigned = (x) => (isNum(x) ? (x < 0 ? '−' : '+') + fmtBig(Math.abs(x)) : '–');

  /* Wykres rotacji (RRG): siła względna i jej pęd. Ogony rosną od najstarszego punktu do dziś. */
  function rrgChart(cv, rows, sel, key) {
    const tip = cv.parentElement.querySelector('.tip');
    let heads = [];
    const chart = {
      hover: null,
      draw() {
        if (!cv.isConnected) return;
        const { ctx, w, h } = fit(cv), C = colors();
        const pad = { l: 30, r: 12, t: 12, b: 30 };
        let hx = 1.2, hy = 0.6;
        for (const x of rows) for (const p of x.pts) { hx = Math.max(hx, Math.abs(p[0] - 100)); hy = Math.max(hy, Math.abs(p[1] - 100)); }
        hx *= 1.18; hy *= 1.18;
        const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
        const X = (v) => pad.l + ((v - 100 + hx) / (2 * hx)) * pw;
        const Y = (v) => pad.t + ((100 + hy - v) / (2 * hy)) * ph;
        const cx = X(100), cy = Y(100);
        const Q = [
          [cx, pad.t, pad.l + pw - cx, cy - pad.t, C.goodBg, 'Liderzy', 'r', 't'],
          [cx, cy, pad.l + pw - cx, pad.t + ph - cy, C.warnBg, 'Słabnące', 'r', 'b'],
          [pad.l, cy, cx - pad.l, pad.t + ph - cy, C.badBg, 'Maruderzy', 'l', 'b'],
          [pad.l, pad.t, cx - pad.l, cy - pad.t, C.accent2, 'Poprawiające się', 'l', 't'],
        ];
        ctx.font = '600 12px "Host Grotesk", system-ui, sans-serif';
        for (const [x, y, ww, hh, bg, label, ax, ay] of Q) {
          ctx.fillStyle = bg; ctx.fillRect(x, y, ww, hh);
          ctx.fillStyle = C.ink2; ctx.textAlign = ax === 'r' ? 'right' : 'left'; ctx.textBaseline = ay === 't' ? 'top' : 'bottom';
          ctx.fillText(label, ax === 'r' ? x + ww - 8 : x + 8, ay === 't' ? y + 6 : y + hh - 6);
        }
        ctx.strokeStyle = C.ink3; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, pad.t); ctx.lineTo(Math.round(cx) + 0.5, pad.t + ph); ctx.moveTo(pad.l, Math.round(cy) + 0.5); ctx.lineTo(pad.l + pw, Math.round(cy) + 0.5); ctx.stroke();
        ctx.font = C.sans; ctx.fillStyle = C.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('Siła względna →', pad.l + pw / 2, h - 6);
        ctx.save(); ctx.translate(12, pad.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText('Pęd siły →', 0, 0); ctx.restore();
        heads = [];
        const isOn = (x) => x.s.s === sel || x.s.s === this.hover;
        const order = rows.slice().sort((a, b) => Number(isOn(a)) - Number(isOn(b)));
        const pr = this.p ?? 1;
        for (const x of order) {
          if (!x.pts.length) continue;
          const on = isOn(x), m = x.pts.length - 1, kf = pr * m, k = Math.floor(kf), fr = kf - k;
          const hp = k < m ? [x.pts[k][0] + (x.pts[k + 1][0] - x.pts[k][0]) * fr, x.pts[k][1] + (x.pts[k + 1][1] - x.pts[k][1]) * fr] : x.pts[m];
          ctx.beginPath(); ctx.moveTo(X(x.pts[0][0]), Y(x.pts[0][1]));
          for (let i = 1; i <= k; i++) ctx.lineTo(X(x.pts[i][0]), Y(x.pts[i][1]));
          ctx.lineTo(X(hp[0]), Y(hp[1]));
          ctx.strokeStyle = on ? C.accent : C.ink3; ctx.globalAlpha = on ? 1 : 0.5; ctx.lineWidth = on ? 2.2 : 1.2; ctx.lineJoin = 'round'; ctx.stroke();
          ctx.fillStyle = on ? C.accent : C.ink3;
          for (let i = 0; i <= Math.min(k, m - 1); i++) { ctx.beginPath(); ctx.arc(X(x.pts[i][0]), Y(x.pts[i][1]), on ? 2.4 : 1.8, 0, Math.PI * 2); ctx.fill(); }
          ctx.globalAlpha = 1;
          const px = X(hp[0]), py = Y(hp[1]), q = quadOf(hp[0], hp[1]) || x.q0;
          ctx.fillStyle = { lead: C.good, weak: C.warn, lag: C.bad, impr: C.accent }[q] || C.ink3;
          ctx.strokeStyle = C.surface; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(px, py, on ? 7 : 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.font = (on ? '600 ' : '500 ') + '11px "JetBrains Mono", ui-monospace, monospace';
          ctx.fillStyle = C.ink; const right = px > pad.l + pw - 80;
          ctx.textAlign = right ? 'right' : 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText(lab(x.s), px + (right ? -8 : 8), py - 4);
          heads.push({ id: x.s.s, x: px, y: py });
        }
      },
    };
    const pick = (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 18 * 18;
      for (const hd of heads) { const d = (hd.x - x) ** 2 + (hd.y - y) ** 2; if (d < bd) { bd = d; best = hd; } }
      return { best, x, y };
    };
    cv.addEventListener('pointermove', (e) => {
      if ((chart.p ?? 1) < 1) return;
      const { best, x, y } = pick(e), id = best ? best.id : null;
      if (id !== chart.hover) { chart.hover = id; chart.draw(); }
      if (best) showTip(tip, cv, x, rotTip(rows.find((z) => z.s.s === id)), y); else tip.hidden = true;
      cv.style.cursor = best ? 'pointer' : 'default';
    });
    cv.addEventListener('pointerleave', () => { chart.hover = null; tip.hidden = true; chart.draw(); });
    cv.addEventListener('click', (e) => { const { best } = pick(e); if (best) ACT['rot-sel']({ dataset: { sym: best.id } }); });
    regChart(cv, chart, { key, dur: 1200 });
  }
  function rotTip(x) {
    if (!x) return '';
    return `<b>${esc(lab(x.s))}</b> ${x.s.synthetic ? '' : '<span class="muted">' + esc(x.s.n) + '</span>'}<br>${QUAD[x.q0][0]}<br>
      <span class="muted">Siła</span> ${fmtN(x.r, 2)} · <span class="muted">Pęd</span> ${fmtN(x.mo, 2)}<br>
      <span class="muted">1 mies.</span> ${fmtP(x.m.m1)} · <span class="muted">vs benchmark</span> ${fmtP(x.rel1m)}<br>
      <span class="muted">Napływ (CMF 20)</span> ${x.fl ? fmtN(x.fl.cmf20, 2) : 'brak wolumenu'}`;
  }
  /* Cała historia: skala logarytmiczna, bessy zacienione, ATH narastająco.
     Rośnie przy otwarciu; „Odtwórz” przewija całą historię z bieżącą datą, ceną i odległością od ATH. */
  function historyChart(cv, s, CS) {
    const tip = cv.parentElement.querySelector('.tip'), g = {};
    const d = s.wdate || s.d, c = s.wc || s.c, n = c.length, a = athInfo(s);
    const rmax = []; let mx = -Infinity; for (const v of c) { mx = Math.max(mx, v); rmax.push(mx); }
    const idxOf = (date) => { let k = 0; while (k + 1 < n && d[k + 1] <= date) k++; return k; };
    const shades = CS.rows.map((r) => [idxOf(r.peakD), r.recD ? idxOf(r.recD) : n - 1]);
    const athI = idxOf(a.d);
    const rd = { d: document.getElementById('ath-rd-date'), p: document.getElementById('ath-rd-price'), a: document.getElementById('ath-rd-dd') };
    const chart = {
      hover: null,
      draw() {
        if (!cv.isConnected) return;
        const { ctx, w, h } = fit(cv), C = colors();
        const padL = 4, padR = 66, padT = 10, padB = 22, plotW = w - padL - padR, pH = h - padT - padB;
        const X = (k) => padL + (k / Math.max(1, n - 1)) * plotW; Object.assign(g, { padL, plotW });
        const lo = Math.min(...c) * 0.92, hi = Math.max(Math.max(...c), a.p) * 1.06, L = Math.log;
        const Y = (v) => padT + ((L(hi) - L(v)) / (L(hi) - L(lo))) * pH;
        const kf = (this.p ?? 1) * (n - 1), k = Math.round(kf);
        ctx.fillStyle = C.badBg;
        for (const [x0, x1] of shades) if (x0 <= k) ctx.fillRect(X(x0), padT, Math.max(1, X(Math.min(x1, k)) - X(x0)), pH);
        let ticks = [];
        for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= lo && v <= hi) ticks.push(v); }
        if (ticks.length > 7) ticks = ticks.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9);
        if (ticks.length < 3) ticks = niceTicks(lo, hi, 4).ticks.filter((v) => v > 0);
        yGrid(ctx, C, ticks, 1, Y, padL, w - padR, (t) => fmtN(t, t < 10 ? 2 : 0));
        ctx.font = C.mono; ctx.fillStyle = C.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        let lastX = -1e9;
        for (let i = 1; i <= k; i++) {
          if (d[i].slice(0, 4) === d[i - 1].slice(0, 4)) continue;
          const x = X(i); if (x - lastX < 40 || x > w - padR - 14) continue;
          ctx.fillText(d[i].slice(0, 4), x, h - padB / 2); lastX = x;
        }
        ctx.beginPath(); for (let i = 0; i <= k; i++) i ? ctx.lineTo(X(i), Y(rmax[i])) : ctx.moveTo(X(i), Y(rmax[i]));
        ctx.strokeStyle = C.good; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); for (let i = 0; i <= k; i++) i ? ctx.lineTo(X(i), Y(c[i])) : ctx.moveTo(X(i), Y(c[i]));
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.stroke();
        const done = k >= n - 1;
        if (done) { ctx.fillStyle = C.good; ctx.strokeStyle = C.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(athI), Y(Math.min(a.p, Math.max(c[athI], lo))), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = C.accent; ctx.strokeStyle = C.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(k), Y(c[k]), 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const ay = Math.round(Y(done ? a.p : rmax[k])) + 0.5;
        tagLabel(ctx, C, 'ATH', w - padR + 2, ay, C.good, C.surface, padR - 4);
        const cy = Y(c[k]); if (Math.abs(cy - ay) > 18) tagLabel(ctx, C, fmtN(c[k], c[k] < 10 ? 2 : 0), w - padR + 2, cy, C.accent, C.surface, padR - 4);
        if (!done) headLabel(ctx, C, fmtD(d[k]), X(k), cy, w - padR);
        if (rd.d) {
          const dd = c[k] / rmax[k] - 1;
          rd.d.textContent = fmtD(d[k]); rd.p.textContent = fmtPx(c[k], s);
          rd.a.textContent = dd > -0.001 ? 'nowy szczyt' : fmtP(dd); rd.a.className = dd > -0.001 ? 'pos' : 'neg';
        }
        if (this.hover != null && done) { const x = Math.round(X(this.hover)) + 0.5; ctx.strokeStyle = C.ink3; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + pH); ctx.stroke(); ctx.setLineDash([]); }
      },
      tipHtml(k) {
        const dd = c[k] / rmax[k] - 1;
        return `<b>${s.wdate ? 'Tydzień od ' : ''}${fmtD(d[k])}</b><br>Zamknięcie ${fmtPx(c[k], s)}<br><span class="${dd < -0.001 ? 'neg' : 'pos'}">${dd < -0.001 ? fmtP(dd) + ' od ówczesnego szczytu' : 'nowy szczyt'}</span>`;
      },
    };
    bindHover(cv, tip, chart, (x) => { const k = Math.round(((x - g.padL) / g.plotW) * (n - 1)); return k < 0 || k >= n ? null : k; });
    regChart(cv, chart, { key: 'ath:' + s.s + ':' + CS.th, dur: 1200 });
    const btn = document.getElementById('ath-play');
    if (btn) {
      const years = Math.max(1, Math.round((Date.parse(d[n - 1]) - Date.parse(d[0])) / 31557600000));
      const idle = `▶ Odtwórz ${years} ${plural(years, 'rok', 'lata', 'lat')}`;
      btn.textContent = idle;
      let raf = 0, playing = false, from = 0, t0 = null;
      const dur = clamp(n * 4, 3500, 8000);
      const stop = () => { playing = false; cancelAnimationFrame(raf); };
      btn.addEventListener('click', () => {
        if (playing) { stop(); from = chart.p; btn.textContent = '▶ Wznów'; return; }
        chart.cancelAnim = true;
        if (chart.p >= 1) from = 0;
        playing = true; t0 = null; btn.textContent = '❚❚ Pauza';
        const step = (ts) => {
          if (!cv.isConnected || !playing) return;
          if (t0 == null) t0 = ts;
          chart.p = Math.min(1, from + (ts - t0) / dur);
          chart.draw();
          if (chart.p < 1) raf = requestAnimationFrame(step); else { playing = false; from = 0; btn.textContent = idle; }
        };
        raf = requestAnimationFrame(step);
      });
    }
  }
  function athSection(s) {
    const a = athInfo(s), defTh = CYCLE_TH[s.cls] || 0.2, th = UI.an.th || defTh, CS = cycleStats(s, th), st = CS.state;
    const f = (x) => fmtPx(x, s), pct = (x) => fmtN(x * 100, 0) + '%';
    const stateCard = st.k === 'down'
      ? `<div class="metric"><span class="t">Stan cyklu ${chip(st.fromTrough < 0.05 ? 'bessa trwa' : 'odrabianie strat', st.fromTrough < 0.05 ? 'bad' : 'warn')}</span><span class="v">${fmtP(st.fromTrough)} <span class="faint" style="font-size:13px">od dołka</span></span><span class="x">Najwyższe zamknięcie tygodnia ${fmtD(st.peakD)}, dołek ${fmtD(st.troughD)} (${fmtP(st.depth)}). Do tamtego zamknięcia brakuje ${fmtP(st.toPeak)}. Spadek zaczął się ${fmtDur(st.daysFromPeak)} temu, odbicie trwa ${fmtDur(st.daysFromTrough)}.</span></div>`
      : `<div class="metric"><span class="t">Stan cyklu ${chip(st.first ? 'bez pełnej bessy w danych' : 'hossa', 'good')}</span><span class="v pos">${fmtP(st.gain)} <span class="faint" style="font-size:13px">od dołka</span></span><span class="x">${st.first ? 'Od początku danych nie było spadku o ' + pct(th) + '.' : `Hossa trwa od dołka ${fmtD(st.start)}, czyli ${fmtDur(st.days)}.`} ${st.dd < -0.03 ? `Teraz ${fmtP(st.dd)} pod szczytem, to jeszcze mniej niż próg bessy (${pct(th)}).` : 'Cena jest przy szczycie.'}</span></div>`;
    const rows = CS.rows.slice().reverse().slice(0, 12);
    return `<section class="stack-lg">
      <div class="row between"><h2>Szczyt wszech czasów i cykle</h2>
        <div class="row"><span class="faint">Próg bessy</span>${seg('an-th', [[0.1, '10%'], [0.2, '20%'], [0.3, '30%'], [0.5, '50%']], th)}</div></div>
      <div class="grid g3">
        <div class="metric"><span class="t">Od ATH</span><span class="v ${a.from > -0.03 ? 'pos' : 'neg'}">${fmtP(a.from)}</span><span class="x">Najwyższa cena w historii: ${f(a.p)}. ${a.from > -0.03 ? 'Cena jest przy szczycie wszech czasów.' : `Do szczytu brakuje ${fmtP(1 / (1 + a.from) - 1)}.`}</span></div>
        <div class="metric"><span class="t">Kiedy było ATH</span><span class="v">${fmtD(a.d)}</span><span class="x">${a.days < 7 ? 'W ostatnich dniach.' : fmtDur(a.days) + ' temu.'}${a.ex ? '' : ' Dzień w przybliżeniu (dane tygodniowe).'} ${a.full ? `Historia notowań od ${fmtD(a.h0)}.` : 'Tylko 5 lat danych, bo to koszyk liczony w aplikacji.'}</span></div>
        ${stateCard}
        <div class="metric"><span class="t">Średnio od dołka do ATH</span><span class="v">${fmtDur(CS.avgRec)}</span><span class="x">Czas od dołka bessy do pobicia poprzedniego szczytu. ${CS.nRec ? `Średnia z ${CS.nRec} ${plural(CS.nRec, 'cyklu', 'cykli', 'cykli')}.` : 'Brak zakończonych cykli w danych.'}${st.k === 'down' ? ` Obecne odbicie trwa ${fmtDur(st.daysFromTrough)}.` : ''}</span></div>
        <div class="metric"><span class="t">Średnia hossa: od dołka do szczytu</span><span class="v">${fmtDur(CS.avgBull)}</span><span class="x">Od dołka do szczytu, z którego zaczęła się kolejna bessa. ${CS.nBull ? `Średnia z ${CS.nBull} ${plural(CS.nBull, 'cyklu', 'cykli', 'cykli')}.` : 'Brak pełnych hoss w danych.'}${st.k === 'up' && !st.first ? ` Obecna trwa ${fmtDur(st.days)}.` : ''}</span></div>
        <div class="metric"><span class="t">Średnia bessa: od szczytu do dołka</span><span class="v">${fmtDur(CS.avgBear)}</span><span class="x">${CS.nBear ? `Średni spadek ${fmtP(CS.avgDepth)}, ${CS.nBear} ${plural(CS.nBear, 'bessa', 'bessy', 'bess')}.` : 'Brak zakończonych bess w danych.'}</span></div>
      </div>
      <div class="card stack">
        <div class="row between"><h3>Cała historia</h3><button type="button" class="btn primary sm" id="ath-play">▶ Odtwórz</button></div>
        <div class="row mono" style="gap:18px;font-size:13px;color:var(--ink-2)"><span>${CS.weekly ? 'Tydzień' : 'Dzień'} <b id="ath-rd-date" style="color:var(--ink);font-weight:500"></b></span><span>Kurs <b id="ath-rd-price" style="color:var(--ink);font-weight:500"></b></span><span>Od ATH <b id="ath-rd-dd"></b></span></div>
        ${chartBox('ath-chart', 300)}
        <div class="legend"><span><i style="background:var(--accent)"></i>cena (${CS.weekly ? 'tygodniowo' : 'dziennie'}, skala logarytmiczna)</span><span><i style="background:var(--bad-bg);height:10px"></i>bessa i odrabianie</span><span><i style="background:var(--good)"></i>ATH narastająco</span></div>
        <p class="faint">Skala logarytmiczna: ten sam odstęp w pionie oznacza ten sam procent zmiany, więc dawne i obecne ruchy da się porównać.</p>
      </div>
      ${rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Szczyt</th><th>Dołek</th><th class="r">Spadek</th><th class="r">Bessa trwała</th><th>Powrót do ATH</th><th class="r">Od dołka do ATH</th><th>Szczyt hossy</th><th class="r">Hossa trwała</th><th class="r">Wzrost od dołka</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td class="num">${fmtD(r.peakD)}</td><td class="num">${fmtD(r.troughD)}</td><td class="r num neg">${fmtP(r.depth, 0)}</td><td class="r num">${fmtDur(r.bearDays)}</td>
          <td class="num">${r.recD ? fmtD(r.recD) : '<span class="faint">jeszcze nie</span>'}</td><td class="r num">${r.recD ? fmtDur(r.recDays) : '–'}</td>
          <td class="num">${r.topD ? fmtD(r.topD) + (r.bullDone ? '' : ' <span class="faint">(trwa)</span>') : '–'}</td><td class="r num">${r.topD ? fmtDur(r.bullDays) : '–'}</td><td class="r num pos">${r.topD ? fmtP(r.gain, 0) : '–'}</td></tr>`).join('')}</tbody>
      </table></div>` : `<p class="muted">Od ${fmtD(CS.from)} nie było spadku o ${pct(th)} lub więcej. Zmień próg, żeby zobaczyć mniejsze cykle.</p>`}
      <p class="faint">Bessa to spadek o co najmniej ${pct(th)} od szczytu (domyślnie ${pct(defTh)} dla tej klasy aktywów). Cykle liczone są z cen zamknięcia${CS.weekly ? ' tygodniowych od ' + fmtD(CS.from) : ' dziennych z 5 lat'}, bez dywidend. Kilka cykli to bardzo mała próba: średnia nie mówi, kiedy skończy się obecny cykl.</p>
    </section>`;
  }
  /* Prosta linia w czasie (siła względna). Rośnie od lewej. */
  function lineChart(cv, s, i0, ys, base, key) {
    const tip = cv.parentElement.querySelector('.tip'), g = {};
    const chart = {
      hover: null,
      draw() {
        if (!cv.isConnected) return;
        const { ctx, w, h } = fit(cv), C = colors();
        const padL = 4, padR = 58, padT = 10, padB = 22, n = ys.length, plotW = w - padL - padR, pH = h - padT - padB;
        const X = (k) => padL + (k / Math.max(1, n - 1)) * plotW; Object.assign(g, { padL, plotW, n });
        let lo = Math.min(base, ...ys.filter(isNum)), hi = Math.max(base, ...ys.filter(isNum)); const sp = hi - lo || 1; lo -= sp * 0.08; hi += sp * 0.08;
        const Y = (v) => padT + ((hi - v) / (hi - lo)) * pH;
        const { ticks, step } = niceTicks(lo, hi, Math.max(3, Math.round(pH / 50)));
        yGrid(ctx, C, ticks, step, Y, padL, w - padR);
        ctx.strokeStyle = C.ink3; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(padL, Y(base)); ctx.lineTo(w - padR, Y(base)); ctx.stroke(); ctx.setLineDash([]);
        const kf = (this.p ?? 1) * (n - 1), ke = Math.floor(kf);
        ctx.font = C.mono; ctx.fillStyle = C.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; let lastX = -1e9;
        for (let k = 1; k <= ke; k++) { const a = s.d[i0 + k - 1], b = s.d[i0 + k]; if (a.slice(5, 7) === b.slice(5, 7)) continue; const x = X(k); if (x - lastX < 56 || x > w - padR - 14) continue; const mi = +b.slice(5, 7) - 1; ctx.fillText(mi === 0 ? b.slice(0, 4) : MON[mi], x, h - padB / 2); lastX = x; }
        ctx.beginPath(); let st = false, lk = 0; for (let k = 0; k <= ke; k++) { const v = ys[k]; if (!isNum(v)) continue; st ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v)); st = true; lk = k; }
        ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
        const lv = ys[lk]; if (isNum(lv)) tagLabel(ctx, C, fmtN(lv, 1), w - padR + 2, Y(lv), C.accent, C.surface, padR - 4);
        if ((this.p ?? 1) < 1 && isNum(lv)) headLabel(ctx, C, fmtD(s.d[i0 + lk]), X(lk), Y(lv), w - padR);
        if (this.hover != null) { const x = Math.round(X(this.hover)) + 0.5; ctx.strokeStyle = C.ink3; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + pH); ctx.stroke(); ctx.setLineDash([]); }
      },
      tipHtml(k) { return `<b>${fmtD(s.d[i0 + k])}</b><br>Siła względna ${fmtN(ys[k], 1)}`; },
    };
    bindHover(cv, tip, chart, (x) => { const k = Math.round(((x - g.padL) / g.plotW) * (g.n - 1)); return k < 0 || k >= g.n ? null : k; });
    regChart(cv, chart, { key, dur: 1100 });
  }
  /* Słupki szacowanego przepływu dzień po dniu. Wyrastają od zera, od lewej do prawej. */
  function flowChart(cv, s, n, key) {
    const tip = cv.parentElement.querySelector('.tip'), g = {};
    const i0 = Math.max(1, s.last - n + 1), vals = [];
    for (let i = i0; i <= s.last; i++) vals.push(flowAt(s, i));
    const chart = {
      hover: null,
      draw() {
        if (!cv.isConnected) return;
        const { ctx, w, h } = fit(cv), C = colors();
        const padL = 4, padR = 70, padT = 10, padB = 22, plotW = w - padL - padR, pH = h - padT - padB, bw = plotW / vals.length;
        Object.assign(g, { padL, bw });
        const mx = Math.max(...vals.map(Math.abs)) * 1.1 || 1, Y = (v) => padT + ((mx - v) / (2 * mx)) * pH;
        yGrid(ctx, C, [-mx / 1.1, 0, mx / 1.1], 1, Y, padL, w - padR, (t) => (t === 0 ? '0' : fmtSigned(t)));
        const kf = (this.p ?? 1) * vals.length;
        vals.forEach((v, k) => {
          const grow = clamp((kf - k) / 4, 0, 1); if (grow <= 0) return;
          const y0 = Y(0), y1 = Y(v * grow);
          ctx.fillStyle = v >= 0 ? C.good : C.bad; ctx.globalAlpha = this.hover === k ? 1 : 0.8;
          roundRect(ctx, padL + k * bw + 1, Math.min(y0, y1), Math.max(1, bw - 2), Math.max(1, Math.abs(y1 - y0)), Math.min(2, bw / 4)); ctx.fill();
        });
        ctx.globalAlpha = 1; ctx.font = C.mono; ctx.fillStyle = C.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const k of [0, Math.floor(vals.length / 2), vals.length - 1]) ctx.fillText(fmtD(s.d[i0 + k]).slice(0, 5), clamp(padL + (k + 0.5) * bw, padL + 18, w - padR - 18), h - padB / 2);
      },
      tipHtml(k) { return `<b>${fmtD(s.d[i0 + k])}</b><br>Szacowany przepływ ${fmtSigned(vals[k])}<br><span class="muted">Zamknięcie ${fmtPx(s.c[i0 + k], s)}</span>`; },
    };
    bindHover(cv, tip, chart, (x) => { const k = Math.floor((x - g.padL) / g.bw); return k < 0 || k >= vals.length ? null : k; });
    regChart(cv, chart, { key, dur: 1100 });
  }
  function bindHover(cv, tip, chart, hitFn) {
    const move = (e) => {
      if ((chart.p ?? 1) < 1) return;
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
      const k = hitFn(x);
      if (k == null) { chart.hover = null; tip.hidden = true; chart.draw(); return; }
      chart.hover = k; chart.draw(); showTip(tip, cv, x, chart.tipHtml(k));
    };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerdown', move);
    cv.addEventListener('pointerleave', () => { chart.hover = null; tip.hidden = true; chart.draw(); });
  }

  /* Wykres ceny: linia lub świece, średnie, wolumen, linie planu, znaczniki transakcji.
     Rośnie od lewej do prawej; o.anim = { key } przy otwarciu albo { from } w treningu (dorastają nowe sesje). */
  function priceChart(cv, o) {
    const tip = cv.parentElement.querySelector('.tip');
    const g = {};
    const chart = {
      hover: null,
      draw() {
        if (!cv.isConnected) return;
        const { ctx, w, h } = fit(cv), C = colors(), s = o.s;
        const padL = 4, padR = 66, padT = 10, axisH = 22, gap = 10;
        const volH = Math.max(34, Math.round(h * 0.15)), pH = h - padT - axisH - volH - gap;
        const n = o.i1 - o.i0 + 1, plotW = w - padL - padR, xw = plotW / n;
        const X = (i) => padL + (i - o.i0 + 0.5) * xw;
        Object.assign(g, { padL, xw, n });
        let lo = Infinity, hi = -Infinity;
        const cand = o.type === 'candle';
        for (let i = o.i0; i <= o.i1; i++) {
          lo = Math.min(lo, cand ? s.l[i] : s.c[i]); hi = Math.max(hi, cand ? s.h[i] : s.c[i]);
          for (const k of [20, 50, 200]) if (o.sma[k]) { const v = s['sma' + k][i]; if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
        }
        for (const L of o.lines || []) { lo = Math.min(lo, L.y); hi = Math.max(hi, L.y); }
        const sp = hi - lo || hi * 0.02 || 1; lo -= sp * 0.06; hi += sp * 0.06;
        const Y = (v) => padT + ((hi - v) / (hi - lo)) * pH;
        const kf = o.i0 + (o.i1 - o.i0) * (this.p ?? 1), ke = Math.floor(kf), fr = kf - ke;
        const at = (a, i) => (i + 1 <= o.i1 && a[i + 1] != null && a[i] != null ? a[i] + (a[i + 1] - a[i]) * fr : a[i]);
        const { ticks, step } = niceTicks(lo, hi, Math.max(3, Math.round(pH / 55)));
        yGrid(ctx, C, ticks, step, Y, padL, w - padR);
        ctx.font = C.mono; ctx.fillStyle = C.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (!o.blind) {
          const yearsOnly = n > 600; let lastX = -1e9;
          for (let i = o.i0 + 1; i <= ke; i++) {
            const a = s.d[i - 1], b = s.d[i];
            const nm = a.slice(5, 7) !== b.slice(5, 7), ny = a.slice(0, 4) !== b.slice(0, 4);
            if (yearsOnly ? !ny : !nm) continue;
            const x = X(i); if (x - lastX < 58 || x > w - padR - 16) continue;
            const mi = +b.slice(5, 7) - 1;
            ctx.fillText(yearsOnly || mi === 0 ? b.slice(0, 4) : MON[mi], x, h - axisH / 2);
            lastX = x;
          }
        } else {
          ctx.fillText('dziś', X(o.i1), h - axisH / 2);
          const back = Math.round(n / 2);
          if (n > 40) ctx.fillText('−' + back + ' sesji', X(o.i1 - back), h - axisH / 2);
        }
        const vb = padT + pH + gap + volH; let vmax = 0;
        for (let i = o.i0; i <= o.i1; i++) vmax = Math.max(vmax, s.v[i]);
        if (vmax > 0) {
          ctx.fillStyle = C.ink3; ctx.globalAlpha = 0.35; const bw = Math.max(1, xw * 0.7);
          for (let i = o.i0; i <= ke; i++) { const grow = clamp((kf - i) / 8 + 0.2, 0, 1); const vh = (s.v[i] / vmax) * volH * grow; ctx.fillRect(X(i) - bw / 2, vb - vh, bw, vh); }
          ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.fillText('wolumen', w - padR + 8, vb - volH + 8);
        }
        let hx, hy;
        if (cand) {
          const bw = Math.max(1, Math.min(12, xw * 0.66)); ctx.lineWidth = 1;
          for (let i = o.i0; i <= ke; i++) {
            const col = s.c[i] >= s.o[i] ? C.good : C.bad, x = X(i);
            const grow = clamp((kf - i) / 3 + 0.34, 0, 1), mid = (s.o[i] + s.c[i]) / 2, sc = (v) => mid + (v - mid) * grow;
            ctx.strokeStyle = col; ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, Y(sc(s.h[i]))); ctx.lineTo(Math.round(x) + 0.5, Y(sc(s.l[i]))); ctx.stroke();
            const y1 = Y(sc(Math.max(s.o[i], s.c[i]))), y2 = Y(sc(Math.min(s.o[i], s.c[i])));
            ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
          }
          hx = X(ke); hy = Y(s.c[ke]);
        } else {
          hx = X(ke) + fr * xw; hy = Y(at(s.c, ke));
          const path = () => { ctx.beginPath(); for (let i = o.i0; i <= ke; i++) { const x = X(i), y = Y(s.c[i]); i === o.i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } if (ke < o.i1) ctx.lineTo(hx, hy); };
          path(); ctx.save(); ctx.lineTo(hx, padT + pH); ctx.lineTo(X(o.i0), padT + pH); ctx.closePath();
          const gr = ctx.createLinearGradient(0, padT, 0, padT + pH); gr.addColorStop(0, C.accent); gr.addColorStop(1, C.bg);
          ctx.globalAlpha = 0.16; ctx.fillStyle = gr; ctx.fill(); ctx.restore();
          path(); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.9; ctx.lineJoin = 'round'; ctx.stroke();
        }
        const smaCol = { 20: C.c1, 50: C.c2, 200: C.c3 };
        for (const k of [20, 50, 200]) {
          if (!o.sma[k]) continue;
          const a = s['sma' + k]; ctx.beginPath(); let st = false;
          for (let i = o.i0; i <= ke; i++) { if (a[i] == null) continue; const x = X(i), y = Y(a[i]); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); }
          if (st && ke < o.i1 && a[ke] != null) ctx.lineTo(X(ke) + fr * xw, Y(at(a, ke)));
          ctx.strokeStyle = smaCol[k]; ctx.lineWidth = 1.6; ctx.setLineDash(k === 200 ? [6, 4] : []); ctx.stroke(); ctx.setLineDash([]);
        }
        for (const L of o.lines || []) {
          const y = Math.round(Y(L.y)) + 0.5, col = C[L.col] || L.col;
          ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke(); ctx.setLineDash([]);
          ctx.font = C.sans; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(L.label, padL + 6, y - 3);
          tagLabel(ctx, C, fmtN(L.y, L.y >= 1000 ? 0 : 2), w - padR + 2, y, col, C.surface, padR - 4);
        }
        if (!o.lines?.length) {
          const v = cand ? s.c[ke] : at(s.c, ke);
          tagLabel(ctx, C, fmtN(v, v >= 1000 ? 0 : 2), w - padR + 2, hy, C.accent, C.surface, padR - 4);
        }
        for (const m of o.marks || []) {
          if (m.i < o.i0 || m.i > ke) continue;
          const x = X(m.i), y = Y(m.p), up = m.k === 'buy';
          ctx.fillStyle = up ? C.good : C.bad; ctx.strokeStyle = C.surface; ctx.lineWidth = 2;
          ctx.beginPath();
          if (up) { ctx.moveTo(x, y + 6); ctx.lineTo(x - 6, y + 16); ctx.lineTo(x + 6, y + 16); }
          else { ctx.moveTo(x, y - 6); ctx.lineTo(x - 6, y - 16); ctx.lineTo(x + 6, y - 16); }
          ctx.closePath(); ctx.stroke(); ctx.fill();
        }
        if ((this.p ?? 1) < 1) {
          if (!cand) { ctx.fillStyle = C.accent; ctx.strokeStyle = C.surface; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
          if (!o.blind) headLabel(ctx, C, fmtD(s.d[Math.min(o.i1, Math.round(kf))]), hx, hy, w - padR);
        }
        if (this.hover != null) {
          const i = this.hover, x = Math.round(X(i)) + 0.5;
          ctx.strokeStyle = C.ink3; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, vb); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = C.accent; ctx.strokeStyle = C.surface; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, Y(s.c[i]), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      },
      tipHtml(i) {
        const s = o.s, cur = s.cur, f = (x) => fmtM(x, cur);
        const head = o.blind ? (i === o.i1 ? 'Dziś' : `Sesja −${o.i1 - i}`) : fmtD(s.d[i]);
        const chg = i > 0 ? s.c[i] / s.c[i - 1] - 1 : null;
        let h = `<b>${head}</b><br>Zamknięcie <b>${f(s.c[i])}</b> <span class="${chg >= 0 ? 'pos' : 'neg'}">${fmtP(chg, 2)}</span><br>`;
        h += `<span class="muted">O ${fmtN(s.o[i])} · H ${fmtN(s.h[i])} · L ${fmtN(s.l[i])}</span><br><span class="muted">Wolumen ${fmtN(s.v[i], 0)}</span>`;
        for (const k of [20, 50, 200]) if (o.sma[k] && s['sma' + k][i] != null) h += `<br><span class="muted">SMA ${k}: ${fmtN(s['sma' + k][i])}</span>`;
        return h;
      },
    };
    bindHover(cv, tip, chart, (x) => { const i = o.i0 + Math.floor((x - g.padL) / g.xw); return i < o.i0 || i > o.i1 ? null : i; });
    regChart(cv, chart, o.anim);
  }

  /* Wachlarz scenariuszy Wehikułu czasu. */
  function fanChart(cv, r, cur, key) {
    const tip = cv.parentElement.querySelector('.tip'); const g = {};
    const chart = {
      hover: null,
      draw() {
        if (!cv.isConnected) return;
        const { ctx, w, h } = fit(cv), C = colors();
        const padL = 4, padR = 66, padT = 10, padB = 24, H = r.H;
        const plotW = w - padL - padR, pH = h - padT - padB;
        const X = (d) => padL + (d / H) * plotW;
        Object.assign(g, { padL, plotW, H });
        let lo = Math.min(r.stop, ...r.band.p5), hi = Math.max(r.target, ...r.band.p95);
        const sp = hi - lo; lo -= sp * 0.05; hi += sp * 0.05;
        const Y = (v) => padT + ((hi - v) / (hi - lo)) * pH;
        const { ticks, step } = niceTicks(lo, hi, Math.max(3, Math.round(pH / 55)));
        yGrid(ctx, C, ticks, step, Y, padL, w - padR);
        ctx.font = C.mono; ctx.fillStyle = C.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const stepX = H <= 10 ? 1 : H <= 20 ? 5 : H <= 60 ? 10 : 20;
        for (let d = 0; d <= H; d += stepX) ctx.fillText(d === 0 ? 'dziś' : '+' + d, clamp(X(d), padL + 14, w - padR - 10), h - padB / 2);
        const D = Math.max(1, Math.round((this.p ?? 1) * H));
        const area = (a, b, fill, alpha) => {
          ctx.beginPath(); for (let d = 0; d <= D; d++) { const x = X(d), y = Y(a[d]); d ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          for (let d = D; d >= 0; d--) ctx.lineTo(X(d), Y(b[d]));
          ctx.closePath(); ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1;
        };
        area(r.band.p95, r.band.p5, C.s1, 1);
        ctx.lineWidth = 1; ctx.strokeStyle = C.ink3; ctx.globalAlpha = 0.16;
        const shown = Math.ceil(r.paths.length * Math.min(1, (this.p ?? 1) * 1.4));
        for (const p of r.paths.slice(0, shown)) { ctx.beginPath(); for (let d = 0; d <= D; d++) d ? ctx.lineTo(X(d), Y(p[d])) : ctx.moveTo(X(d), Y(p[d])); ctx.stroke(); }
        ctx.globalAlpha = 1;
        area(r.band.p75, r.band.p25, C.s2, 0.6);
        ctx.beginPath(); for (let d = 0; d <= D; d++) d ? ctx.lineTo(X(d), Y(r.band.p50[d])) : ctx.moveTo(X(d), Y(r.band.p50[d]));
        ctx.strokeStyle = C.s4; ctx.lineWidth = 2; ctx.stroke();
        for (const [y, label, col] of [[r.target, 'cel', C.good], [r.entry, 'wejście', C.ink], [r.stop, 'stop', C.bad]]) {
          const yy = Math.round(Y(y)) + 0.5;
          ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke(); ctx.setLineDash([]);
          ctx.font = C.sans; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(label, padL + 6, yy - 3);
          tagLabel(ctx, C, fmtN(y, y >= 1000 ? 0 : 2), w - padR + 2, yy, col, C.surface, padR - 4);
        }
        if (this.hover != null) {
          const x = Math.round(X(this.hover)) + 0.5;
          ctx.strokeStyle = C.ink3; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + pH); ctx.stroke(); ctx.setLineDash([]);
        }
      },
      tipHtml(d) {
        const b = r.band, f = (x) => fmtM(x, cur);
        return `<b>${d === 0 ? 'Dziś' : 'Po ' + d + ' ' + plural(d, 'sesji', 'sesjach', 'sesjach')}</b><br>
          <span class="muted">5 na 100 powtórek wyżej niż</span> ${f(b.p95[d])}<br>
          <span class="muted">Połowa między</span> ${f(b.p25[d])} – ${f(b.p75[d])}<br>
          <span class="muted">Mediana</span> <b>${f(b.p50[d])}</b><br>
          <span class="muted">5 na 100 niżej niż</span> ${f(b.p5[d])}`;
      },
    };
    bindHover(cv, tip, chart, (x) => { const d = Math.round(((x - g.padL) / g.plotW) * g.H); return d < 0 || d > g.H ? null : d; });
    regChart(cv, chart, { key, dur: 1300 });
  }

  /* Rozkład ceny na końcu horyzontu. */
  function histChart(cv, r, cur, key) {
    const tip = cv.parentElement.querySelector('.tip'); const g = {};
    const { lo, bw, bins } = r.hist, nb = bins.length, total = r.reps;
    const chart = {
      hover: null,
      draw() {
        if (!cv.isConnected) return;
        const { ctx, w, h } = fit(cv), C = colors();
        const padL = 4, padR = 8, padT = 8, padB = 34, plotW = w - padL - padR, pH = h - padT - padB;
        const bwPx = plotW / nb, mx = Math.max(...bins) || 1;
        Object.assign(g, { padL, bwPx });
        const X = (v) => padL + ((v - lo) / (bw * nb)) * plotW;
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, padT + pH + 0.5); ctx.lineTo(w - padR, padT + pH + 0.5); ctx.stroke();
        for (let b = 0; b < nb; b++) {
          const grow = clamp(((this.p ?? 1) * (nb + 6) - b) / 6, 0, 1);
          const mid = lo + (b + 0.5) * bw, hh = (bins[b] / mx) * pH * grow;
          const col = mid <= r.stop ? C.bad : mid >= r.target ? C.good : C.ink3;
          ctx.fillStyle = col; ctx.globalAlpha = this.hover === b ? 1 : mid > r.stop && mid < r.target ? 0.55 : 0.85;
          roundRect(ctx, padL + b * bwPx + 1, padT + pH - hh, Math.max(1, bwPx - 2), Math.max(0.5, hh), Math.min(3, bwPx / 4));
          ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.font = C.mono; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
        const placed = [];
        for (const [v, label, col] of [[r.stop, 'stop', C.bad], [r.entry, 'wejście', C.ink2], [r.target, 'cel', C.good]]) {
          const x = X(v); if (x < padL || x > w - padR) continue;
          if (placed.some((p) => Math.abs(p - x) < 54)) continue; placed.push(x);
          ctx.strokeStyle = col; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + pH); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = col; ctx.fillText(label, x, padT + pH + 5); ctx.fillStyle = C.ink3; ctx.fillText(fmtN(v, v >= 1000 ? 0 : 2), x, padT + pH + 18);
        }
      },
      tipHtml(b) { return `<b>${fmtM(lo + b * bw, cur)} – ${fmtM(lo + (b + 1) * bw, cur)}</b><br>${fmtPu(bins[b] / total)} powtórek skończyło w tym przedziale`; },
    };
    bindHover(cv, tip, chart, (x) => { const b = Math.floor((x - g.padL) / g.bwPx); return b < 0 || b >= nb ? null : b; });
    regChart(cv, chart, { key, dur: 1100 });
  }

  /* Oszczędzanie: wachlarz wartości portfela w latach. */
  function longChart(cv, r, key) {
    const tip = cv.parentElement.querySelector('.tip'); const g = {};
    const Yn = r.p50.length - 1;
    const chart = {
      hover: null,
      draw() {
        if (!cv.isConnected) return;
        const { ctx, w, h } = fit(cv), C = colors();
        const padL = 4, padR = 78, padT = 10, padB = 24, plotW = w - padL - padR, pH = h - padT - padB;
        const X = (y) => padL + (y / Yn) * plotW; Object.assign(g, { padL, plotW });
        const hi = Math.max(...r.p90) * 1.04, lo = 0;
        const Y = (v) => padT + ((hi - v) / (hi - lo)) * pH;
        const { ticks } = niceTicks(lo, hi, Math.max(3, Math.round(pH / 55)));
        yGrid(ctx, C, ticks, 1, Y, padL, w - padR, (t) => (t >= 1e6 ? fmtN(t / 1e6, 1) + ' mln' : fmtN(t / 1000, 0) + ' tys.'));
        ctx.font = C.mono; ctx.fillStyle = C.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const stp = Yn <= 10 ? 1 : Yn <= 20 ? 5 : 5;
        for (let y = 0; y <= Yn; y += stp) ctx.fillText(y === 0 ? 'start' : y + (y === 1 ? ' rok' : ' lat'), clamp(X(y), padL + 16, w - padR - 14), h - padB / 2);
        const yf = (this.p ?? 1) * Yn, yk = Math.floor(yf), yr = yf - yk;
        const val = (a) => (yk < Yn ? a[yk] + (a[yk + 1] - a[yk]) * yr : a[Yn]);
        const pathTo = (a) => { for (let y = 0; y <= yk; y++) y ? ctx.lineTo(X(y), Y(a[y])) : ctx.moveTo(X(y), Y(a[y])); if (yk < Yn) ctx.lineTo(X(yf), Y(val(a))); };
        const area = (a, b, fill, alpha) => {
          ctx.beginPath(); pathTo(a); ctx.lineTo(X(yf), Y(val(b)));
          for (let y = yk; y >= 0; y--) ctx.lineTo(X(y), Y(b[y]));
          ctx.closePath(); ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1;
        };
        area(r.p90, r.p10, C.s1, 1); area(r.p75, r.p25, C.s2, 0.6);
        ctx.beginPath(); pathTo(r.p50); ctx.strokeStyle = C.s4; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); pathTo(r.dep); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
        tagLabel(ctx, C, 'mediana', w - padR + 2, Y(val(r.p50)), C.s4, C.surface);
        const yd = Y(val(r.dep)); if (Math.abs(yd - Y(val(r.p50))) > 20) tagLabel(ctx, C, 'wpłaty', w - padR + 2, yd, C.ink, C.surface);
        if (this.hover != null) { const x = Math.round(X(this.hover)) + 0.5; ctx.strokeStyle = C.ink3; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + pH); ctx.stroke(); ctx.setLineDash([]); }
      },
      tipHtml(y) {
        return `<b>${y === 0 ? 'Start' : 'Po ' + y + ' ' + plural(y, 'roku', 'latach', 'latach')}</b><br>
        <span class="muted">Wpłacone</span> ${fmtM(r.dep[y], 'PLN', 0)}<br>
        <span class="muted">1 na 10 lepiej niż</span> ${fmtM(r.p90[y], 'PLN', 0)}<br>
        <span class="muted">Mediana</span> <b>${fmtM(r.p50[y], 'PLN', 0)}</b><br>
        <span class="muted">1 na 10 gorzej niż</span> ${fmtM(r.p10[y], 'PLN', 0)}`;
      },
    };
    bindHover(cv, tip, chart, (x) => { const y = Math.round(((x - g.padL) / g.plotW) * Yn); return y < 0 || y > Yn ? null : y; });
    regChart(cv, chart, { key, dur: 1300 });
  }

  function sparkChart(cv, s, n) {
    regChart(cv, {
      draw() {
        if (!cv.isConnected) return;
        const { ctx, w, h } = fit(cv), C = colors(), i0 = Math.max(0, s.last - n);
        let lo = Infinity, hi = -Infinity; for (let i = i0; i <= s.last; i++) { lo = Math.min(lo, s.c[i]); hi = Math.max(hi, s.c[i]); }
        const X = (i) => 2 + ((i - i0) / (s.last - i0)) * (w - 8), Y = (v) => 4 + ((hi - v) / (hi - lo || 1)) * (h - 8);
        const ke = i0 + Math.round((this.p ?? 1) * (s.last - i0));
        ctx.beginPath(); for (let i = i0; i <= ke; i++) i === i0 ? ctx.moveTo(X(i), Y(s.c[i])) : ctx.lineTo(X(i), Y(s.c[i]));
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.stroke();
        const up = s.c[ke] >= s.c[i0];
        ctx.fillStyle = up ? C.good : C.bad; ctx.beginPath(); ctx.arc(X(ke), Y(s.c[ke]), 3.5, 0, Math.PI * 2); ctx.fill();
      },
    }, { key: 'spark:' + s.s, dur: 1000 });
  }

  /* ----- Wspólne kawałki widoków ----- */
  const ICON_INFO = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="7.25" y="7" width="1.5" height="4.5" rx=".75" fill="currentColor"/><circle cx="8" cy="4.8" r=".95" fill="currentColor"/></svg>';
  const ICON_WARN = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><rect x="7.25" y="6" width="1.5" height="4.5" rx=".75" fill="currentColor"/><circle cx="8" cy="12.2" r=".9" fill="currentColor"/></svg>';
  const note = (cls, html) => `<div class="note ${cls}">${cls === 'info' || cls === 'good' ? ICON_INFO : ICON_WARN}<div>${html}</div></div>`;
  const chip = (t, cls = '') => `<span class="chip ${cls}">${esc(t)}</span>`;
  const seg = (name, opts, val) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-seg="${name}" data-v="${v}" aria-pressed="${String(v) === String(val)}">${l}</button>`).join('')}</div>`;
  const chartBox = (id, h) => `<div class="chart-box"><canvas id="${id}" style="height:${h}px" role="img" aria-label="Wykres"></canvas><div class="tip" hidden></div></div>`;
  function stockOptions(sel, withRandom, filter) {
    let h = withRandom ? `<option value="random"${sel === 'random' ? ' selected' : ''}>Losowy walor</option>` : '';
    for (const [k, label] of Object.entries(CLASSES)) {
      const list = DATA.stocks.filter((x) => x.cls === k && (!filter || filter(x)));
      if (!list.length) continue;
      h += `<optgroup label="${label}">`;
      for (const s of list) h += `<option value="${s.s}"${s.s === sel ? ' selected' : ''}>${esc(s.synthetic ? s.n : s.s + ' · ' + s.n)}</option>`;
      h += '</optgroup>';
    }
    return h;
  }
  const lab = (s) => (s.synthetic ? s.n : s.s);
  const ruleChips = (tags, onlyScan) => tags.filter((k) => !onlyScan || RULES[k].src === 'skaner').map((k) => `<span class="chip ${RULES[k].src === 'skaner' ? 'accent' : ''}" title="${esc(RULES[k].d)}">${esc(RULES[k].n)}</span>`).join(' ');
  const trendChip = (t) => chip(TREND[t][0], TREND[t][1]);
  const chg = (x, d = 1) => `<span class="${x > 0 ? 'pos' : x < 0 ? 'neg' : ''} num">${fmtP(x, d)}</span>`;
  function stopFields(prefix, o, s, t, entry) {
    const R = STOP_RULES[o.stopRule];
    const valField = R.unit ? `<label class="field">${R.unit === 'cena' ? 'Cena stopu' : R.unit === '%' ? 'Ile procent pod wejściem' : 'Ile razy ATR'}<input type="number" id="${prefix}-sv" value="${o.stopVal}" step="${R.step}" min="0"></label>` : '';
    return `<label class="field">Reguła stopu<select id="${prefix}-sr">${Object.entries(STOP_RULES).map(([k, v]) => `<option value="${k}"${k === o.stopRule ? ' selected' : ''}>${v.n}</option>`).join('')}</select></label>
      ${valField}
      <label class="field">Cel<select id="${prefix}-r">${[1, 1.5, 2, 3].map((x) => `<option value="${x}"${x === +o.R ? ' selected' : ''}>${fmtN(x, x % 1 ? 1 : 0)}R (${fmtN(x, x % 1 ? 1 : 0)} × ryzyko)</option>`).join('')}</select></label>`;
  }
  function bindStopFields(prefix, o, onChange, s, t, entryFn) {
    const sr = document.getElementById(prefix + '-sr'), sv = document.getElementById(prefix + '-sv'), r = document.getElementById(prefix + '-r');
    sr.addEventListener('change', () => {
      o.stopRule = sr.value;
      if (STOP_RULES[o.stopRule].unit === 'cena') o.stopVal = floorT(entryFn() * 0.95, s.tick);
      else if (STOP_RULES[o.stopRule].def) o.stopVal = STOP_RULES[o.stopRule].def;
      onChange(true);
    });
    sv?.addEventListener('input', () => { o.stopVal = parseFloat(sv.value); onChange(false); });
    r.addEventListener('change', () => { o.R = parseFloat(r.value); onChange(false); });
  }
  function exitHtml(plan, s, t, rule, val) {
    const cur = s.cur, f = (x) => fmtPx(x, s);
    if (plan.errors.length) return note('bad', '<b>Plan odrzucony.</b> ' + plan.errors.map(esc).join(' '));
    return `<dl class="kv">
      <dt>Wejście</dt><dd>${f(plan.entry)}</dd>
      <dt>Stop</dt><dd class="neg">${f(plan.stop)}</dd>
      <dt>Cel</dt><dd class="pos">${f(plan.target)}</dd>
      <dt>Ryzyko na akcję (1R)</dt><dd>${f(plan.risk)} · ${fmtPu(plan.riskPct, 2)}</dd>
      <dt>Zysk do ryzyka</dt><dd>${fmtN(plan.rr, 2)} : 1</dd>
      <dt>Próg opłacalności</dt><dd>${fmtPu(1 / (1 + plan.rr), 0)} trafień</dd>
    </dl>
    <p class="faint">Stop: ${esc(stopRuleText(rule, val, s, t, plan.entry, cur))}. Cel: wejście + ${fmtN(plan.R, 1)} × ryzyko, zaokrąglone do grosza. Stop to plan, nie gwarancja: luka cenowa może go wykonać niżej.</p>`;
  }
  function sizeHtml(T, s) {
    if (!T.size) return '<p class="faint">Najpierw popraw plan wyjścia.</p>';
    const z = T.size;
    const rows = z.limits.map((L) => `<tr><td>${esc(L.n)}${L.k === z.decider ? ' ' + chip('decyduje', 'accent') : ''}</td><td class="wrap faint">${esc(L.math)}</td><td class="r num">${fmtQty(Math.max(0, L.sh), s)}</td></tr>`).join('');
    return `<div class="table-wrap"><table><thead><tr><th>Limit</th><th>Rachunek</th><th class="r">Akcje</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="stats">
        <div class="stat"><span class="k">Kupujesz</span><span class="v">${fmtQty(z.shares, s)} ${s.frac ? 'j.' : 'szt.'}</span><span class="s">najmniejszy z czterech limitów</span></div>
        <div class="stat"><span class="k">Wartość</span><span class="v">${fmtM(z.value, 'PLN', 0)}</span><span class="s">${s.cur === 'USD' ? 'kurs USD/PLN ' + fmtN(z.fx, 4) : 'z prowizją ' + fmtM(z.fee)}</span></div>
        <div class="stat"><span class="k">Strata przy stopie</span><span class="v neg">${fmtM(-z.maxLoss, 'PLN', 0)}</span><span class="s">jeśli stop wykona się po swojej cenie</span></div>
      </div>`;
  }
  function riskHtml(T) {
    if (!T.risk) return '<p class="faint">Kontrola ruszy, gdy plan wyjścia będzie poprawny.</p>';
    const ic = { ok: ['ok', '✓'], no: ['no', '✕'], wa: ['wa', '!'], na: ['na', '–'] };
    return `<div class="verdict"><span class="${T.risk.pass ? 'big-pass' : 'big-block'}">${T.risk.pass ? 'PASS' : 'BLOCK'}</span>${T.risk.pass ? 'Plan mieści się w Twoich zasadach' : 'Plan łamie Twoje zasady'}</div>
      <div>${T.risk.checks.map((c) => `<div class="check"><span class="ic ${ic[c.level][0]}" aria-label="${c.level}">${ic[c.level][1]}</span><div><b>${esc(c.k)}</b><div class="faint">${esc(c.text)}</div></div></div>`).join('')}</div>
      <p class="faint">PASS znaczy tylko tyle, że plan nie łamie zasad. To nie jest rekomendacja.</p>`;
  }

  /* ========== Widoki ========== */
  function vStart(el) {
    const nDone = LESSONS.filter((l) => S.lessons[l.id]?.done).length;
    const steps = [
      ['#nauka', 'Przerób lekcje', `${nDone} z ${LESSONS.length} ukończonych`, nDone === LESSONS.length],
      ['#zasady', 'Ustal swoje zasady', 'Budżet, maksymalna strata, bufor gotówki', !!S.prog.cfg],
      ['#skaner', 'Przeskanuj rynek', 'Które wykresy pasują do reguł', !!S.prog.scan],
      ['#rotacja', 'Zobacz, dokąd płynie kapitał', 'Sektory i klasy aktywów: napływ i odpływ', !!S.prog.rot],
      ['#analiza', 'Przeanalizuj spółkę', 'Wykres, wskaźniki, fundamenty', !!S.prog.analiza],
      ['#prognoza', 'Sprawdź szanse', '10 000 powtórek w Wehikule czasu', !!S.prog.mc],
      ['#plan', 'Zaplanuj transakcję', 'Stop, cel, wielkość i kontrola ryzyka', !!S.prog.plan],
      ['#trening', 'Rozegraj 3 treningi', `${Math.min(3, S.sessions.length)} z 3 rozegranych`, S.sessions.length >= 3],
      ['#nauka', 'Dopiero potem konto demo', 'Te same zasady u brokera, na wirtualnych pieniądzach', false],
    ];
    const etfs = ['ETFBW20TR', 'SPY', 'QQQ'].map((k) => BY[k]).filter(Boolean);
    const hits = DATA.stocks.filter((s) => tagsAt(s, s.last).some((k) => RULES[k].src === 'skaner'));
    el.innerHTML = `
    <section class="hero fade">
      <span class="eyebrow">Nauka giełdy na prawdziwych danych</span>
      <h1>Zrozum giełdę, <span class="hl">zanim zaryzykujesz</span> prawdziwe pieniądze.</h1>
      <p>Ćwiczysz na pięciu latach prawdziwych notowań ${DATA.stocks.length} walorów: akcji z GPW i USA, indeksów, sektorów, surowców, obligacji, kryptowalut i walut. Każda transakcja ma plan, stop i limit straty, jak u zawodowców. Wszystko na wirtualnych pieniądzach.</p>
      <div class="row"><a class="btn primary" href="#nauka">Zacznij od lekcji</a><a class="btn" href="#trening">Od razu potrenuj</a></div>
      <p class="faint">Notowania do ${fmtD(DATA.as_of)}. Dane odświeżają się automatycznie w dni robocze o 23:00, po zamknięciu sesji w USA.</p>
    </section>
    ${note('warn', '<b>To narzędzie do nauki, nie porada inwestycyjna.</b> Nikt nie zna przyszłych cen, a większość osób, które grają krótkoterminowo, traci pieniądze. Aplikacja nie składa zleceń. Inwestuj tylko pieniądze, których stratę zniesiesz.')}
    <section>
      <div class="row between"><h2>Twoja ścieżka</h2><span class="faint">Kolejność ma znaczenie: najpierw zasady, potem pieniądze.</span></div>
      <div class="path">${steps.map(([h, b, sp, ok]) => `<a class="step ${ok ? 'done' : ''}" href="${h}"><b>${b}</b><span>${sp}</span></a>`).join('')}</div>
    </section>
    <section>
      <div class="row between"><h2>Rynek na ${fmtD(DATA.as_of)}</h2><a class="btn ghost" href="#skaner">Otwórz skaner →</a></div>
      <div class="grid g4">
        ${etfs.map((s) => { const m = metrics(s); return `<a class="metric" href="#analiza" data-act="goan" data-sym="${s.s}" style="text-decoration:none;color:inherit">
          <span class="t">${esc(s.n)} ${chip(s.cur)}</span>
          <span class="v">${fmtN(m.price)}</span>
          <span class="x">dziś ${chg(m.d1, 2)} · miesiąc ${chg(m.m1)}</span>
          <div class="chart-box"><canvas data-spark="${s.s}" style="height:40px" aria-hidden="true"></canvas></div></a>`; }).join('')}
        <div class="metric"><span class="t">Skaner dzisiaj</span><span class="v">${hits.length} z ${DATA.stocks.length}</span>
          <span class="x">wykresów pasuje do co najmniej jednej reguły skanera. To lista do sprawdzenia, nie lista zakupów.</span></div>
      </div>
    </section>
    ${startRotation()}
    <section class="grid g2">
      <div class="card">
        <h3>Jak to działa</h3>
        <p class="muted" style="margin-top:6px">Aplikacja odtwarza kolejne kroki pakietu tradera. Każdy krok ma jedno zadanie i niczego nie przeskakuje.</p>
        <div class="stack" style="margin-top:12px">
          ${[['Skaner', 'wybiera wykresy pasujące do prostych reguł'], ['Rotacja', 'pokazuje, które sektory i klasy aktywów przyciągają kapitał'], ['Analiza', 'tłumaczy wskaźniki i liczby firmy'], ['Wehikuł czasu', 'powtarza plan 10 000 razy na danych spółki'], ['Planer wyjścia', 'ustala stop i cel przed wejściem'], ['Menedżer budżetu', 'liczy, ile akcji zmieści się w Twoich limitach'], ['Strażnik ryzyka', 'daje PASS albo BLOCK'], ['Trening', 'zamiast brokera: grasz na historii, bez prawdziwych pieniędzy']].map(([a, b], i) => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="chip accent num">${i + 1}</span><span><b>${a}</b> <span class="muted">${b}</span></span></div>`).join('')}
        </div>
      </div>
      <div class="card">
        <h3>Trzy rzeczy, które warto wiedzieć na start</h3>
        <div class="stack-lg" style="margin-top:10px">
          <p><b>Ile kupić jest ważniejsze niż co kupić.</b> <span class="muted">Ryzyko około 1% konta na transakcję pozwala przetrwać serię pomyłek.</span></p>
          <p><b>Wyjście planujesz przed wejściem.</b> <span class="muted">Stop i cel ustalasz na spokojnie, zanim emocje zaczną podpowiadać.</span></p>
          <p><b>Szeroki ETF i długi horyzont to fundament.</b> <span class="muted">Krótkie granie to najtrudniejsza część rynku. Ćwicz ją w treningu, zanim zapłacisz za naukę.</span></p>
        </div>
      </div>
    </section>`;
    el.querySelectorAll('canvas[data-spark]').forEach((cv) => sparkChart(cv, BY[cv.dataset.spark], 63));
  }

  function startRotation() {
    const reg = riskRegime().find((g) => g.k === 'm1'), d = isNum(reg.off) && isNum(reg.def) ? reg.off - reg.def : null;
    const block = (gk) => {
      const G = ROT_GROUPS[gk], { rows } = rotRows(gk, G.bench, 'd'), L = rotLists(rows);
      const ch = (arr, cls) => arr.slice(0, 4).map((x) => `<a class="chip ${cls}" href="#rotacja" data-act="to-rot" data-sym="${x.s.s}" data-g="${gk}" title="${esc(x.s.n)}">${esc(lab(x.s))}</a>`).join(' ') || '<span class="faint">brak</span>';
      return `<div class="metric"><span class="t">${esc(G.n)} <span class="faint">vs ${esc(lab(BY[G.bench]))}</span></span>
        <span class="x">Napływ: ${ch(L.lead, 'good')}</span><span class="x">Odpływ: ${ch(L.out, 'bad')}</span></div>`;
    };
    return `<section>
      <div class="row between"><h2>Rotacja kapitału</h2><a class="btn ghost" href="#rotacja">Otwórz rotację →</a></div>
      <div class="grid g4">
        <div class="metric"><span class="t">Apetyt na ryzyko, miesiąc</span><span class="v ${d >= 0 ? 'pos' : 'neg'}">${isNum(d) ? (d >= 0 ? '+' : '−') + fmtN(Math.abs(d) * 100, 1) + ' pp' : '–'}</span><span class="x">${d >= 0 ? 'Ofensywne aktywa radzą sobie lepiej niż defensywne.' : 'Defensywne aktywa radzą sobie lepiej niż ofensywne.'}</span></div>
        ${block('klasy')}${block('sektory-us')}${block('sektory-pl')}
      </div>
    </section>`;
  }

  function vNauka(el) {
    const nDone = LESSONS.filter((l) => S.lessons[l.id]?.done).length;
    const gl = UI.gloss.trim().toLowerCase();
    const terms = GLOSSARY.filter(([a, b]) => !gl || a.toLowerCase().includes(gl) || b.toLowerCase().includes(gl));
    el.innerHTML = `
    <section class="fade">
      <span class="eyebrow">${nDone} z ${LESSONS.length} lekcji ukończonych</span>
      <h1>Nauka <span class="hl">krok po kroku</span></h1>
      <p class="muted" style="max-width:68ch">Każda lekcja zajmuje kilka minut i kończy się jednym pytaniem. Lekcja liczy się jako ukończona, gdy odpowiesz poprawnie.</p>
    </section>
    <section class="stack">
      ${LESSONS.map((l, i) => { const st = S.lessons[l.id] || {}; return `
      <details class="lesson ${st.done ? 'done' : ''}" id="ls-${l.id}">
        <summary><span class="no">${st.done ? '✓' : i + 1}</span><span><h3>${esc(l.t)}</h3><span class="faint">${l.mins} min · ${esc(l.key)}</span></span><span class="faint">${st.done ? 'ukończona' : ''}</span></summary>
        <div class="body">
          ${l.body.map((p) => `<p>${esc(p)}</p>`).join('')}
          <p class="key"><span class="hl">${esc(l.key)}</span></p>
          <div class="quiz" data-lesson="${l.id}">
            <b>${esc(l.q.q)}</b>
            ${l.q.a.map((a, k) => `<button type="button" data-act="quiz" data-l="${l.id}" data-k="${k}" class="${st.ans === k ? (k === l.q.ok ? 'right' : 'wrong') : ''}">${esc(a)}</button>`).join('')}
            ${st.ans != null ? `<p class="${st.ans === l.q.ok ? 'pos' : 'neg'}"><b>${st.ans === l.q.ok ? 'Dobrze.' : 'Jeszcze nie.'}</b> <span class="muted">${esc(l.q.why)}</span></p>` : ''}
          </div>
        </div>
      </details>`; }).join('')}
    </section>
    <section class="grid g2">
      <div class="card stack-lg">
        <div class="row between"><h3>Słowniczek</h3><span class="faint">${GLOSSARY.length} pojęć</span></div>
        <input id="gloss" placeholder="Szukaj pojęcia, np. RSI" value="${esc(UI.gloss)}" aria-label="Szukaj w słowniczku">
        <dl class="stack" id="gloss-list" style="margin:0;max-height:420px;overflow:auto">${terms.map(([a, b]) => `<div><dt><b>${esc(a)}</b></dt><dd class="muted" style="margin:0">${esc(b)}</dd></div>`).join('') || '<p class="faint">Brak takiego pojęcia.</p>'}</dl>
      </div>
      <div class="stack-lg">
        ${mentorBox('chat', 'Zapytaj', true)}
        <div class="card">
          <h3>Pierwsze kroki poza aplikacją</h3>
          <div class="stack" style="margin-top:10px">
            <p><b>1.</b> <span class="muted">Odłóż poduszkę finansową, czyli kilka miesięcy wydatków na zwykłym koncie.</span></p>
            <p><b>2.</b> <span class="muted">Załóż konto demo u brokera i przenieś na nie zasady z zakładki „Moje zasady”.</span></p>
            <p><b>3.</b> <span class="muted">Zacznij od małych, regularnych wpłat do szerokiego ETF-u. Rozważ IKE lub IKZE.</span></p>
            <p><b>4.</b> <span class="muted">Trading, jeśli w ogóle, to mała część pieniędzy i zawsze z planem wyjścia.</span></p>
          </div>
        </div>
      </div>
    </section>`;
    document.getElementById('gloss').addEventListener('input', (e) => {
      UI.gloss = e.target.value; const g2 = UI.gloss.trim().toLowerCase();
      const list = GLOSSARY.filter(([a, b]) => !g2 || a.toLowerCase().includes(g2) || b.toLowerCase().includes(g2));
      document.getElementById('gloss-list').innerHTML = list.map(([a, b]) => `<div><dt><b>${esc(a)}</b></dt><dd class="muted" style="margin:0">${esc(b)}</dd></div>`).join('') || '<p class="faint">Brak takiego pojęcia.</p>';
    });
    document.getElementById('mq-chat')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.querySelector('[data-act="mentor"][data-id="chat"]')?.click(); } });
  }

  function vSkaner(el) {
    if (!S.prog.scan) { S.prog.scan = true; save(); }
    const F = UI.scan;
    let rows = DATA.stocks.map((s) => ({ s, m: metrics(s), tags: tagsAt(s, s.last) }));
    const scanned = rows.length, anyHit = rows.filter((r) => r.tags.some((k) => RULES[k].src === 'skaner')).length;
    if (F.mkt !== 'all') rows = rows.filter((r) => r.s.cls === F.mkt);
    if (F.rules.length) rows = rows.filter((r) => F.rules.some((k) => r.tags.includes(k)));
    const sorters = { turnover: (a, b) => b.m.turnover - a.m.turnover, d1: (a, b) => b.m.d1 - a.m.d1, vol: (a, b) => a.m.vol - b.m.vol, rsi: (a, b) => a.m.rsi - b.m.rsi, ath: (a, b) => athInfo(b.s).from - athInfo(a.s).from, athFar: (a, b) => athInfo(a.s).from - athInfo(b.s).from };
    rows.sort(sorters[F.sort]);
    el.innerHTML = `
    <section class="fade">
      <span class="eyebrow">Skaner wykresów · reguły z pakietu tradera</span>
      <h1>Które wykresy <span class="hl">pasują do reguły</span></h1>
      <p class="muted" style="max-width:70ch">Skaner przegląda wykresy za Ciebie i wypisuje te, które spełniają prostą regułę. To wszystko, co robi. Pasowanie do reguły nie jest sygnałem kupna ani prognozą.</p>
    </section>
    ${note('info', `Przeskanowano <b>${scanned}</b> walorów z ${Object.keys(CLASSES).length} klas aktywów. Dane dzienne do <b>${fmtD(DATA.as_of)}</b> (ostatnia sesja w USA mogła być jeszcze w toku, kryptowaluty notowane są całą dobę). <b>${anyHit}</b> pasuje do co najmniej jednej reguły skanera. Dane są opóźnione, więc przed decyzją sprawdź aktualną cenę u brokera.`)}
    <div class="card stack-lg">
      <div class="row between">
        <label class="field" style="grid-auto-flow:column;align-items:center;gap:8px">Klasa aktywów
          <select id="scan-cls" style="width:auto"><option value="all">Wszystkie (${DATA.stocks.length})</option>${Object.entries(CLASSES).map(([k, l]) => `<option value="${k}"${F.mkt === k ? ' selected' : ''}>${l} (${DATA.stocks.filter((x) => x.cls === k).length})</option>`).join('')}</select>
        </label>
        <label class="field" style="grid-auto-flow:column;align-items:center;gap:8px">Sortuj
          <select id="scan-sort" style="width:auto"><option value="turnover"${F.sort === 'turnover' ? ' selected' : ''}>Najbardziej płynne</option><option value="d1"${F.sort === 'd1' ? ' selected' : ''}>Zmiana dziś</option><option value="vol"${F.sort === 'vol' ? ' selected' : ''}>Najspokojniejsze</option><option value="rsi"${F.sort === 'rsi' ? ' selected' : ''}>Najniższe RSI</option><option value="ath"${F.sort === 'ath' ? ' selected' : ''}>Najbliżej ATH</option><option value="athFar"${F.sort === 'athFar' ? ' selected' : ''}>Najdalej od ATH</option></select>
        </label>
      </div>
      <div class="row">${Object.entries(RULES).map(([k, r]) => `<button type="button" class="chip" data-act="rule" data-k="${k}" aria-pressed="${F.rules.includes(k)}" title="${esc(r.d)}">${esc(r.n)}</button>`).join('')}
        ${F.rules.length ? '<button class="btn ghost sm" data-act="rules-clear">Wyczyść filtry</button>' : ''}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Spółka</th><th class="r">Cena</th><th class="r">Dziś</th><th>Reguły</th><th>Trend</th><th class="r">RSI</th><th class="r">Zmienność</th><th class="r">Od ATH</th><th class="r">Obrót / dzień</th></tr></thead>
          <tbody>${rows.map((r) => `<tr class="click" data-act="goan" data-sym="${r.s.s}" tabindex="0">
            <td><b>${esc(lab(r.s))}</b> <span class="muted">${esc(r.s.synthetic ? 'koszyk' : r.s.n)}</span></td>
            <td class="r num">${fmtPx(r.m.price, r.s)}</td>
            <td class="r">${chg(r.m.d1, 2)}</td>
            <td><div class="row" style="gap:4px">${ruleChips(r.tags) || '<span class="faint">–</span>'}</div></td>
            <td>${trendChip(r.m.trend)}</td>
            <td class="r num">${fmtN(r.m.rsi, 0)}</td>
            <td class="r num">${fmtPu(r.m.vol, 0)}</td>
            ${heat(athInfo(r.s).from, 0.6)}
            <td class="r num">${r.m.turnover > 0 ? fmtBig(r.m.turnover) : '–'}</td></tr>`).join('') || '<tr><td colspan="9" class="faint">Żaden wykres nie pasuje do wybranych reguł. To też jest odpowiedź: nie trzeba grać codziennie.</td></tr>'}</tbody>
        </table>
      </div>
      <p class="faint">Kliknij wiersz, żeby otworzyć analizę. Niebieskie reguły pochodzą ze skanera dziennego pakietu tradera, szare to kontekst dla początkujących.</p>
    </div>
    <details class="more card"><summary>Jak działają reguły</summary>
      <div class="grid g2">${Object.values(RULES).map((r) => `<div><b>${esc(r.n)}</b><p class="muted">${esc(r.d)}</p></div>`).join('')}</div>
    </details>`;
    document.getElementById('scan-sort').addEventListener('change', (e) => { F.sort = e.target.value; render(); });
    document.getElementById('scan-cls').addEventListener('change', (e) => { F.mkt = e.target.value; render(); });
  }

  function vAnaliza(el) {
    if (!S.prog.analiza) { S.prog.analiza = true; save(); }
    const A = UI.an, s = BY[A.sym] || DATA.stocks[0], t = s.last, m = metrics(s), f = s.f || {}, tags = tagsAt(s, t);
    const isEtf = !isEquity(s);
    const P = s.ppy, rangeN = { '3M': Math.round(P / 4), '6M': Math.round(P / 2), '1R': P, '5L': s.last };
    const cur = s.cur;
    const vEl = (x, cls) => `<span class="v ${cls || ''}">${x}</span>`;
    const band = (x, cuts, labels) => { for (let i = 0; i < cuts.length; i++) if (x < cuts[i]) return labels[i]; return labels[labels.length - 1]; };
    const rsiTxt = m.rsi < 30 ? ['Wyprzedanie', 'warn', 'Kurs spadał szybko i mocno. To nie znaczy, że zaraz odbije.'] : m.rsi > 70 ? ['Wykupienie', 'warn', 'Kurs rósł szybko. Wejście po takim ruchu jest bardziej ryzykowne.'] : ['Neutralnie', '', 'Ani skrajnie wyprzedane, ani wykupione.'];
    const volTxt = band(m.vol, [0.25, 0.45], ['spokojna', 'średnio zmienna', 'bardzo zmienna']);
    const crit = criteria(s, m, tags, isEtf);
    const prof = S.cfg.profile;
    const C2 = crit[prof];
    const okN = C2.filter((c) => c.ok).length;
    const extUrl = s.synthetic ? null : s.cls === 'akcje-pl' ? 'https://stooq.pl/q/?s=' + encodeURIComponent(s.s.toLowerCase()) : 'https://finance.yahoo.com/quote/' + encodeURIComponent(s.y || s.s);
    const extName = s.cls === 'akcje-pl' ? 'stooq.pl' : 'Yahoo Finance';
    const grp = groupOf(s), gb = ROT_GROUPS[grp].bench;
    el.innerHTML = `
    <section class="fade">
      <div class="row between">
        <span class="eyebrow">Analiza · ${esc(CLASSES[s.cls])}</span>
        <label class="field" style="min-width:min(100%,320px)"><span class="faint">Wybierz spółkę, fundusz, surowiec lub kryptowalutę</span><select id="an-sym">${stockOptions(s.s)}</select></label>
      </div>
      <div class="row between" style="align-items:flex-end">
        <div class="stack">
          <h1>${esc(s.n)} ${s.synthetic ? '' : `<span class="muted" style="font-weight:500">${esc(s.s)}</span>`}</h1>
          <p class="muted">${esc(s.sec)} · ${MKT[s.m]} · ${esc(s.about)}</p>
          <div class="row">${trendChip(m.trend)} ${rotChip(s, gb, grp)} ${s.sx && BY[s.sx] ? rotChip(BY[s.sx], ROT_GROUPS[groupOf(BY[s.sx])].bench, groupOf(BY[s.sx]), 'Sektor ' + lab(BY[s.sx])) : ''} ${ruleChips(tags)}</div>
        </div>
        <div class="stat" style="text-align:right"><span class="k">Ostatnie zamknięcie (${fmtD(s.d[t])})</span><span class="v" style="font-size:30px">${fmtPx(m.price, s)}</span><span class="s">dziś ${chg(m.d1, 2)}</span></div>
      </div>
    </section>
    <div class="card stack-lg">
      <div class="row between">
        ${seg('an-range', [['3M', '3 mies.'], ['6M', '6 mies.'], ['1R', '1 rok'], ['5L', '5 lat']], A.range)}
        <div class="row">
          ${seg('an-ctype', [['line', 'Linia'], ['candle', 'Świece']], A.ctype)}
          ${[[20, 'c1'], [50, 'c2'], [200, 'c3']].map(([k, c]) => `<button type="button" class="chip" data-act="sma" data-k="${k}" aria-pressed="${!!A.sma[k]}"><i style="display:inline-block;width:12px;height:3px;border-radius:2px;background:var(--${c})"></i>SMA ${k}</button>`).join('')}
        </div>
      </div>
      ${chartBox('an-chart', 380)}
      <p class="faint">Najedź na wykres, żeby zobaczyć ceny z danego dnia. SMA to średnia cena zamknięcia z ostatnich 20, 50 lub 200 sesji (200 linią przerywaną).</p>
    </div>
    <section>
      <h2>Co mówi wykres</h2>
      <div class="grid g4">
        <div class="metric"><span class="t">Trend ${trendChip(m.trend)}</span>${vEl(fmtP(m.price / m.sma200 - 1), m.price > m.sma200 ? 'pos' : 'neg')}<span class="x">Cena względem średniej z 200 sesji. ${m.trend === 'up' ? 'Cena i średnia 50 są nad średnią 200: klasyczny trend wzrostowy.' : m.trend === 'down' ? 'Cena i średnia 50 są pod średnią 200: trend spadkowy.' : 'Sygnały trendu są mieszane.'}</span></div>
        <div class="metric"><span class="t">Zmiana ceny</span><dl class="kv"><dt>1 miesiąc</dt><dd>${chg(m.m1)}</dd><dt>3 miesiące</dt><dd>${chg(m.m3)}</dd><dt>1 rok</dt><dd>${chg(m.y1)}</dd><dt>3 lata</dt><dd>${chg(m.y3)}</dd></dl><span class="x">Przeszłe zmiany nie mówią, co będzie dalej.</span></div>
        <div class="metric"><span class="t">RSI (14) ${chip(rsiTxt[0], rsiTxt[1])}</span>${vEl(fmtN(m.rsi, 0))}<span class="x">${rsiTxt[2]}</span></div>
        <div class="metric"><span class="t">ATR (14)</span>${vEl(fmtM(m.atr, cur))}<span class="x">Zwykły dzienny ruch to około ${fmtM(m.atr, cur)}, czyli ${fmtPu(m.atrPct)} ceny. Stop bliżej niż to łatwo trafić przypadkiem.</span></div>
        <div class="metric"><span class="t">Zmienność roczna</span>${vEl(fmtPu(m.vol, 0))}<span class="x">Spółka ${volTxt}. Około 20% to spokojnie, ponad 45% to duże wahania.</span></div>
        <div class="metric"><span class="t">Najgorszy spadek w roku</span>${vEl(fmtP(m.mdd), 'neg')}<span class="x">Największy spadek od szczytu do dołka w ostatnich 12 miesiącach. Czy wytrzymałbyś taki?</span></div>
        <div class="metric"><span class="t">Od szczytu z 52 tygodni</span>${vEl(fmtP(m.fromHi))}<span class="x">Zakres roku: ${fmtM(m.lo52, cur)} – ${fmtM(m.hi52, cur)}.</span></div>
        <div class="metric"><span class="t">Płynność</span>${vEl(m.turnover > 0 ? fmtBig(m.turnover) : '–')}<span class="x">${s.synthetic ? 'Suma obrotu spółek z koszyka. ' : ''}Średni dzienny obrót z 20 sesji. ${!s.hasVol ? 'Brak danych o wolumenie.' : m.turnover < 2e6 ? 'Niski: trudniej kupić i sprzedać po dobrej cenie.' : m.turnover > 2e7 ? 'Wysoki: łatwo wejść i wyjść.' : 'Wystarczający dla małych zleceń.'}</span></div>
      </div>
    </section>
    ${athSection(s)}
    <section>
      <div class="row between"><h2>${isEtf ? 'Co warto wiedzieć o tym instrumencie' : 'Co mówią liczby firmy'}</h2>${extUrl ? `<a class="btn ghost" href="${extUrl}" target="_blank" rel="noopener">Sprawdź na ${extName} ↗</a>` : ''}</div>
      ${isEtf ? instrumentBlock(s, f) : `
      <div class="grid g4">
        ${fund('C/Z', f.pe, (x) => fmtN(x, 1), (x) => (x <= 0 ? 'Firma nie ma zysku za ostatni rok.' : x < 10 ? 'Nisko. Może to być okazja albo znak, że rynek widzi ryzyko.' : x <= 25 ? 'Umiarkowanie, typowo dla dojrzałych firm.' : 'Wysoko. Rynek liczy na szybki wzrost zysków.'), 'Ile płacisz za złotówkę rocznego zysku.')}
        ${fund('C/WK', f.pb, (x) => fmtN(x, 2), (x) => (x < 1 ? 'Poniżej wartości majątku netto.' : x <= 3 ? 'Typowo.' : 'Wysoko, częste u firm o wysokim ROE lub technologicznych.'), 'Cena do wartości księgowej.')}
        ${fund('Stopa dywidendy', f.dy, (x) => fmtPu(x), (x) => (x === 0 ? 'Nie płaci dywidendy albo brak danych.' : x < 0.02 ? 'Niska.' : x <= 0.05 ? 'Umiarkowana.' : 'Wysoka. Sprawdź, czy da się ją utrzymać.'), 'Wypłata z ostatniego roku względem ceny.')}
        ${fund('Marża netto', f.pm, (x) => fmtPu(x), (x) => (x < 0 ? 'Firma traci pieniądze.' : x < 0.05 ? 'Niska, typowa dla handlu.' : x <= 0.15 ? 'Przeciętna.' : 'Wysoka.'), 'Zysk netto z każdej złotówki przychodu.')}
        ${fund('ROE', f.roe, (x) => fmtPu(x), (x) => (x < 0.08 ? 'Słabo.' : x <= 0.15 ? 'Przyzwoicie.' : 'Wysoko. Firma dobrze pracuje kapitałem.'), 'Zysk z kapitału właścicieli.')}
        ${fund('Wzrost przychodów r/r', f.rg, (x) => fmtP(x), (x) => (x < 0 ? 'Przychody spadają.' : x <= 0.1 ? 'Umiarkowany wzrost.' : 'Szybki wzrost.'), 'Ostatni kwartał względem roku wcześniej.')}
        ${fund('Beta', f.beta, (x) => fmtN(x, 2), (x) => (x < 0.8 ? 'Zwykle spokojniejsza niż rynek.' : x <= 1.2 ? 'Rusza się podobnie jak rynek.' : 'Zwykle mocniejsze ruchy niż rynek.'), 'Ruchy akcji względem rynku.')}
        ${fund('Kapitalizacja', f.mcap, (x) => fmtBig(x, cur), (x) => (x > 1e11 ? 'Bardzo duża firma.' : x > 1e10 ? 'Duża firma.' : 'Średnia firma.'), 'Wartość wszystkich akcji.')}
      </div>`}
      <p class="faint">Źródło: Yahoo Finance (darmowe, nieoficjalne), pobrane ${fmtD(DATA.as_of)}. Liczby mogą zawierać błędy. Zawsze porównuj je z raportem spółki i z firmami z tej samej branży.</p>
    </section>
    <section class="grid g2">
      <div class="card stack-lg">
        <div class="row between"><h3>Karta oceny</h3>${seg('profile', [['long', 'Inwestor długoterminowy'], ['trader', 'Trader']], prof)}</div>
        <p class="muted">Spełnia <b>${okN} z ${C2.length}</b> kryteriów z listy ${prof === 'long' ? 'inwestora długoterminowego' : 'tradera'}. To lista rzeczy do sprawdzenia, nie rekomendacja.</p>
        <div>${C2.map((c) => `<div class="check"><span class="ic ${c.ok ? 'ok' : c.na ? 'na' : 'no'}">${c.ok ? '✓' : c.na ? '–' : '✕'}</span><div><b>${esc(c.n)}</b><div class="faint">${esc(c.why)}</div></div></div>`).join('')}</div>
      </div>
      <div class="stack-lg">
        ${mentorBox('analiza', 'Wyjaśnij mi tę spółkę prostym językiem', true)}
        <div class="card stack">
          <h3>Co dalej?</h3>
          <p class="muted">Sprawdź, jak plan transakcji na tej spółce zachowywał się w 10 000 powtórek, zaplanuj wielkość pozycji albo poćwicz na jej historii.</p>
          <div class="row"><button class="btn primary" data-act="to-mc" data-sym="${s.s}">Sprawdź szanse</button>${tradable(s) ? `<button class="btn" data-act="to-plan" data-sym="${s.s}">Zaplanuj transakcję</button><button class="btn" data-act="to-train" data-sym="${s.s}">Trenuj na tym walorze</button>` : ''}<button class="btn" data-act="to-rot" data-sym="${s.s}" data-g="${grp}">Zobacz rotację</button></div>
        </div>
      </div>
    </section>`;
    MENTOR_CTX.analiza = () => `Spółka: ${s.n} (${s.s}), ${s.sec}, rynek ${s.m === 'PL' ? 'GPW' : 'USA'}, waluta ${cur}. Opis: ${s.about}
Ostatnie zamknięcie ${fmtN(m.price)} (${fmtD(s.d[t])}), zmiana dzienna ${fmtP(m.d1, 2)}, 1 mies. ${fmtP(m.m1)}, 1 rok ${fmtP(m.y1)}, 3 lata ${fmtP(m.y3)}.
Trend: ${TREND[m.trend][0]}; cena ${fmtP(m.price / m.sma200 - 1)} względem SMA200. RSI14 ${fmtN(m.rsi, 0)}. ATR14 ${fmtN(m.atr)} (${fmtPu(m.atrPct)} ceny). Zmienność roczna ${fmtPu(m.vol, 0)}. Największy spadek w roku ${fmtP(m.mdd)}. Od szczytu 52 tyg. ${fmtP(m.fromHi)}. Średni obrót ${fmtBig(m.turnover)}.
Reguły skanera dziś: ${tags.map((k) => RULES[k].n).join(', ') || 'brak'}.
Fundamenty: C/Z ${fmtN(f.pe, 1)}, C/WK ${fmtN(f.pb, 2)}, dywidenda ${fmtPu(f.dy)}, marża netto ${fmtPu(f.pm)}, ROE ${fmtPu(f.roe)}, wzrost przychodów ${fmtP(f.rg)}, beta ${fmtN(f.beta, 2)}.
Karta oceny (${prof === 'long' ? 'inwestor długoterminowy' : 'trader'}): ${okN}/${C2.length}: ${C2.map((c) => (c.ok ? '✓ ' : '✕ ') + c.n).join('; ')}.
${(() => { const a = athInfo(s), CS = cycleStats(s, A.th || CYCLE_TH[s.cls] || 0.2); return `ATH ${fmtN(a.p)} z ${a.d} (historia od ${a.h0}), cena ${fmtP(a.from)} od ATH. Cykle przy progu bessy ${fmtPu(CS.th, 0)}: ${CS.rows.length}, średnio od dołka do ATH ${fmtDur(CS.avgRec)}, średnia hossa ${fmtDur(CS.avgBull)}, średnia bessa ${fmtDur(CS.avgBear)} (${fmtP(CS.avgDepth)}). Stan: ${CS.state.k === 'down' ? 'po bessie, od dołka ' + fmtP(CS.state.fromTrough) + ', do szczytu brakuje ' + fmtP(CS.state.toPeak) : 'hossa od ' + CS.state.start}.`; })()}`;
    const sel = document.getElementById('an-sym');
    sel.addEventListener('change', () => { A.sym = sel.value; A.th = null; render(); });
    historyChart(document.getElementById('ath-chart'), s, cycleStats(s, A.th || CYCLE_TH[s.cls] || 0.2));
    const n = rangeN[A.range];
    priceChart(document.getElementById('an-chart'), { s, i0: Math.max(0, t - n + 1), i1: t, type: A.ctype, sma: A.sma, lines: [], marks: [], anim: { key: ['an', s.s, A.range, A.ctype].join(':') } });
  }
  const CLASS_NOTE = {
    indeksy: 'To koszyk wielu spółek. Liczy się, jaki indeks odwzorowuje, ile kosztuje fundusz i jak szeroko rozkłada ryzyko.',
    'sektory-us': 'To fundusz z jednego sektora. Sektory krążą: raz prowadzą cykliczne, raz defensywne. Zobacz zakładkę Rotacja.',
    'branze-us': 'To fundusz z jednej, wąskiej branży. Zwykle rusza się mocniej niż cały rynek.',
    'sektory-pl': 'To koszyk spółek z GPW z równymi wagami, policzony w aplikacji. Nie kupisz go jako jednego instrumentu: kupujesz spółki z koszyka.',
    surowce: 'Surowce nie mają zysków ani dywidend. Cena zależy od podaży, popytu, dolara i nastrojów. Fundusze oparte na kontraktach mogą tracić przy przechodzeniu na kolejne kontrakty.',
    obligacje: 'Obligacje płacą odsetki. Ich ceny spadają, gdy rosną stopy procentowe, tym mocniej, im dłuższe obligacje. Stopa poniżej to bieżąca rentowność wypłat funduszu.',
    krypto: 'Kryptowaluty nie mają zysków ani przepływów pieniężnych, więc nie da się ich wycenić jak firmy. Cena opiera się wyłącznie na popycie. Spadki o 50–80% zdarzały się wielokrotnie.',
    waluty: 'Kurs waluty zależy od stóp procentowych, inflacji i przepływów kapitału między krajami. Ruchy są zwykle mniejsze niż na akcjach.',
  };
  function instrumentBlock(s, f) {
    const items = [
      isNum(f.pe) && fund('C/Z spółek w funduszu', f.pe, (x) => fmtN(x, 1), (x) => (x < 15 ? 'Nisko.' : x <= 25 ? 'Umiarkowanie.' : 'Wysoko.'), 'Średnia wycena spółek, które fundusz trzyma.'),
      isNum(f.dy) && fund(s.cls === 'obligacje' ? 'Rentowność wypłat' : 'Stopa dywidendy', f.dy, (x) => fmtPu(x), (x) => (x === 0 ? 'Fundusz nie wypłaca albo kapitalizuje dochody.' : ''), 'Wypłaty z ostatniego roku względem ceny.'),
      isNum(f.er) && fund('Roczny koszt funduszu', f.er, (x) => fmtPu(x, 2), (x) => (x < 0.002 ? 'Tani.' : x < 0.006 ? 'Przeciętny.' : 'Drogi.'), 'Opłata pobierana co roku z wartości funduszu.'),
      isNum(f.aum) && fund('Aktywa funduszu', f.aum, (x) => fmtBig(x, s.cur), (x) => (x > 1e9 ? 'Duży fundusz.' : 'Mniejszy fundusz.'), 'Ile pieniędzy zarządza fundusz.'),
      isNum(f.beta) && fund('Beta', f.beta, (x) => fmtN(x, 2), (x) => (x < 0.8 ? 'Zwykle spokojniej niż rynek akcji.' : x <= 1.2 ? 'Podobnie jak rynek.' : 'Mocniejsze ruchy niż rynek.'), 'Ruchy względem rynku akcji.'),
    ].filter(Boolean);
    return note('info', esc(CLASS_NOTE[s.cls] || '')) + (items.length ? `<div class="grid g4">${items.join('')}</div>` : '');
  }
  const CLS_GROUP = { 'akcje-pl': 'akcje-pl', 'akcje-us': 'akcje-us', 'sektory-us': 'sektory-us', 'branze-us': 'branze-us', 'sektory-pl': 'sektory-pl', indeksy: 'swiat', surowce: 'surowce', obligacje: 'obligacje', krypto: 'krypto', waluty: 'klasy' };
  function groupOf(s) {
    if (s.cls === 'indeksy' && s.m === 'PL') return 'polska';
    const g = CLS_GROUP[s.cls] || 'klasy';
    if (groupMembers(g, ROT_GROUPS[g].bench).includes(s)) return g;
    return ROT_GROUPS.klasy.ids.includes(s.s) ? 'klasy' : 'swiat';
  }
  function rotChip(s, benchId, grp, prefix) {
    const b = BY[benchId];
    if (!b || b === s) return '';
    const g = rrg(s, b), q = quadOf(g.ratio[b.last], g.mom[b.last]);
    if (!q) return '';
    return `<a class="chip ${QUAD[q][1]}" href="#rotacja" data-act="to-rot" data-sym="${s.s}" data-g="${grp}" title="${esc(QUAD[q][2])}">${esc(prefix || 'Rotacja')} vs ${esc(lab(b))}: ${QUAD[q][0]}</a>`;
  }
  function fund(name, x, fmt, interp, what) {
    if (!isNum(x)) return `<div class="metric"><span class="t">${name}</span><span class="v faint">–</span><span class="x">${what} Brak danych w źródle.</span></div>`;
    return `<div class="metric"><span class="t">${name}</span><span class="v">${fmt(x)}</span><span class="x">${what} ${interp(x)}</span></div>`;
  }
  function criteria(s, m, tags, isEtf) {
    const f = s.f || {};
    const long = [
      { n: 'Trend wzrostowy', ok: m.price > m.sma200, why: `Cena ${m.price > m.sma200 ? 'nad' : 'pod'} średnią z 200 sesji.` },
      isEtf ? (() => { const dv = ['indeksy', 'sektory-us', 'branze-us', 'sektory-pl', 'obligacje'].includes(s.cls) || s.s === 'DBC' || s.s === 'DBA'; return { n: 'Szeroka dywersyfikacja', ok: dv, why: dv ? 'Instrument obejmuje wiele spółek, obligacji lub surowców naraz.' : 'Jeden surowiec, waluta albo kryptowaluta: całe ryzyko w jednym miejscu.' }; })() : { n: 'Firma zarabia', ok: isNum(f.pm) && f.pm > 0, na: !isNum(f.pm), why: isNum(f.pm) ? `Marża netto ${fmtPu(f.pm)}.` : 'Brak danych o marży.' },
      isEtf ? { n: 'Rozsądna wycena', ok: isNum(f.pe) && f.pe < 30, na: !isNum(f.pe), why: isNum(f.pe) ? `Średnie C/Z spółek w funduszu ${fmtN(f.pe, 1)} (kryterium: poniżej 30).` : 'Tego instrumentu nie wycenia się wskaźnikiem C/Z.' } : { n: 'Rozsądna wycena', ok: isNum(f.pe) && f.pe > 0 && f.pe <= 25, na: !isNum(f.pe), why: isNum(f.pe) ? `C/Z ${fmtN(f.pe, 1)} (kryterium: od 0 do 25).` : 'Brak danych o C/Z.' },
      { n: 'Umiarkowana zmienność', ok: m.vol < 0.35, why: `Zmienność roczna ${fmtPu(m.vol, 0)} (kryterium: poniżej 35%).` },
      tradable(s) ? { n: 'Dobra płynność', ok: m.turnover > 2e6, why: `Obrót ${fmtBig(m.turnover)} dziennie (kryterium: ponad 2 mln zł).` } : { n: 'Dobra płynność', ok: false, na: true, why: 'Koszyka nie kupisz jako jednego instrumentu.' },
      { n: 'Spadek do zniesienia', ok: m.mdd > -0.3, why: `Najgorszy spadek w roku ${fmtP(m.mdd)} (kryterium: płycej niż −30%).` },
    ];
    const scanHit = tags.filter((k) => RULES[k].src === 'skaner');
    const trader = [
      { n: 'Pasuje do reguły skanera', ok: scanHit.length > 0, why: scanHit.length ? scanHit.map((k) => RULES[k].n).join(', ') + '.' : 'Dziś nie pasuje do żadnej z pięciu reguł.' },
      { n: 'Cena nad średnią z 50 sesji', ok: m.price > m.sma50, why: `Średnia 50: ${fmtN(m.sma50)}.` },
      { n: 'RSI bez skrajności', ok: m.rsi >= 30 && m.rsi <= 70, why: `RSI ${fmtN(m.rsi, 0)} (kryterium: od 30 do 70).` },
      { n: 'Zdrowy dzienny ruch', ok: m.atrPct >= 0.01 && m.atrPct <= 0.05, why: `ATR to ${fmtPu(m.atrPct)} ceny (kryterium: od 1% do 5%).` },
      tradable(s) ? { n: 'Wysoka płynność', ok: m.turnover > 5e6, why: `Obrót ${fmtBig(m.turnover)} dziennie (kryterium: ponad 5 mln zł).` } : { n: 'Wysoka płynność', ok: false, na: true, why: 'Koszyka nie kupisz jako jednego instrumentu.' },
      { n: 'Bez dużych luk ostatnio', ok: m.maxGap < 0.05, why: `Największa luka na otwarciu w 10 sesjach: ${fmtPu(m.maxGap)} (kryterium: poniżej 5%).` },
    ];
    return { long, trader };
  }

  function vPrognoza(el) {
    const M = UI.mc;
    el.innerHTML = `
    <section class="fade">
      <span class="eyebrow">Wehikuł czasu · symulacja Monte Carlo</span>
      <h1>Prognoza to <span class="hl">zakres scenariuszy</span>, nie jedna liczba</h1>
      <p class="muted" style="max-width:70ch">Nikt nie wie, ile spółka będzie kosztować za miesiąc. Da się za to policzyć, jak często plan trafiał w cel, a jak często w stop, gdyby przyszłość była podobna do przeszłości tej spółki.</p>
      <div>${seg('mc-mode', [['trade', 'Transakcja: cel czy stop?'], ['long', 'Oszczędzanie przez lata']], M.mode)}</div>
    </section>
    <div id="mc-body"></div>`;
    if (M.mode === 'long') return vLong(document.getElementById('mc-body'));
    const s = BY[M.sym] || DATA.stocks[0], t = s.last;
    if (!isNum(M.entry)) M.entry = s.c[t];
    const body = document.getElementById('mc-body');
    body.innerHTML = `
    <div class="card stack-lg">
      <div class="fields">
        <label class="field">Spółka<select id="mc-sym">${stockOptions(s.s)}</select></label>
        <label class="field">Cena wejścia (${s.cur})<input type="number" id="mc-entry" value="${M.entry}" step="${s.tick}" min="0"></label>
        ${stopFields('mc', M, s, t, M.entry)}
        <label class="field">Horyzont<select id="mc-h">${[5, 10, 20, 60].map((h) => `<option value="${h}"${h === M.H ? ' selected' : ''}>${h} sesji (${h === 5 ? 'tydzień' : h === 10 ? '2 tygodnie' : h === 20 ? 'miesiąc' : 'kwartał'})</option>`).join('')}</select></label>
        <label class="field">Z jakich dni losować<select id="mc-pool">${[[252, 'ostatni rok'], [504, 'ostatnie 2 lata'], [1250, 'całe 5 lat']].map(([v, l]) => `<option value="${v}"${v === M.pool ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Historia: wejścia w dni<select id="mc-filter"><option value="all">każdy dzień</option>${Object.entries(RULES).map(([k, r]) => `<option value="${k}"${k === M.filter ? ' selected' : ''}>gdy pasuje: ${esc(r.n)}</option>`).join('')}</select></label>
        <label class="field">Ziarno losowania<input type="number" id="mc-seed" value="${M.seed}" step="1" min="1"></label>
      </div>
      <div class="row"><button class="btn primary" data-act="mc-run">Uruchom 10 000 powtórek</button><span class="faint" id="mc-note"></span></div>
    </div>
    <div id="mc-out"></div>`;
    const rerun = () => { runMc(); };
    document.getElementById('mc-sym').addEventListener('change', (e) => { M.sym = e.target.value; M.entry = null; UI.mcRes = null; render(); });
    document.getElementById('mc-entry').addEventListener('change', (e) => { M.entry = parseFloat(e.target.value); rerun(); });
    bindStopFields('mc', M, (structural) => { if (structural) { UI.mcRes = null; render(); } else rerun(); }, s, t, () => M.entry);
    for (const [id, k] of [['mc-h', 'H'], ['mc-pool', 'pool'], ['mc-seed', 'seed']]) document.getElementById(id).addEventListener('change', (e) => { M[k] = parseInt(e.target.value, 10) || 1; rerun(); });
    document.getElementById('mc-filter').addEventListener('change', (e) => { M.filter = e.target.value; rerun(); });
    runMc();
  }
  function runMc() {
    const M = UI.mc, s = BY[M.sym], t = s.last, out = document.getElementById('mc-out');
    if (!out) return;
    const stop = calcStop(s, t, M.entry, M.stopRule, M.stopVal), plan = exitPlan(M.entry, stop, M.R);
    if (plan.errors.length) { out.innerHTML = note('bad', '<b>Nie da się uruchomić symulacji.</b> ' + plan.errors.map(esc).join(' ')); return; }
    const r = mcTrade({ s, t, entry: plan.entry, stop: plan.stop, target: plan.target, H: M.H, poolN: M.pool, seed: M.seed });
    const hRule = M.stopRule === 'price' ? 'pct' : M.stopRule, hVal = M.stopRule === 'price' ? (plan.risk / plan.entry) * 100 : M.stopVal;
    const hist = historyTest({ s, H: M.H, stopRule: hRule, stopVal: hVal, R: M.R, filter: M.filter, upto: t });
    const v = verdictOf(r);
    UI.mcRes = r; UI.histRes = hist;
    if (!S.prog.mc) { S.prog.mc = true; save(); }
    const cur = s.cur, f = (x) => fmtPx(x, s);
    out.innerHTML = `
    <section class="stack-lg fade">
      <div class="card raised stack-lg">
        <div class="stats">
          <div class="stat"><span class="k">Cel pierwszy</span><span class="v pos">${fmtPu(r.tgt)}</span><span class="s">dotarł do ${f(r.target)} przed stopem</span></div>
          <div class="stat"><span class="k">Stop pierwszy</span><span class="v neg">${fmtPu(r.stp)}</span><span class="s">spadł do ${f(r.stop)} przed celem</span></div>
          <div class="stat"><span class="k">Żadne</span><span class="v">${fmtPu(r.nei)}</span><span class="s">wciąż otwarte po ${r.H} sesjach</span></div>
          <div class="stat"><span class="k">Na plusie</span><span class="v">${fmtPu(r.green)}</span><span class="s">cel albo cena powyżej wejścia na końcu</span></div>
        </div>
        <div class="stack">
          <div class="verdict"><span class="chip ${v.cls}">Werdykt</span>${esc(v.head)}</div>
          ${v.lines.map((l) => `<p class="muted">${esc(l)}</p>`).join('')}
          <p class="muted">Średnie R: <b class="num">${fmtN(r.avgR, 3)}</b>. Cena po ${r.H} sesjach: mediana <b class="num">${f(r.med)}</b>, 90% powtórek między <span class="num">${f(r.q05)}</span> a <span class="num">${f(r.q95)}</span>.</p>
          ${r.gapStop > 0.005 ? `<p class="muted">W ${fmtPu(r.gapStop)} powtórek sesja otworzyła się z luką poniżej stopu, więc strata była większa niż 1R (najgorsza: ${fmtN(r.worstR, 2)}R). Tak działa prawdziwy rynek.</p>` : ''}
        </div>
      </div>
      <div class="grid g2">
        <div class="card stack">
          <h3>Wachlarz cen w kolejnych sesjach</h3>
          <div class="legend"><span><i style="background:var(--seq-1);height:10px"></i>90% powtórek</span><span><i style="background:var(--seq-2);height:10px"></i>połowa powtórek</span><span><i style="background:var(--seq-4)"></i>mediana</span><span><i style="background:var(--ink-3)"></i>36 przykładowych ścieżek</span></div>
          ${chartBox('fan', 300)}
        </div>
        <div class="card stack">
          <h3>Gdzie cena kończy po ${r.H} sesjach</h3>
          <div class="legend"><span><i style="background:var(--bad);height:10px"></i>poniżej stopu</span><span><i style="background:var(--ink-3);height:10px"></i>pomiędzy</span><span><i style="background:var(--good);height:10px"></i>powyżej celu</span></div>
          ${chartBox('hist', 300)}
        </div>
      </div>
      <div class="card stack">
        <h3>Historia: ta sama reguła na prawdziwych dniach</h3>
        ${hist.n ? `<p>Od ${fmtD(hist.from)} do ${fmtD(hist.to)} reguła „${M.filter === 'all' ? 'wejście na zamknięciu każdego dnia' : 'wejście, gdy pasuje: ' + RULES[M.filter].n}” zadziałała <b>${hist.n}</b> ${plural(hist.n, 'raz', 'razy', 'razy')}: <b class="pos">${hist.tg}</b> razy cel, <b class="neg">${hist.st}</b> razy stop, <b>${hist.ne}</b> razy żadne. Średnie R: <b class="num">${fmtN(hist.avgR, 3)}</b>.</p>
        <p class="muted">${hist.n < 30 ? 'Mniej niż 30 przypadków to za mało, żeby wyciągać wnioski. ' : ''}${(hist.avgR > 0) !== (r.avgR > 0) ? 'Historia i symulacja wskazują w różne strony. Taki plan nie ma wyraźnej przewagi. ' : ''}To, co się wydarzyło, nie musi się powtórzyć. Wejścia z kolejnych dni nakładają się na siebie, więc nie są niezależnymi próbami.</p>` : '<p class="muted">Reguła nie zadziałała ani razu w danych. Wybierz inną regułę albo „każdy dzień”.</p>'}
      </div>
      <div class="grid g2">
        ${mentorBox('mc', 'Wyjaśnij mi ten wynik', true)}
        <div class="card stack">
          <p class="faint">Symulacja: ${r.reps.toLocaleString(PL)} powtórek, ziarno ${r.seed} (to samo ziarno daje te same liczby), losowanie z ${r.poolN} prawdziwych sesji ${esc(s.n)}. Każda powtórka bierze losowy dzień z przeszłości i przykłada jego ruch (otwarcie, maksimum, minimum, zamknięcie) do bieżącej ceny. Sesja, która dotyka i stopu, i celu, liczy się jako stop. To rachunek na danych z przeszłości, nie prognoza. Wyniki, wiadomości i nastroje mogą zrobić rzeczy, których w tych danych nie było.</p>
          <div class="row"><button class="btn primary" data-act="mc-to-plan">Zaplanuj tę transakcję</button></div>
        </div>
      </div>
    </section>`;
    MENTOR_CTX.mc = () => `Spółka ${s.n} (${s.s}). Plan: wejście ${fmtN(r.entry)} ${cur}, stop ${fmtN(r.stop)}, cel ${fmtN(r.target)} (${fmtN(r.R, 1)}R), horyzont ${r.H} sesji.
Monte Carlo (${r.reps} powtórek z ${r.poolN} prawdziwych sesji): cel pierwszy ${fmtPu(r.tgt)}, stop pierwszy ${fmtPu(r.stp)}, żadne ${fmtPu(r.nei)}, na plusie ${fmtPu(r.green)}, średnie R ${fmtN(r.avgR, 3)}, luka pod stopem w ${fmtPu(r.gapStop)} powtórek.
Werdykt: ${v.head}. ${v.lines.join(' ')}
Historia tej reguły: ${hist.n} przypadków, cel ${hist.tg}, stop ${hist.st}, żadne ${hist.ne}, średnie R ${fmtN(hist.avgR, 3)}.`;
    const mk = ['mc', M.sym, M.entry, M.stopRule, M.stopVal, M.R, M.H, M.pool, M.seed].join(':');
    fanChart(document.getElementById('fan'), r, cur, mk);
    histChart(document.getElementById('hist'), r, cur, mk);
    showMentors();
  }
  function vLong(el) {
    const L = UI.lt;
    const presets = { safe: ['Ostrożny (głównie obligacje)', 4, 5], mix: ['Zrównoważony (pół na pół)', 5.5, 10], global: ['Akcje globalne (szeroki ETF)', 7, 16], hist: ['Historia ETF S&P 500 (5 lat)', null, null], custom: ['Własne założenie', null, null] };
    el.innerHTML = `
    <div class="card stack-lg">
      <div class="fields">
        <label class="field">Wpłata na start (zł)<input type="number" id="lt-init" value="${L.init}" min="0" step="500"></label>
        <label class="field">Co miesiąc (zł)<input type="number" id="lt-monthly" value="${L.monthly}" min="0" step="50"></label>
        <label class="field">Ile lat<input type="number" id="lt-years" value="${L.years}" min="1" max="40" step="1"></label>
        <label class="field">Założenie<select id="lt-preset">${Object.entries(presets).map(([k, p]) => `<option value="${k}"${k === L.preset ? ' selected' : ''}>${p[0]}</option>`).join('')}</select></label>
        <label class="field">Średni zwrot roczny (%)<input type="number" id="lt-mu" value="${L.mu}" step="0.5"></label>
        <label class="field">Zmienność roczna (%)<input type="number" id="lt-sigma" value="${L.sigma}" step="1" min="0"></label>
        <label class="field">Konto<select id="lt-acct"><option value="zwykly"${L.acct === 'zwykly' ? ' selected' : ''}>Zwykły rachunek (podatek Belki 19%)</option><option value="ike"${L.acct === 'ike' ? ' selected' : ''}>IKE (bez podatku przy spełnieniu warunków)</option></select></label>
      </div>
      <p class="faint" id="lt-src"></p>
    </div>
    <div id="lt-out"></div>`;
    const run = () => {
      if (L.preset === 'hist') {
        const etf = BY.SPY, a = annualStats(etf);
        L.mu = round2(a.mu * 100); L.sigma = round2(a.sigma * 100);
        document.getElementById('lt-mu').value = L.mu; document.getElementById('lt-sigma').value = L.sigma;
        document.getElementById('lt-src').textContent = `Z 5 lat notowań ${etf.n} w dolarach: ${fmtN(L.mu, 1)}% rocznie przy zmienności ${fmtN(L.sigma, 0)}%. Pięć lat to bardzo krótki okres, a dobre lata zawyżają średnią. Nie zakładaj, że tak będzie dalej.`;
      } else {
        document.getElementById('lt-src').textContent = 'Założenia są przykładowe i uproszczone. Żaden zwrot nie jest gwarantowany, a kwoty są nominalne: inflacja zmniejsza ich siłę nabywczą.';
      }
      const r = mcLong({ init: L.init, monthly: L.monthly, years: clamp(L.years | 0, 1, 40), mu: L.mu / 100, sigma: Math.max(0, L.sigma) / 100 });
      const Y = r.p50.length - 1, dep = r.dep[Y], med = r.p50[Y];
      const tax = L.acct === 'ike' ? 0 : Math.max(0, med - dep) * 0.19;
      document.getElementById('lt-out').innerHTML = `
      <section class="stack-lg fade">
        <div class="card raised stats">
          <div class="stat"><span class="k">Wpłacisz łącznie</span><span class="v">${fmtM(dep, 'PLN', 0)}</span><span class="s">przez ${Y} ${plural(Y, 'rok', 'lata', 'lat')}</span></div>
          <div class="stat"><span class="k">Mediana na końcu</span><span class="v">${fmtM(med, 'PLN', 0)}</span><span class="s">połowa scenariuszy lepiej, połowa gorzej</span></div>
          <div class="stat"><span class="k">Słabszy scenariusz</span><span class="v">${fmtM(r.p10[Y], 'PLN', 0)}</span><span class="s">1 na 10 kończy jeszcze niżej</span></div>
          <div class="stat"><span class="k">Lepszy scenariusz</span><span class="v">${fmtM(r.p90[Y], 'PLN', 0)}</span><span class="s">1 na 10 kończy jeszcze wyżej</span></div>
          <div class="stat"><span class="k">${L.acct === 'ike' ? 'Oszczędność na podatku' : 'Podatek Belki (mediana)'}</span><span class="v">${fmtM(L.acct === 'ike' ? Math.max(0, med - dep) * 0.19 : tax, 'PLN', 0)}</span><span class="s">${L.acct === 'ike' ? 'na IKE przy spełnieniu warunków' : '19% od zysku przy wypłacie'}</span></div>
          <div class="stat"><span class="k">Strata na końcu</span><span class="v">${fmtPu(r.lossShare, 0)}</span><span class="s">scenariuszy kończy poniżej wpłat</span></div>
        </div>
        <div class="card stack">
          <h3>Wartość portfela w kolejnych latach</h3>
          <div class="legend"><span><i style="background:var(--seq-1);height:10px"></i>8 na 10 scenariuszy</span><span><i style="background:var(--seq-2);height:10px"></i>połowa scenariuszy</span><span><i style="background:var(--seq-4)"></i>mediana</span><span><i style="background:var(--ink)"></i>suma wpłat</span></div>
          ${chartBox('lt-chart', 320)}
          <p class="faint">4 000 losowych scenariuszy miesiąc po miesiącu, ziarno 7. Wpłata miesięczna dopisywana na koniec każdego miesiąca. Podatek liczony uproszczeniem: 19% od zysku przy jednorazowej wypłacie na końcu. Na IKE i IKZE obowiązują roczne limity wpłat i warunki wypłaty, sprawdź je aktualnie.</p>
        </div>
      </section>`;
      longChart(document.getElementById('lt-chart'), r, ['lt', L.init, L.monthly, L.years, L.mu, L.sigma].join(':'));
    };
    for (const [id, k] of [['lt-init', 'init'], ['lt-monthly', 'monthly'], ['lt-years', 'years'], ['lt-mu', 'mu'], ['lt-sigma', 'sigma']]) {
      document.getElementById(id).addEventListener('change', (e) => { L[k] = parseFloat(e.target.value) || 0; if (k === 'mu' || k === 'sigma') { L.preset = 'custom'; document.getElementById('lt-preset').value = 'custom'; } run(); });
    }
    document.getElementById('lt-preset').addEventListener('change', (e) => { L.preset = e.target.value; const p = presets[L.preset]; if (p && p[1] != null) { L.mu = p[1]; L.sigma = p[2]; document.getElementById('lt-mu').value = L.mu; document.getElementById('lt-sigma').value = L.sigma; } run(); });
    document.getElementById('lt-acct').addEventListener('change', (e) => { L.acct = e.target.value; run(); });
    run();
  }

  function heat(x, scale, d = 1) {
    if (!isNum(x)) return '<td class="r faint">–</td>';
    const p = Math.round(Math.min(1, Math.abs(x) / scale) * 42);
    return `<td class="r num" style="background:color-mix(in srgb, var(--${x >= 0 ? 'good' : 'bad'}) ${p}%, transparent)">${fmtP(x, d)}</td>`;
  }
  function riskRegime() {
    const OFF = ['XLK', 'XLY', 'XLF', 'XLI', 'XLB', 'XLC', 'SMH', 'IWM', 'HYG', 'EEM', 'CPER', 'BTC'];
    const DEF = ['XLP', 'XLU', 'XLV', 'XLRE', 'TLT', 'IEF', 'SHY', 'GLD', 'UUP'];
    const avg = (ids, k) => { const v = ids.map((id) => BY[id] && metrics(BY[id])[k]).filter(isNum); return v.length ? sum(v) / v.length : null; };
    return [['w1', 'Tydzień'], ['m1', 'Miesiąc'], ['m3', 'Kwartał']].map(([k, n]) => ({ k, n, off: avg(OFF, k), def: avg(DEF, k) }));
  }
  function vRotacja(el) {
    if (!S.prog.rot) { S.prog.rot = true; save(); }
    const R = UI.rot;
    if (!ROT_GROUPS[R.g]) R.g = 'sektory-us';
    const G = ROT_GROUPS[R.g], benchId = R.bench && BY[R.bench] ? R.bench : G.bench, b = BY[benchId];
    const { rows, tb } = rotRows(R.g, benchId, R.tail);
    const L = rotLists(rows);
    if (R.sel && !rows.some((x) => x.s.s === R.sel)) R.sel = null;
    const byQ = (q) => rows.filter((x) => x.q0 === q).sort((a, c) => c.r - a.r);
    const moved1 = rows.filter((x) => x.q1 && x.q0 !== x.q1);
    const moved5 = rows.filter((x) => x.q5 && x.q0 !== x.q5 && x.q0 === x.q1);
    const upRank = rows.filter((x) => x.dRank > 0).sort((a, c) => c.dRank - a.dRank).slice(0, 4);
    const dnRank = rows.filter((x) => x.dRank < 0).sort((a, c) => a.dRank - c.dRank).slice(0, 4);
    const withFlow = rows.filter((x) => x.fl && isNum(x.fl.cmf5));
    const regime = riskRegime();
    const sorters = { r: (a, c) => c.r - a.r, mo: (a, c) => c.mo - a.mo, d: (a, c) => c.dRank - a.dRank, m1: (a, c) => (c.m.m1 ?? -9) - (a.m.m1 ?? -9), cmf: (a, c) => (c.fl?.cmf20 ?? -9) - (a.fl?.cmf20 ?? -9) };
    const tbl = rows.slice().sort(sorters[R.sort] || sorters.r);
    const qchip = (q) => (q ? chip(QUAD[q][0], QUAD[q][1]) : '');
    const nm = (x) => `<button type="button" class="linkish" data-act="rot-sel" data-sym="${x.s.s}"><b>${esc(lab(x.s))}</b> ${x.s.synthetic ? '' : `<span class="muted">${esc(x.s.n)}</span>`}</button>`;
    const item = (x, ic, sym, why, extra = '') => `<div class="check"><span class="ic ${ic}">${sym}</span><div>${nm(x)} ${extra}<div class="faint">${why}</div></div></div>`;
    const flowTxt = (x) => (x.fl ? `napływ (CMF 20) ${fmtN(x.fl.cmf20, 2)}` : 'bez danych o wolumenie');
    const sel = rows.find((x) => x.s.s === R.sel);
    el.innerHTML = `
    <section class="fade">
      <span class="eyebrow">Rotacja kapitału · siła względna i szacowane przepływy</span>
      <h1>Dokąd <span class="hl">płynie kapitał</span></h1>
      <p class="muted" style="max-width:72ch">Kapitał krąży między klasami aktywów i sektorami. Ten widok pokazuje, co radzi sobie lepiej od benchmarku, czy ta przewaga rośnie i gdzie wolumen sugeruje napływ albo odpływ pieniędzy. To narzędzie do średnioterminowego swing tradingu, a nie lista zakupów.</p>
    </section>
    <div class="card stack-lg">
      <div class="row between"><h3>Apetyt na ryzyko</h3><span class="faint">ofensywne minus defensywne, średnia zmiana ceny</span></div>
      <div class="stats">${regime.map((g) => { const d = isNum(g.off) && isNum(g.def) ? g.off - g.def : null; return `<div class="stat"><span class="k">${g.n}</span><span class="v ${d >= 0 ? 'pos' : 'neg'}">${isNum(d) ? (d >= 0 ? '+' : '−') + fmtN(Math.abs(d) * 100, 1) + ' pp' : '–'}</span><span class="s">${d == null ? '' : d >= 0 ? 'kapitał szuka ryzyka' : 'kapitał chowa się w bezpieczniejszych aktywach'}</span></div>`; }).join('')}</div>
      <p class="faint">Ofensywne: technologia, dobra cykliczne, finanse, przemysł, materiały, komunikacja, półprzewodniki, małe spółki, obligacje wysokodochodowe, rynki wschodzące, miedź, bitcoin. Defensywne: dobra podstawowe, użyteczność publiczna, ochrona zdrowia, nieruchomości, obligacje skarbowe, złoto, dolar. To uproszczona miara nastroju, a nie sygnał.</p>
    </div>
    <div class="card stack-lg">
      <div class="fields">
        <label class="field">Co porównać<select id="rot-g">${Object.entries(ROT_GROUPS).map(([k, g]) => `<option value="${k}"${k === R.g ? ' selected' : ''}>${esc(g.n)}</option>`).join('')}</select><span class="hint">${esc(G.d)}</span></label>
        <label class="field">Względem czego (benchmark)<select id="rot-b">${Object.entries(BENCHES).map(([k, n]) => `<option value="${k}"${k === benchId ? ' selected' : ''}>${esc(n)}${k === G.bench ? ' (domyślny)' : ''}</option>`).join('')}</select><span class="hint">Siła względna to cena waloru podzielona przez cenę benchmarku.</span></label>
        <div class="field">Ogon na wykresie ${seg('rot-tail', [['d', '10 ostatnich sesji'], ['w', '8 ostatnich tygodni']], R.tail)}<span class="hint">Dane do ${fmtD(b.d[tb])}.</span></div>
      </div>
    </div>
    <div class="split" style="grid-template-columns:minmax(0,1fr) 340px">
      <div class="card stack">
        <div class="row between"><h3>Wykres rotacji</h3><span class="faint">${rows.length} walorów względem ${esc(lab(b))}</span></div>
        ${chartBox('rrg', 460)}
        <p class="faint">Każda kropka to walor, a ogon pokazuje jego drogę. Walory zwykle krążą zgodnie z ruchem wskazówek zegara: Poprawiające się → Liderzy → Słabnące → Maruderzy. Kliknij kropkę, żeby zobaczyć szczegóły.</p>
      </div>
      <div class="stack">
        ${['lead', 'impr', 'weak', 'lag'].map((q) => { const list = byQ(q); return `<div class="metric"><span class="t">${qchip(q)}<span class="num">${list.length}</span></span><span class="x">${QUAD[q][2]}</span><div class="row" style="gap:4px;margin-top:4px">${list.map((x) => `<button type="button" class="chip" data-act="rot-sel" data-sym="${x.s.s}" title="${esc(x.s.n)}" aria-pressed="${x.s.s === R.sel}">${esc(lab(x.s))}</button>`).join('') || '<span class="faint">brak</span>'}</div></div>`; }).join('')}
      </div>
    </div>
    ${sel ? rotDetail(sel, b) : ''}
    <section class="grid g2">
      <div class="card stack">
        <h3>Z dnia na dzień</h3>
        <p class="faint">Zmiany ćwiartek między ${fmtD(b.d[tb - 1])} a ${fmtD(b.d[tb])}.</p>
        <div>${moved1.length ? moved1.map((x) => item(x, QUAD[x.q0][1] === 'good' ? 'ok' : QUAD[x.q0][1] === 'bad' ? 'no' : 'wa', '→', `${QUAD[x.q1][0]} → <b>${QUAD[x.q0][0]}</b>`)).join('') : '<p class="muted">Od wczoraj żaden walor nie zmienił ćwiartki.</p>'}</div>
        ${moved5.length ? `<p class="faint">W ostatnim tygodniu (od ${fmtD(b.d[tb - 5])}):</p><div>${moved5.map((x) => item(x, 'na', '→', `${QUAD[x.q5][0]} → <b>${QUAD[x.q0][0]}</b>`)).join('')}</div>` : ''}
        ${upRank.length || dnRank.length ? `<p class="faint">Ranking siły względnej, zmiana od wczoraj:</p><div class="row" style="gap:6px">${upRank.map((x) => `<button type="button" class="chip good" data-act="rot-sel" data-sym="${x.s.s}">▲${x.dRank} ${esc(lab(x.s))}</button>`).join('')}${dnRank.map((x) => `<button type="button" class="chip bad" data-act="rot-sel" data-sym="${x.s.s}">▼${-x.dRank} ${esc(lab(x.s))}</button>`).join('')}</div>` : ''}
      </div>
      <div class="card stack">
        <h3>Przepływy z ostatnich dni</h3>
        ${withFlow.length ? `<p class="faint">Szacunek z ceny i wolumenu, w złotych. Dodatni: sesje zamykały się wysoko przy dużym obrocie.</p>
        <div class="table-wrap"><table><thead><tr><th>Walor</th><th class="r">Dziś</th><th class="r">5 sesji</th><th class="r">CMF 5</th><th class="r">CMF 20</th><th class="r">Zmiana od wczoraj</th></tr></thead><tbody>
        ${withFlow.slice().sort((a, c) => c.fl.cmf5 - a.fl.cmf5).filter((x, i, arr) => i < 4 || i >= arr.length - 4).map((x) => `<tr class="click" data-act="rot-sel" data-sym="${x.s.s}"><td><b>${esc(lab(x.s))}</b></td><td class="r num ${x.fl.f1 >= 0 ? 'pos' : 'neg'}">${fmtSigned(x.fl.f1)}</td><td class="r num ${x.fl.f5 >= 0 ? 'pos' : 'neg'}">${fmtSigned(x.fl.f5)}</td><td class="r num">${fmtN(x.fl.cmf5, 2)}</td><td class="r num">${fmtN(x.fl.cmf20, 2)}</td><td class="r num ${x.fl.cmf20 - x.fl.cmf20y >= 0 ? 'pos' : 'neg'}">${x.fl.cmf20 - x.fl.cmf20y >= 0 ? '+' : '−'}${fmtN(Math.abs(x.fl.cmf20 - x.fl.cmf20y), 3)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">W tej grupie nie ma danych o wolumenie. Przepływ widać tylko w sile względnej.</p>'}
      </div>
    </section>
    <section class="grid g2">
      <div class="card stack">
        <div class="row between"><h3>Swing: wzrostowe z napływem</h3>${chip('do obserwacji', 'good')}</div>
        <p class="faint">Liderzy w trendzie wzrostowym (cena nad średnią z 50 sesji), z napływem kapitału tam, gdzie jest wolumen. Niżej: wczesna rotacja, czyli walory, które zaczynają odrabiać.</p>
        <div>${L.lead.slice(0, 6).map((x) => item(x, 'ok', '↑', `siła ${fmtN(x.r, 1)}, pęd ${fmtN(x.mo, 1)}, 1 mies. ${fmtP(x.m.m1)}, ${flowTxt(x)}`)).join('') || '<p class="muted">Żaden walor nie spełnia wszystkich warunków. Nie trzeba grać, gdy rynek nie daje czytelnych liderów.</p>'}</div>
        ${L.impr.length ? `<p class="faint">Wczesna rotacja (Poprawiające się):</p><div>${L.impr.slice(0, 4).map((x) => item(x, 'na', '↗', `siła ${fmtN(x.r, 1)}, pęd ${fmtN(x.mo, 1)}, ${flowTxt(x)}`)).join('')}</div>` : ''}
      </div>
      <div class="card stack">
        <div class="row between"><h3>Odpływ i niedowartościowanie</h3>${chip('ostrożnie', 'warn')}</div>
        <p class="faint">Najpierw walory, z których kapitał odpływa. Niżej te, które po odpływie są tanie względem benchmarku lub własnej historii. Tanie potrafi tanieć dalej: szukaj oznak zmiany.</p>
        <div>${L.out.slice(0, 5).map((x) => item(x, 'no', '↓', `${QUAD[x.q0][0]}, siła ${fmtN(x.r, 1)}, ${flowTxt(x)}`)).join('') || '<p class="muted">Brak wyraźnego odpływu w tej grupie.</p>'}</div>
        ${L.cheap.length ? `<p class="faint">Niedowartościowane po odpływie:</p><div>${L.cheap.slice(0, 6).map((x) => item(x, x.turning ? 'na' : 'wa', x.turning ? '↗' : '!', `6 mies. vs ${esc(lab(b))}: ${fmtP(x.rel6)}${x.relPE != null ? `, C/Z ${fmtP(x.relPE - 1, 0)} względem benchmarku` : ''}${x.z != null ? `, cena ${fmtN(x.z, 1)} odchylenia od typowej odległości od średniej 200` : ''}, od szczytu ${fmtP(x.m.fromHi, 0)}`, x.turning ? chip('odpływ słabnie', 'accent') : chip('odpływ trwa', 'bad'))).join('')}</div>` : '<p class="muted">Nic nie spełnia kryteriów niedowartościowania po odpływie.</p>'}
      </div>
    </section>
    <section class="stack">
      <div class="row between"><h2>Mapa ciepła</h2>
        <label class="field" style="grid-auto-flow:column;align-items:center;gap:8px">Sortuj<select id="rot-sort" style="width:auto">${[['r', 'Siła względna'], ['mo', 'Pęd siły'], ['d', 'Awans od wczoraj'], ['m1', 'Zmiana 1 mies.'], ['cmf', 'Napływ (CMF 20)']].map(([k, n]) => `<option value="${k}"${k === R.sort ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Walor</th><th>Ćwiartka</th><th class="r">Siła</th><th class="r">Pęd</th><th class="r">Ranking</th><th class="r">1 dzień</th><th class="r">Tydzień</th><th class="r">1 mies.</th><th class="r">3 mies.</th><th class="r">6 mies.</th><th class="r">1 rok</th><th class="r">Od ATH</th><th class="r">vs ${esc(lab(b))} 1 mies.</th><th class="r">CMF 20</th><th class="r">Rel. wolumen</th><th>Trend</th></tr></thead>
        <tbody>${tbl.map((x) => `<tr class="click" data-act="rot-sel" data-sym="${x.s.s}" tabindex="0"${x.s.s === R.sel ? ' style="outline:2px solid var(--accent);outline-offset:-2px"' : ''}>
          <td><b>${esc(lab(x.s))}</b> <span class="muted">${x.s.synthetic ? '' : esc(x.s.n)}</span></td><td>${qchip(x.q0)}</td>
          <td class="r num">${fmtN(x.r, 2)}</td><td class="r num">${fmtN(x.mo, 2)}</td>
          <td class="r num">${x.rank}${x.dRank ? ` <span class="${x.dRank > 0 ? 'pos' : 'neg'}">${x.dRank > 0 ? '▲' : '▼'}${Math.abs(x.dRank)}</span>` : ''}</td>
          ${heat(x.m.d1, 0.03, 2)}${heat(x.m.w1, 0.06)}${heat(x.m.m1, 0.1)}${heat(x.m.m3, 0.2)}${heat(x.m.m6, 0.3)}${heat(x.m.y1, 0.5)}${heat(athInfo(x.s).from, 0.6)}${heat(x.rel1m, 0.08)}
          ${x.fl ? heat(x.fl.cmf20, 0.3, 0).replace(/>[^<]*<\/td>$/, `>${fmtN(x.fl.cmf20, 2)}</td>`) : '<td class="r faint">–</td>'}
          <td class="r num">${x.fl && isNum(x.fl.rvol) ? fmtN(x.fl.rvol, 2) + '×' : '–'}</td><td>${trendChip(x.m.trend)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="faint">Siła i pęd: 100 to poziom benchmarku. CMF 20 od −1 do +1: dodatni oznacza przewagę kupujących w ostatnich 20 sesjach. Rel. wolumen: dzisiejszy obrót względem średniej z 20 sesji.</p>
    </section>
    <section class="grid g2">
      ${mentorBox('rot', 'Wyjaśnij mi ten obraz rynku', true)}
      <details class="more card"><summary>Jak to liczymy i czego nie wiemy</summary>
        <div class="stack">
          <p><b>Siła względna.</b> <span class="muted">Cena waloru podzielona przez cenę benchmarku, wygładzona średnią z 10 sesji. Oś pozioma pokazuje, o ile odchyleń standardowych ta linia jest powyżej lub poniżej swojej średniej z 50 sesji. Oś pionowa to zmiana tej wartości w ostatnich 10 sesjach. To uproszczona, otwarta wersja wykresu RRG.</span></p>
          <p><b>Napływ kapitału.</b> <span class="muted">Chaikin Money Flow: dla każdej sesji sprawdzamy, czy zamknięcie było bliżej maksimum (kupujący) czy minimum (sprzedający), i ważymy to obrotem. Dla koszyków GPW sumujemy przepływy spółek z koszyka.</span></p>
          <p><b>Czego nie wiemy.</b> <span class="muted">Prawdziwe wpłaty i wypłaty z funduszy (kreacje i umorzenia jednostek) publikują płatni dostawcy danych. Tutaj widzisz szacunek z ceny i wolumenu. Indeksy bez wolumenu i dane opóźnione to kolejne ograniczenia. Rotacja nie przewiduje przyszłości. Pokazuje, co działo się ostatnio.</span></p>
        </div>
      </details>
    </section>`;
    document.getElementById('rot-g').addEventListener('change', (e) => { R.g = e.target.value; R.bench = null; R.sel = null; render(); });
    document.getElementById('rot-b').addEventListener('change', (e) => { R.bench = e.target.value; render(); });
    document.getElementById('rot-sort').addEventListener('change', (e) => { R.sort = e.target.value; render(); });
    rrgChart(document.getElementById('rrg'), rows, R.sel, ['rrg', R.g, benchId, R.tail].join(':'));
    if (sel) {
      const g = rrg(sel.s, b), i0 = Math.max(0, tb - Math.min(b.ppy, 252) + 1), base = g.rs[i0];
      const ys = []; for (let i = i0; i <= tb; i++) ys.push(g.rs[i] != null && base ? (100 * g.rs[i]) / base : null);
      lineChart(document.getElementById('rot-rs'), b, i0, ys, 100, 'rs:' + sel.s.s + ':' + benchId);
      if (sel.fl) flowChart(document.getElementById('rot-flow'), sel.s, 60, 'fl:' + sel.s.s);
    }
    MENTOR_CTX.rot = () => `Grupa: ${G.n}, benchmark: ${BENCHES[benchId] || benchId}, dane do ${b.d[tb]}.
Apetyt na ryzyko (ofensywne minus defensywne): ${regime.map((g) => g.n + ' ' + (isNum(g.off) && isNum(g.def) ? fmtN((g.off - g.def) * 100, 1) + ' pp' : '–')).join(', ')}.
Ćwiartki: ${['lead', 'impr', 'weak', 'lag'].map((q) => QUAD[q][0] + ': ' + (byQ(q).map((x) => lab(x.s) + (x.s.synthetic ? '' : ' (' + x.s.n + ')')).join(', ') || 'brak')).join('; ')}.
Zmiany od wczoraj: ${moved1.map((x) => lab(x.s) + ' ' + QUAD[x.q1][0] + '→' + QUAD[x.q0][0]).join(', ') || 'brak'}.
Liderzy z napływem: ${L.lead.map((x) => lab(x.s) + ' CMF ' + (x.fl ? fmtN(x.fl.cmf20, 2) : 'b/d')).join(', ') || 'brak'}.
Odpływ: ${L.out.map((x) => lab(x.s) + ' CMF ' + (x.fl ? fmtN(x.fl.cmf20, 2) : 'b/d')).join(', ') || 'brak'}.
Niedowartościowane po odpływie: ${L.cheap.map((x) => lab(x.s) + ' 6M vs bench ' + fmtP(x.rel6) + (x.turning ? ' (odpływ słabnie)' : ' (odpływ trwa)')).join(', ') || 'brak'}.
Zadanie: wyjaśnij początkującemu, co ten obraz mówi o nastrojach i rotacji kapitału, jak swing trader mógłby z niego korzystać i jakie są pułapki. Bez rekomendacji kupna.`;
  }
  function rotDetail(x, b) {
    const s = x.s;
    return `<div class="card raised stack-lg" id="rot-detail">
      <div class="row between">
        <div class="stack"><h2>${esc(s.synthetic ? s.n : s.n + ' (' + s.s + ')')}</h2><div class="row">${chip(QUAD[x.q0][0], QUAD[x.q0][1])} ${trendChip(x.m.trend)} <span class="faint">${esc(QUAD[x.q0][2])}</span></div></div>
        <div class="row"><button class="btn sm" data-act="goan" data-sym="${s.s}">Analiza</button><button class="btn sm" data-act="to-mc" data-sym="${s.s}">Sprawdź szanse</button>${tradable(s) ? `<button class="btn sm" data-act="to-train" data-sym="${s.s}">Trenuj</button>` : ''}<button class="btn ghost sm" data-act="rot-close">Zamknij</button></div>
      </div>
      <p class="muted">${esc(s.about)} W ostatnim miesiącu ${x.rel1m >= 0 ? 'radził sobie lepiej' : 'radził sobie gorzej'} niż ${esc(lab(b))} o ${fmtPu(Math.abs(x.rel1m ?? 0))}, a w ostatnim półroczu o ${fmtPu(Math.abs(x.rel6 ?? 0))} ${(x.rel6 ?? 0) >= 0 ? 'lepiej' : 'gorzej'}.${x.fl ? ` CMF z 20 sesji: ${fmtN(x.fl.cmf20, 2)}, wczoraj ${fmtN(x.fl.cmf20y, 2)}, tydzień temu ${fmtN(x.fl.cmf20w, 2)}. Dzisiejszy obrót to ${fmtN(x.fl.rvol, 2)}× średniej.` : ' Brak danych o wolumenie.'}</p>
      <div class="grid g2">
        <div class="stack"><h4>Siła względna wobec ${esc(lab(b))} (start roku = 100)</h4>${chartBox('rot-rs', 220)}<p class="faint">Linia rośnie, gdy walor radzi sobie lepiej niż benchmark, nawet jeśli oba spadają.</p></div>
        <div class="stack"><h4>Szacowany przepływ, 60 ostatnich sesji</h4>${x.fl ? chartBox('rot-flow', 220) + '<p class="faint">Zielone: sesje z przewagą kupujących, czerwone: sprzedających. Wysokość to obrót w złotych.</p>' : '<p class="muted">Brak danych o wolumenie dla tego waloru.</p>'}</div>
      </div>
    </div>`;
  }

  function vPlan(el) {
    const P = UI.plan;
    if (!BY[P.sym] || !tradable(BY[P.sym])) { P.sym = 'PKO'; P.entry = null; }
    const s = BY[P.sym], t = s.last;
    if (!isNum(P.entry)) P.entry = s.c[t];
    const scanTags = tagsAt(s, t).filter((k) => RULES[k].src === 'skaner');
    el.innerHTML = `
    <section class="fade">
      <span class="eyebrow">Planer wyjścia · Menedżer budżetu · Strażnik ryzyka</span>
      <h1>Plan <span class="hl">przed</span> transakcją</h1>
      <p class="muted" style="max-width:70ch">Zanim cokolwiek kupisz, odpowiedz na cztery pytania: po ile wchodzisz, gdzie wychodzisz ze stratą, gdzie z zyskiem i ile akcji kupić, żeby jedna pomyłka nie bolała. Aplikacja liczy to według Twoich zasad: budżet ${fmtM(S.cfg.budget, 'PLN', 0)}, maksymalna strata ${fmtM(S.cfg.max_loss, 'PLN', 0)}.</p>
    </section>
    <div class="split">
      <div class="stack-lg">
        <div class="card stack-lg">
          <h3>1. Wejście</h3>
          <div class="fields">
            <label class="field">Walor<select id="pl-sym">${stockOptions(s.s, false, tradable)}</select></label>
            <label class="field">Cena wejścia (${s.cur})<input type="number" id="pl-entry" value="${P.entry}" step="${s.tick}" min="0"><span class="hint">Ostatnie zamknięcie: ${fmtPx(s.c[t], s)}</span></label>
            <label class="field">Powód wejścia<select id="pl-setup"><option value="">Własny pomysł</option>${Object.entries(RULES).filter(([, r]) => r.src === 'skaner').map(([k, r]) => `<option value="${k}"${k === P.setup ? ' selected' : ''}>${esc(r.n)}${scanTags.includes(k) ? ' (pasuje dziś)' : ''}</option>`).join('')}</select></label>
          </div>
          <label class="field">Dlaczego chcesz wejść? Zapisz jednym zdaniem.<textarea id="pl-note" placeholder="Np. wybicie ponad szczyt z 20 dni przy dużym wolumenie">${esc(P.note)}</textarea></label>
        </div>
        <div class="card stack-lg">
          <h3>2. Wyjście</h3>
          <div class="fields">${stopFields('pl', P, s, t, P.entry)}</div>
          <div id="pl-exit"></div>
        </div>
        <div class="card stack-lg"><h3>3. Wielkość pozycji</h3><div id="pl-size"></div></div>
      </div>
      <div class="stack-lg">
        <div class="card stack">
          <h3>Plan na wykresie</h3>
          ${chartBox('pl-chart', 260)}
        </div>
        <div class="card raised stack-lg">
          <h3>4. Kontrola ryzyka</h3>
          <div id="pl-risk"></div>
          <div class="row"><button class="btn primary" data-act="plan-save">Zapisz plan</button><button class="btn" data-act="plan-mc">Sprawdź szanse</button><button class="btn" data-act="to-train" data-sym="${s.s}">Przećwicz w treningu</button></div>
        </div>
        ${note('info', 'Aplikacja nie składa zleceń. Prawdziwe zlecenie składasz sam u brokera, najlepiej najpierw na koncie demo. Wpisz tam od razu stop i cel (zlecenie z obroną), żeby nie decydować w nerwach.')}
        ${mentorBox('plan', 'Omów ze mną ten plan', false)}
      </div>
    </div>
    <section class="stack">
      <h2>Zapisane plany</h2>
      ${S.plans.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Spółka</th><th class="r">Wejście</th><th class="r">Stop</th><th class="r">Cel</th><th class="r">Akcje</th><th class="r">Maks. strata</th><th>Kontrola</th><th>Powód</th><th></th></tr></thead><tbody>
        ${S.plans.slice().reverse().map((p) => `<tr><td class="num">${fmtD(p.date)}</td><td><b>${esc(p.sym)}</b></td><td class="r num">${fmtN(p.entry)}</td><td class="r num neg">${fmtN(p.stop)}</td><td class="r num pos">${fmtN(p.target)}</td><td class="r num">${p.shares}</td><td class="r num">${fmtM(p.maxLoss, 'PLN', 0)}</td><td>${p.pass ? '<span class="big-pass">PASS</span>' : '<span class="big-block">BLOCK</span>'}</td><td class="wrap muted" style="min-width:180px">${esc(p.note || (p.setup ? RULES[p.setup]?.n : '') || '–')}</td><td><button class="btn ghost sm" data-act="plan-del" data-id="${p.id}" aria-label="Usuń plan">Usuń</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Nie masz jeszcze zapisanych planów. Zapisany plan zostaje tutaj, żebyś mógł później porównać go z tym, co się stało.</p>'}
    </section>`;
    let chartObj = null;
    const calc = () => {
      const T = buildTrade({ s, t, entry: P.entry, stopRule: P.stopRule, stopVal: P.stopVal, R: P.R, cfg: S.cfg, cash: S.cfg.budget, equity: S.cfg.budget, isTraining: false });
      UI.planT = T;
      document.getElementById('pl-exit').innerHTML = exitHtml(T.plan, s, t, P.stopRule, P.stopVal);
      document.getElementById('pl-size').innerHTML = sizeHtml(T, s);
      document.getElementById('pl-risk').innerHTML = riskHtml(T);
      const lines = T.plan.errors.length ? [{ y: P.entry, label: 'wejście', col: 'ink' }] : [{ y: T.plan.target, label: 'cel', col: 'good' }, { y: T.plan.entry, label: 'wejście', col: 'ink' }, { y: T.plan.stop, label: 'stop', col: 'bad' }];
      const cv = document.getElementById('pl-chart');
      if (!chartObj) { chartObj = { s, i0: Math.max(0, t - 125), i1: t, type: 'line', sma: { 20: false, 50: true, 200: false }, lines, marks: [], anim: { key: 'pl:' + s.s } }; priceChart(cv, chartObj); }
      else { chartObj.lines = lines; cv._chart.draw(); }
      MENTOR_CTX.plan = () => `Plan: ${s.n} (${s.s}), wejście ${fmtN(P.entry)} ${s.cur}, ${T.plan.errors.length ? 'plan odrzucony: ' + T.plan.errors.join(' ') : `stop ${fmtN(T.plan.stop)}, cel ${fmtN(T.plan.target)}, ryzyko na akcję ${fmtN(T.plan.risk)} (${fmtPu(T.plan.riskPct, 2)}), R:R ${fmtN(T.plan.rr, 2)}. Wielkość: ${T.size.shares} akcji za ${fmtM(T.size.value)}, maks. strata ${fmtM(T.size.maxLoss)}, decyduje limit: ${T.size.limits.find((x) => x.k === T.size.decider).n}. Kontrola: ${T.risk.pass ? 'PASS' : 'BLOCK'}; ${T.risk.checks.map((c) => c.level + ' ' + c.k + ': ' + c.text).join(' | ')}`}. ATR14 ${fmtN(s.atr[t])}. Powód wejścia: ${P.note || (P.setup ? RULES[P.setup].n : 'brak')}. Zasady: budżet ${S.cfg.budget} zł, maks. strata ${S.cfg.max_loss} zł, min R:R ${S.cfg.min_rr}.`;
    };
    document.getElementById('pl-sym').addEventListener('change', (e) => { P.sym = e.target.value; P.entry = null; if (P.stopRule === 'price') { P.stopRule = 'atr'; P.stopVal = 2; } render(); });
    document.getElementById('pl-entry').addEventListener('input', (e) => { P.entry = parseFloat(e.target.value); calc(); });
    document.getElementById('pl-setup').addEventListener('change', (e) => { P.setup = e.target.value; });
    document.getElementById('pl-note').addEventListener('input', (e) => { P.note = e.target.value; });
    bindStopFields('pl', P, (structural) => (structural ? render() : calc()), s, t, () => P.entry);
    calc();
  }

  function vTrening(el) {
    const a = S.active;
    if (!a) return vTrainHome(el);
    const s = BY[a.sym], i = a.i, m = metrics(s, i), eq = eqOf(a), cur = s.cur, f = (x) => fmtPx(x, s);
    const T = UI.train;
    const posLines = a.pos ? [{ y: a.pos.target, label: 'cel', col: 'good' }, { y: a.pos.entry, label: 'wejście', col: 'ink' }, { y: a.pos.stop, label: 'stop', col: 'bad' }] : [];
    const marks = [];
    for (const tr of a.trades) { marks.push({ i: tr.i0, p: tr.entry, k: 'buy' }); marks.push({ i: tr.i1, p: tr.exit, k: 'sell' }); }
    if (a.pos) marks.push({ i: a.pos.i, p: a.pos.entry, k: 'buy' });
    const tags = tagsAt(s, i);
    const name = a.blind ? 'Walor ukryty' : `${s.n} (${s.s})`;
    const dayLbl = (k) => (a.blind ? `Sesja ${k - a.i0}` : fmtD(s.d[k]));
    el.innerHTML = `
    <section class="fade">
      <span class="eyebrow">Trening na historii${a.blind ? ' · na ślepo' : ''}</span>
      <div class="row between">
        <h1>${esc(name)}</h1>
        <div class="row">${chip(`Sesja ${i - a.i0} z ${a.iEnd - a.i0}`, 'accent')} ${chip(a.blind ? 'daty ukryte' : fmtD(s.d[i]))} ${chip(a.blind ? 'klasa ukryta' : CLASSES[s.cls])}</div>
      </div>
    </section>
    <div class="split">
      <div class="card stack-lg">
        <div class="row between">${seg('tr-range', [[63, '3 mies.'], [126, '6 mies.'], [252, '1 rok']], T.range)}
          <div class="legend"><span><i style="background:var(--c1)"></i>SMA 20</span><span><i style="background:var(--c2)"></i>SMA 50</span><span><i style="background:var(--c3)"></i>SMA 200</span></div></div>
        ${chartBox('tr-chart', 400)}
        <div class="row">
          <button class="btn primary" data-act="tr-next" data-n="1">Następna sesja →</button>
          <button class="btn" data-act="tr-next" data-n="5">+5 sesji</button>
          <button class="btn" data-act="tr-next" data-n="20">+20 sesji</button>
          ${a.pos ? '<button class="btn bad" data-act="tr-sell">Sprzedaj po zamknięciu</button>' : `<button class="btn good" data-act="tr-buyopen" aria-expanded="${T.buyOpen}">Kup…</button>`}
          <button class="btn ghost" data-act="tr-finish">Zakończ trening</button>
        </div>
        <p class="faint">Klawisz → przesuwa o jedną sesję. Kupujesz po cenie zamknięcia bieżącej sesji. Stop i cel sprawdzane są w kolejnych sesjach: jeśli sesja otworzy się z luką za stopem lub celem, transakcja wykona się po cenie otwarcia.</p>
        <div id="tr-buy"></div>
      </div>
      <div class="stack-lg">
        <div class="card stack">
          <h3>Konto treningowe</h3>
          <dl class="kv">
            <dt>Gotówka</dt><dd>${fmtM(a.cash)}</dd>
            <dt>Pozycja</dt><dd>${a.pos ? fmtM(a.pos.shares * s.c[i] * fxI(s, i)) : '–'}</dd>
            <dt>Wartość konta</dt><dd><b>${fmtM(eq)}</b></dd>
            <dt>Wynik od startu</dt><dd class="${eq >= a.startCash ? 'pos' : 'neg'}">${fmtP(eq / a.startCash - 1, 2)}</dd>
            <dt>Transakcje</dt><dd>${a.trades.length}</dd>
          </dl>
        </div>
        <div class="card stack">
          <h3>${a.pos ? 'Otwarta pozycja' : 'Brak pozycji'}</h3>
          ${a.pos ? `<dl class="kv">
            <dt>Ilość</dt><dd>${fmtQty(a.pos.shares, s)} ${s.frac ? 'j.' : 'szt.'}</dd>
            <dt>Wejście</dt><dd>${f(a.pos.entry)}</dd>
            <dt>Stop</dt><dd class="neg">${f(a.pos.stop)}</dd>
            <dt>Cel</dt><dd class="pos">${f(a.pos.target)}</dd>
            <dt>Teraz</dt><dd>${f(s.c[i])} · <b>${fmtN((s.c[i] - a.pos.entry) / a.pos.risk, 2)}R</b></dd>
            <dt>Od wejścia</dt><dd>${i - a.pos.i} ${plural(i - a.pos.i, 'sesja', 'sesje', 'sesji')}</dd>
          </dl><p class="faint">Nie przesuwaj stopu dalej od ceny. Możesz zamknąć wcześniej, ale zapisz w dzienniku dlaczego.</p>` : '<p class="muted">Obserwuj wykres. Nie musisz grać w każdej sesji: brak transakcji to też decyzja.</p>'}
        </div>
        <div class="card stack">
          <h3>Na wykresie dziś</h3>
          <div class="row">${trendChip(m.trend)} ${ruleChips(tags) || '<span class="faint">żadna reguła skanera</span>'}</div>
          <dl class="kv"><dt>Zamknięcie</dt><dd>${f(m.price)}</dd><dt>RSI 14</dt><dd>${fmtN(m.rsi, 0)}</dd><dt>ATR 14</dt><dd>${f(m.atr)} (${fmtPu(m.atrPct)})</dd><dt>Od szczytu roku</dt><dd>${fmtP(m.fromHi)}</dd></dl>
        </div>
      </div>
    </div>
    <div class="card stack">
      <h3>Dziennik zdarzeń</h3>
      <div class="log">${a.log.slice().reverse().map((x) => `<div><span class="faint num">${dayLbl(x.i)}</span> · ${esc(x.t)}</div>`).join('')}</div>
    </div>`;
    const ti0 = Math.max(0, i - T.range + 1), prevI = T.drawnI;
    const from = prevI == null || prevI > i || prevI < ti0 ? 0 : (prevI - ti0) / Math.max(1, i - ti0);
    T.drawnI = i;
    priceChart(document.getElementById('tr-chart'), { s, i0: ti0, i1: i, type: 'candle', sma: { 20: true, 50: true, 200: true }, lines: posLines, marks, blind: a.blind, anim: { from, dur: from > 0 ? 500 : 1100 } });
    if (T.buyOpen && !a.pos) renderBuy();
  }
  function renderBuy() {
    const a = S.active, s = BY[a.sym], i = a.i, B = UI.train.buy, box = document.getElementById('tr-buy');
    if (!box) return;
    box.innerHTML = `<div class="card flat stack-lg" style="border-style:dashed">
      <div class="row between"><h3>Plan zakupu po ${fmtPx(s.c[i], s)}</h3><button class="btn ghost sm" data-act="tr-buyclose">Anuluj</button></div>
      <div class="fields">${stopFields('tb', B, s, i, s.c[i])}</div>
      <label class="field">Dlaczego kupujesz?<input id="tb-note" value="${esc(B.note)}" placeholder="Np. wybicie z konsolidacji, trend wzrostowy"></label>
      <div class="grid g2"><div id="tb-exit"></div><div id="tb-risk"></div></div>
      <div id="tb-size"></div>
      <div class="row"><button class="btn good" id="tb-go" data-act="tr-buy">Kup</button></div>
    </div>`;
    const calc = () => {
      const T = buildTrade({ s, t: i, entry: s.c[i], stopRule: B.stopRule, stopVal: B.stopVal, R: B.R, cfg: S.cfg, cash: a.cash, equity: eqOf(a), isTraining: true, dayTrades: a.dayTrades['d' + i] || 0, dayRisk: a.dayRisk['d' + i] || 0 });
      document.getElementById('tb-exit').innerHTML = exitHtml(T.plan, s, i, B.stopRule, B.stopVal);
      document.getElementById('tb-risk').innerHTML = riskHtml(T);
      document.getElementById('tb-size').innerHTML = T.size ? sizeHtml(T, s) : '';
      const go = document.getElementById('tb-go');
      go.disabled = !T.ok;
      go.textContent = T.ok ? `Kup ${fmtQty(T.size.shares, s)} ${s.frac ? 'j.' : 'szt.'} po ${fmtPx(s.c[i], s)}` : 'Zakup zablokowany';
    };
    bindStopFields('tb', B, (structural) => (structural ? renderBuy() : calc()), s, i, () => s.c[i]);
    document.getElementById('tb-note').addEventListener('input', (e) => { B.note = e.target.value; });
    calc();
  }
  function eqOf(a) { const s = BY[a.sym]; return a.cash + (a.pos ? a.pos.shares * s.c[a.i] * fxI(s, a.i) : 0); }
  function addLog(a, t) { a.log.push({ i: a.i, t }); if (a.log.length > 80) a.log = a.log.slice(-80); }
  function closePos(a, s, i, px, why) {
    const p = a.pos, fx = fxI(s, i), proceeds = p.shares * px * fx, fee = (proceeds * S.cfg.commission_pct) / 100;
    a.cash += proceeds - fee;
    const pnl = proceeds - fee - (p.cost + p.fee), R = (px - p.entry) / p.risk;
    const tr = { id: uid(), sym: a.sym, name: s.n, blind: a.blind, d0: s.d[p.i], d1: s.d[i], days: i - p.i, entry: p.entry, stop: p.stop, target: p.target, exit: roundT(px, s.tick), why, shares: p.shares, R: round2(R), pnl: round2(pnl), cur: s.cur, note: p.note || '', setup: p.setup || '' };
    a.trades.push({ i0: p.i, i1: i, entry: p.entry, exit: roundT(px, s.tick), why, R: tr.R, pnl: tr.pnl });
    S.journal.push(tr); if (S.journal.length > 400) S.journal = S.journal.slice(-400);
    a.pos = null;
    const msg = `${why === 'cel' ? 'Cel osiągnięty' : why === 'stop' ? 'Stop wykonany' : why === 'luka pod stopem' ? 'Luka pod stopem: sprzedaż na otwarciu' : why === 'luka nad celem' ? 'Luka nad celem: sprzedaż na otwarciu' : why === 'ręcznie' ? 'Sprzedaż ręczna' : 'Zamknięcie na koniec treningu'} po ${fmtPx(px, s)}. Wynik ${fmtN(R, 2)}R, ${fmtM(pnl)}.`;
    addLog(a, msg);
    return msg;
  }
  function trainAdvance(n) {
    const a = S.active; if (!a) return;
    const s = BY[a.sym]; let ev = null;
    for (let k = 0; k < n && a.i < a.iEnd; k++) {
      a.i++; const i = a.i;
      if (a.pos) {
        const p = a.pos, o = s.o[i], h = s.h[i], l = s.l[i];
        if (o <= p.stop) ev = closePos(a, s, i, o, 'luka pod stopem');
        else if (l <= p.stop) ev = closePos(a, s, i, p.stop, 'stop');
        else if (o >= p.target) ev = closePos(a, s, i, o, 'luka nad celem');
        else if (h >= p.target) ev = closePos(a, s, i, p.target, 'cel');
        if (ev) break;
      }
    }
    if (a.i >= a.iEnd) { trainFinish(ev); return; }
    save(); render(); if (ev) toast(ev);
  }
  function trainFinish(ev) {
    const a = S.active; if (!a) return;
    const s = BY[a.sym];
    if (a.pos) closePos(a, s, a.i, s.c[a.i], 'koniec treningu');
    const end = a.cash;
    const sum = { id: a.id, sym: a.sym, name: s.n, blind: a.blind, d0: s.d[a.i0], d1: s.d[a.i], start: a.startCash, end: round2(end), ret: end / a.startCash - 1, bh: s.c[a.i] / s.c[a.i0] - 1, n: a.trades.length, sumR: round2(sum2(a.trades.map((x) => x.R))) };
    S.sessions.push(sum); if (S.sessions.length > 100) S.sessions = S.sessions.slice(-100);
    UI.lastSummary = { ...sum, trades: a.trades.slice() };
    S.active = null; UI.train.buyOpen = false;
    save(); render(); window.scrollTo({ top: 0 });
    if (ev) toast(ev);
  }
  const sum2 = (a) => a.reduce((x, y) => x + y, 0);
  function trainStart(symArg) {
    let sym = symArg || UI.train.sym;
    if (!BY[sym] || !tradable(BY[sym])) { const arr = DATA.stocks.filter(tradable); sym = arr[Math.floor(Math.random() * arr.length)].s; }
    const s = BY[sym], len = UI.train.len, n = s.c.length;
    const lo = Math.min(260, Math.max(30, n - len - 30)), hi = n - 1 - len, i0 = lo + Math.floor(Math.random() * Math.max(1, hi - lo + 1));
    const budget = S.cfg.budget;
    S.active = { id: uid(), sym, blind: !!UI.train.blind && !symArg, i0, i: i0, iEnd: Math.min(n - 1, i0 + len), startCash: budget, cash: budget, pos: null, trades: [], log: [], dayTrades: {}, dayRisk: {} };
    addLog(S.active, `Start treningu: ${fmtM(budget)} wirtualnych pieniędzy, ${len} sesji. Twoje zasady: maks. strata ${fmtM(S.cfg.max_loss)} na transakcję.`);
    UI.lastSummary = null; UI.train.buyOpen = false; UI.train.drawnI = null;
    save(); location.hash = '#trening'; render();
  }
  function jStats(list) {
    const n = list.length; if (!n) return null;
    const wins = list.filter((x) => x.R > 0).length;
    const Rs = list.map((x) => x.R);
    return { n, win: wins / n, avgR: sum2(Rs) / n, pnl: sum2(list.map((x) => x.pnl)), worst: Math.min(...Rs), best: Math.max(...Rs), gaps: list.filter((x) => x.why === 'luka pod stopem').length, stops: list.filter((x) => x.why === 'stop' || x.why === 'luka pod stopem').length, tg: list.filter((x) => x.why === 'cel' || x.why === 'luka nad celem').length };
  }
  function vTrainHome(el) {
    const T = UI.train, st = jStats(S.journal), L = UI.lastSummary;
    el.innerHTML = `
    <section class="fade">
      <span class="eyebrow">Trening na historii · zamiast prawdziwego brokera</span>
      <h1>Graj na przeszłości, <span class="hl">ucz się na przyszłość</span></h1>
      <p class="muted" style="max-width:70ch">Aplikacja losuje moment z ostatnich lat i ukrywa wszystko, co działo się później. Przesuwasz czas sesja po sesji, kupujesz z planem i zasadami, a stop i cel wykonują się same. Bez prawdziwych pieniędzy.</p>
    </section>
    ${L ? `<div class="card raised stack-lg fade">
      <div class="row between"><h2>Koniec treningu</h2>${chip(L.ret >= L.bh ? 'lepiej niż kup i trzymaj' : 'gorzej niż kup i trzymaj', L.ret >= L.bh ? 'good' : 'warn')}</div>
      <p>To była spółka <b>${esc(L.name)} (${esc(L.sym)})</b>, od ${fmtD(L.d0)} do ${fmtD(L.d1)}.</p>
      <div class="stats">
        <div class="stat"><span class="k">Twój wynik</span><span class="v ${L.ret >= 0 ? 'pos' : 'neg'}">${fmtP(L.ret, 2)}</span><span class="s">${fmtM(L.end - L.start)}</span></div>
        <div class="stat"><span class="k">Kup i trzymaj</span><span class="v">${fmtP(L.bh, 2)}</span><span class="s">gdybyś kupił na starcie i nic nie robił</span></div>
        <div class="stat"><span class="k">Transakcje</span><span class="v">${L.n}</span><span class="s">suma ${fmtN(L.sumR, 2)}R</span></div>
      </div>
      <p class="muted">${L.n === 0 ? 'Nie zawarłeś żadnej transakcji. Cierpliwość jest w porządku, ale spróbuj przy następnym treningu poszukać wejścia pasującego do reguły.' : L.ret < L.bh ? 'Tym razem samo trzymanie dało więcej. To częsty wynik: aktywne granie musi pokonać prosty wariant, i zwykle tego nie robi.' : 'Pobiłeś wariant kup i trzymaj w tym okresie. Jeden trening to jednak mało. Sprawdź, czy wynik się powtórzy w kolejnych.'}</p>
      ${L.trades.length ? `<div class="table-wrap"><table><thead><tr><th>Wejście</th><th>Wyjście</th><th class="r">Cena wejścia</th><th class="r">Cena wyjścia</th><th>Powód wyjścia</th><th class="r">R</th><th class="r">Wynik</th></tr></thead><tbody>${L.trades.map((x) => `<tr><td class="num">${fmtD(BY[L.sym].d[x.i0])}</td><td class="num">${fmtD(BY[L.sym].d[x.i1])}</td><td class="r num">${fmtN(x.entry)}</td><td class="r num">${fmtN(x.exit)}</td><td>${esc(x.why)}</td><td class="r num ${x.R >= 0 ? 'pos' : 'neg'}">${fmtN(x.R, 2)}</td><td class="r num ${x.pnl >= 0 ? 'pos' : 'neg'}">${fmtM(x.pnl)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>` : ''}
    <div class="grid g2">
      <div class="card stack-lg">
        <h3>Nowy trening</h3>
        <div class="fields">
          <label class="field">Walor<select id="tr-sym">${stockOptions(T.sym, true, tradable)}</select></label>
          <label class="field">Długość<select id="tr-len">${[40, 60, 120].map((x) => `<option value="${x}"${x === T.len ? ' selected' : ''}>${x} sesji (${x === 40 ? 'ok. 2 miesiące' : x === 60 ? 'ok. 3 miesiące' : 'ok. pół roku'})</option>`).join('')}</select></label>
        </div>
        <label class="row" style="gap:8px;flex-wrap:nowrap"><input type="checkbox" id="tr-blind" ${T.blind ? 'checked' : ''}><span>Na ślepo: ukryj nazwę spółki i daty. <span class="faint">Uczysz się czytać wykres, a nie przypominać sobie historię.</span></span></label>
        <p class="faint">Konto startowe: ${fmtM(S.cfg.budget, 'PLN', 0)}. Obowiązują Twoje zasady z zakładki „Moje zasady”, prowizja ${fmtN(S.cfg.commission_pct, 2)}% od każdej transakcji.</p>
        <div class="row"><button class="btn primary" data-act="tr-start">Losuj moment w historii i zacznij</button></div>
      </div>
      <div class="card stack-lg">
        <div class="row between"><h3>Twoje statystyki</h3><span class="faint">${S.sessions.length} ${plural(S.sessions.length, 'trening', 'treningi', 'treningów')}</span></div>
        ${st ? `<div class="stats">
          <div class="stat"><span class="k">Transakcje</span><span class="v">${st.n}</span><span class="s">${st.tg} celów, ${st.stops} stopów</span></div>
          <div class="stat"><span class="k">Trafienia</span><span class="v">${fmtPu(st.win, 0)}</span><span class="s">transakcji na plusie</span></div>
          <div class="stat"><span class="k">Średnie R</span><span class="v ${st.avgR >= 0 ? 'pos' : 'neg'}">${fmtN(st.avgR, 2)}</span><span class="s">wartość oczekiwana na transakcję</span></div>
          <div class="stat"><span class="k">Suma</span><span class="v ${st.pnl >= 0 ? 'pos' : 'neg'}">${fmtM(st.pnl, 'PLN', 0)}</span><span class="s">wirtualnie, po prowizjach</span></div>
          <div class="stat"><span class="k">Najgorsza</span><span class="v neg">${fmtN(st.worst, 2)}R</span><span class="s">${st.gaps ? st.gaps + ' ' + plural(st.gaps, 'luka', 'luki', 'luk') + ' pod stopem' : 'bez luk pod stopem'}</span></div>
          <div class="stat"><span class="k">Najlepsza</span><span class="v pos">${fmtN(st.best, 2)}R</span><span class="s">największy zysk w R</span></div>
        </div>
        <p class="muted">${st.n < 20 ? `Masz ${st.n} ${plural(st.n, 'transakcję', 'transakcje', 'transakcji')}. Wnioski wyciągaj po co najmniej 20–30.` : st.avgR > 0 ? 'Średnie R jest dodatnie. Sprawdź, czy wynik nie zależy od jednej czy dwóch dużych wygranych.' : 'Średnie R jest ujemne. Przejrzyj dziennik: które wejścia kończyły się stopem i czy pasowały do Twojej reguły?'}</p>` : '<p class="muted">Statystyki pojawią się po pierwszej zamkniętej transakcji.</p>'}
      </div>
    </div>
    ${S.journal.length ? `<section class="stack">
      <div class="row between"><h2>Dziennik transakcji</h2><span class="faint">ostatnie ${Math.min(30, S.journal.length)} z ${S.journal.length}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Spółka</th><th>Wejście</th><th class="r">Sesje</th><th class="r">Wejście</th><th class="r">Stop</th><th class="r">Cel</th><th class="r">Wyjście</th><th>Powód wyjścia</th><th class="r">R</th><th class="r">Wynik</th><th>Dlaczego kupiłem</th></tr></thead><tbody>
      ${S.journal.slice(-30).reverse().map((x) => `<tr><td><b>${esc(x.sym)}</b>${x.blind ? ' <span class="faint">(na ślepo)</span>' : ''}</td><td class="num">${fmtD(x.d0)}</td><td class="r num">${x.days}</td><td class="r num">${fmtN(x.entry)}</td><td class="r num">${fmtN(x.stop)}</td><td class="r num">${fmtN(x.target)}</td><td class="r num">${fmtN(x.exit)}</td><td>${esc(x.why)}</td><td class="r num ${x.R >= 0 ? 'pos' : 'neg'}">${fmtN(x.R, 2)}</td><td class="r num ${x.pnl >= 0 ? 'pos' : 'neg'}">${fmtM(x.pnl, 'PLN', 0)}</td><td class="wrap muted" style="min-width:180px">${esc(x.note || '–')}</td></tr>`).join('')}
      </tbody></table></div>
      ${mentorBox('journal', 'Oceń mój dziennik', false)}
    </section>` : ''}`;
    document.getElementById('tr-sym').addEventListener('change', (e) => { T.sym = e.target.value; });
    document.getElementById('tr-len').addEventListener('change', (e) => { T.len = parseInt(e.target.value, 10); });
    document.getElementById('tr-blind').addEventListener('change', (e) => { T.blind = e.target.checked; });
    MENTOR_CTX.journal = () => { const s2 = jStats(S.journal); return `Statystyki: ${s2.n} transakcji, trafienia ${fmtPu(s2.win, 0)}, średnie R ${fmtN(s2.avgR, 2)}, suma ${fmtM(s2.pnl)}, najgorsza ${fmtN(s2.worst, 2)}R, najlepsza ${fmtN(s2.best, 2)}R, luki pod stopem: ${s2.gaps}. Treningi: ${S.sessions.length}, w tym wynik vs kup i trzymaj: ${S.sessions.slice(-10).map((x) => fmtP(x.ret, 1) + ' vs ' + fmtP(x.bh, 1)).join('; ')}.
Ostatnie transakcje: ${S.journal.slice(-15).map((x) => `${x.sym} ${x.R}R (${x.why}${x.note ? ', powód: ' + x.note : ''})`).join('; ')}.
Zadanie: wskaż jeden mocny punkt i jedną rzecz do poprawy w dyscyplinie (plan, stop, wielkość, powody wejść).`; };
  }

  function vZasady(el) {
    const c = S.cfg;
    const F = [
      ['budget', 'Budżet na naukę (zł)', 500, 'Tylko pieniądze, których stratę zniesiesz. W treningu to konto startowe.'],
      ['max_loss', 'Maks. strata na transakcję (zł)', 10, 'Ile może zabrać jedna transakcja, jeśli zadziała stop. Popularna zasada: około 1% budżetu.'],
      ['cash_buffer_pct', 'Bufor gotówki (%)', 1, 'Ta część budżetu zawsze zostaje w gotówce.'],
      ['max_position_pct', 'Maks. pozycja (% konta)', 5, 'Największa część konta w jednej spółce.'],
      ['max_order', 'Maks. zlecenie (zł)', 100, 'Największa kwota jednego zakupu.'],
      ['min_order', 'Min. zlecenie (zł)', 10, 'Mniejsze zlecenia zjadają prowizje.'],
      ['min_rr', 'Min. zysk do ryzyka', 0.5, 'Cel musi być co najmniej tyle razy dalej niż stop.'],
      ['max_trades_day', 'Maks. transakcji dziennie', 1, 'Chroni przed nerwowym graniem.'],
      ['max_daily_loss', 'Dzienny limit straty (zł)', 10, 'Suma maksymalnych strat z wejść jednego dnia.'],
      ['commission_pct', 'Prowizja (%)', 0.01, 'Koszt każdej transakcji u brokera, przy kupnie i przy sprzedaży.'],
    ];
    el.innerHTML = `
    <section class="fade">
      <span class="eyebrow">Ustawiasz raz, pilnują Cię zawsze</span>
      <h1>Moje <span class="hl">zasady</span></h1>
      <p class="muted" style="max-width:70ch">Te limity stosuje Menedżer budżetu i Strażnik ryzyka w planie transakcji i w treningu. Ustal je na spokojnie, zanim zobaczysz pierwszy kuszący wykres. Zmiany zapisują się same.</p>
    </section>
    <div class="split">
      <div class="card stack-lg">
        <div class="fields">
          ${F.map(([k, l, st, h]) => `<label class="field">${l}<input type="number" id="cfg-${k}" value="${c[k]}" step="${st}" min="0"><span class="hint">${h}</span></label>`).join('')}
          <label class="field">Zablokowane spółki<input id="cfg-blocked" value="${esc(c.blocked)}" placeholder="np. TSLA, CDR"><span class="hint">Tickery, których nie chcesz handlować, oddzielone przecinkami.</span></label>
          <label class="field">Mój profil<select id="cfg-profile"><option value="long"${c.profile === 'long' ? ' selected' : ''}>Inwestor długoterminowy</option><option value="trader"${c.profile === 'trader' ? ' selected' : ''}>Trader</option></select><span class="hint">Wybiera kartę oceny w analizie.</span></label>
          <label class="field">Animacje wykresów<select id="cfg-anim"><option value="auto"${(c.anim || 'auto') === 'auto' ? ' selected' : ''}>Jak w systemie</option><option value="on"${c.anim === 'on' ? ' selected' : ''}>Zawsze włączone</option><option value="off"${c.anim === 'off' ? ' selected' : ''}>Wyłączone</option></select><span class="hint">${RMQ.matches ? 'Twój system prosi o ograniczenie ruchu, więc przy ustawieniu „Jak w systemie” wykresy pojawiają się od razu.' : 'Wykresy rosną od lewej do prawej przy otwarciu widoku.'}</span></label>
        </div>
      </div>
      <div class="stack-lg">
        <div class="card raised stack" id="cfg-sum"></div>
        <div class="card stack">
          <h3>Wyczyść postępy</h3>
          <p class="muted">Usuwa lekcje, plany, dziennik i treningi. Zasady wracają do domyślnych.</p>
          ${UI.confirmReset ? `<div class="note bad">${ICON_WARN}<div><b>Na pewno?</b> Tego nie da się cofnąć.<div class="row" style="margin-top:8px"><button class="btn bad sm" data-act="reset-yes">Tak, wyczyść</button><button class="btn sm" data-act="reset-no">Anuluj</button></div></div></div>` : '<div><button class="btn" data-act="reset">Wyczyść wszystko</button></div>'}
        </div>
      </div>
    </div>`;
    const summary = () => {
      const lossPct = c.max_loss / c.budget, ten = 1 - Math.pow(1 - lossPct, 10);
      const warn = [];
      if (lossPct > 0.02) warn.push('Ponad 2% budżetu na jedną transakcję to dużo dla początkującego.');
      if (c.min_rr < 1) warn.push('Cel bliżej niż stop wymaga bardzo wysokiego procentu trafień.');
      if (c.cash_buffer_pct < 5) warn.push('Mały bufor gotówki zostawia mało miejsca na błędy.');
      if (c.max_daily_loss < c.max_loss) warn.push('Dzienny limit jest mniejszy niż limit na transakcję, więc żadne wejście go nie zmieści.');
      document.getElementById('cfg-sum').innerHTML = `<h3>Co to oznacza</h3>
        <dl class="kv">
          <dt>Jedna strata przy stopie</dt><dd>${fmtM(c.max_loss, 'PLN', 0)} · ${fmtPu(lossPct)}</dd>
          <dt>10 strat z rzędu</dt><dd class="neg">około ${fmtP(-ten)}</dd>
          <dt>Zawsze w gotówce</dt><dd>${fmtM((c.budget * c.cash_buffer_pct) / 100, 'PLN', 0)}</dd>
          <dt>Największa pozycja</dt><dd>${fmtM(Math.min((c.budget * c.max_position_pct) / 100, c.max_order), 'PLN', 0)}</dd>
          <dt>Próg opłacalności przy min. R:R</dt><dd>${fmtPu(1 / (1 + c.min_rr), 0)} trafień</dd>
          <dt>Dziennie maksymalnie</dt><dd>${c.max_trades_day} ${plural(c.max_trades_day, 'wejście', 'wejścia', 'wejść')}, ${fmtM(c.max_daily_loss, 'PLN', 0)} ryzyka</dd>
        </dl>
        ${warn.length ? note('warn', warn.map(esc).join('<br>')) : note('good', 'Te zasady są ostrożne. Tak trzymaj, zwłaszcza na początku.')}`;
    };
    for (const [k] of F) document.getElementById('cfg-' + k).addEventListener('input', (e) => { const v = parseFloat(e.target.value); if (isNum(v) && v >= 0) { c[k] = v; if (k === 'budget' && v === 0) c[k] = 1; S.prog.cfg = true; save(); summary(); } });
    document.getElementById('cfg-blocked').addEventListener('input', (e) => { c.blocked = e.target.value; S.prog.cfg = true; save(); });
    document.getElementById('cfg-profile').addEventListener('change', (e) => { c.profile = e.target.value; S.prog.cfg = true; save(); });
    document.getElementById('cfg-anim').addEventListener('change', (e) => { c.anim = e.target.value; save(); ANIM_KEYS.clear(); toast(c.anim === 'off' ? 'Animacje wyłączone.' : 'Zapisano. Wykresy będą rosły przy otwarciu widoku.'); });
    summary();
  }

  /* ----- Akcje (delegacja zdarzeń) ----- */
  function toast(msg) {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 4200);
  }
  const ACT = {
    goan: (el) => { UI.an.sym = el.dataset.sym; location.hash = '#analiza'; if (UI.route === 'analiza') render(); },
    'to-rot': (el) => { const s = BY[el.dataset.sym]; UI.rot.g = el.dataset.g || groupOf(s); UI.rot.bench = null; UI.rot.sel = el.dataset.sym; location.hash = '#rotacja'; if (UI.route === 'rotacja') render(); },
    'rot-sel': (el) => { UI.rot.sel = UI.rot.sel === el.dataset.sym ? null : el.dataset.sym; render(); if (UI.rot.sel) document.getElementById('rot-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
    'rot-close': () => { UI.rot.sel = null; render(); },
    rule: (el) => { const k = el.dataset.k, a = UI.scan.rules; const i = a.indexOf(k); i >= 0 ? a.splice(i, 1) : a.push(k); render(); },
    'rules-clear': () => { UI.scan.rules = []; render(); },
    sma: (el) => { const k = el.dataset.k; UI.an.sma[k] = !UI.an.sma[k]; render(); },
    quiz: (el) => {
      const l = LESSONS.find((x) => x.id === el.dataset.l), k = +el.dataset.k;
      const st = S.lessons[l.id] || {}; st.ans = k; if (k === l.q.ok) st.done = true; S.lessons[l.id] = st; save();
      render(); const d = document.getElementById('ls-' + l.id); if (d) { d.open = true; }
    },
    mentor: (el) => askMentor(el.dataset.id, el),
    'to-mc': (el) => { Object.assign(UI.mc, { mode: 'trade', sym: el.dataset.sym, entry: null }); UI.mcRes = null; location.hash = '#prognoza'; },
    'to-plan': (el) => { UI.plan.sym = el.dataset.sym; UI.plan.entry = null; if (UI.plan.stopRule === 'price') { UI.plan.stopRule = 'atr'; UI.plan.stopVal = 2; } location.hash = '#plan'; },
    'to-train': (el) => {
      if (S.active && S.active.sym !== el.dataset.sym) { location.hash = '#trening'; toast('Najpierw zakończ bieżący trening.'); return; }
      if (S.active) { location.hash = '#trening'; return; }
      trainStart(el.dataset.sym);
    },
    'mc-run': () => runMc(),
    'mc-to-plan': () => { const M = UI.mc; Object.assign(UI.plan, { sym: M.sym, entry: M.entry, stopRule: M.stopRule, stopVal: M.stopVal, R: M.R }); location.hash = '#plan'; },
    'plan-mc': () => { const P = UI.plan; Object.assign(UI.mc, { mode: 'trade', sym: P.sym, entry: P.entry, stopRule: P.stopRule, stopVal: P.stopVal, R: P.R }); location.hash = '#prognoza'; },
    'plan-save': () => {
      const T = UI.planT, P = UI.plan; if (!T || T.plan.errors.length) { toast('Najpierw popraw plan wyjścia.'); return; }
      S.plans.push({ id: uid(), date: DATA.as_of, sym: P.sym, entry: round2(T.plan.entry), stop: T.plan.stop, target: T.plan.target, shares: T.size.shares, maxLoss: round2(T.size.maxLoss), pass: T.risk.pass, setup: P.setup, note: P.note });
      if (S.plans.length > 30) S.plans = S.plans.slice(-30);
      S.prog.plan = true; save(); render(); toast('Plan zapisany.');
    },
    'plan-del': (el) => { S.plans = S.plans.filter((p) => p.id !== el.dataset.id); save(); render(); },
    'tr-start': () => trainStart(),
    'tr-next': (el) => trainAdvance(+el.dataset.n),
    'tr-buyopen': () => { UI.train.buyOpen = true; renderBuy(); document.getElementById('tr-buy')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
    'tr-buyclose': () => { UI.train.buyOpen = false; document.getElementById('tr-buy').innerHTML = ''; },
    'tr-buy': () => {
      const a = S.active, s = BY[a.sym], i = a.i, B = UI.train.buy;
      const T = buildTrade({ s, t: i, entry: s.c[i], stopRule: B.stopRule, stopVal: B.stopVal, R: B.R, cfg: S.cfg, cash: a.cash, equity: eqOf(a), isTraining: true, dayTrades: a.dayTrades['d' + i] || 0, dayRisk: a.dayRisk['d' + i] || 0 });
      if (!T.ok) { toast('Strażnik ryzyka zablokował zakup.'); return; }
      const cost = T.size.shares * s.c[i] * T.fx, fee = (cost * S.cfg.commission_pct) / 100;
      a.cash -= cost + fee;
      a.pos = { shares: T.size.shares, entry: s.c[i], stop: T.plan.stop, target: T.plan.target, risk: T.plan.risk, i, cost, fee, note: B.note.trim(), setup: tagsAt(s, i).filter((k) => RULES[k].src === 'skaner').join(',') };
      a.dayTrades['d' + i] = (a.dayTrades['d' + i] || 0) + 1; a.dayRisk['d' + i] = (a.dayRisk['d' + i] || 0) + T.size.maxLoss;
      addLog(a, `Kupno ${fmtQty(T.size.shares, s)} ${s.frac ? 'j.' : 'szt.'} po ${fmtPx(s.c[i], s)}. Stop ${fmtN(T.plan.stop)}, cel ${fmtN(T.plan.target)}, maks. strata ${fmtM(T.size.maxLoss)}.`);
      B.note = ''; UI.train.buyOpen = false; save(); render();
    },
    'tr-sell': () => { const a = S.active, s = BY[a.sym]; const msg = closePos(a, s, a.i, s.c[a.i], 'ręcznie'); save(); render(); toast(msg); },
    'tr-finish': () => trainFinish(),
    reset: () => { UI.confirmReset = true; render(); },
    'reset-no': () => { UI.confirmReset = false; render(); },
    'reset-yes': () => { S = fresh(); UI.confirmReset = false; UI.lastSummary = null; save(); render(); toast('Postępy wyczyszczone.'); },
  };
  const SEG = {
    mkt: (v) => { UI.scan.mkt = v; },
    'an-range': (v) => { UI.an.range = v; },
    'an-ctype': (v) => { UI.an.ctype = v; },
    'an-th': (v) => { UI.an.th = +v; },
    profile: (v) => { S.cfg.profile = v; save(); },
    'mc-mode': (v) => { UI.mc.mode = v; },
    'tr-range': (v) => { UI.train.range = +v; },
    'rot-tail': (v) => { UI.rot.tail = v; },
  };
  main.addEventListener('click', (e) => {
    const sg = e.target.closest('[data-seg]');
    if (sg) { SEG[sg.dataset.seg]?.(sg.dataset.v); render(); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACT[el.dataset.act];
    if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el); }
  });
  main.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('tr[data-act]')) ACT[e.target.dataset.act]?.(e.target);
  });
  document.addEventListener('keydown', (e) => {
    if (UI.route !== 'trening' || !S.active || e.key !== 'ArrowRight') return;
    if (e.target.closest('input, select, textarea')) return;
    e.preventDefault(); trainAdvance(1);
  });

  /* ----- Router ----- */
  const ROUTES = { start: vStart, nauka: vNauka, skaner: vSkaner, rotacja: vRotacja, analiza: vAnaliza, prognoza: vPrognoza, plan: vPlan, trening: vTrening, zasady: vZasady };
  function render() {
    if (!DATA) return;
    const y = window.scrollY;
    ROUTES[UI.route](main);
    showMentors();
    window.scrollTo({ top: y });
  }
  function route() {
    const r = (location.hash || '#start').slice(1);
    const next = ROUTES[r] ? r : 'start';
    const changed = next !== UI.route;
    if (changed) ANIM_KEYS.clear();
    UI.route = next;
    document.querySelectorAll('#tabs a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === '#' + next ? 'page' : 'false'));
    if (!DATA) return;
    ROUTES[next](main); showMentors();
    if (changed) window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', route);
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll); } catch (e) { /* */ }
  new MutationObserver(redrawAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.fonts?.ready?.then(redrawAll);

  /* ----- Pasek indeksów nad treścią ----- */
  function renderTape() {
    const tape = document.getElementById('tape');
    if (!tape) return;
    const items = [['ETFBW20TR', 'WIG20TR'], ['ETFBM40TR', 'mWIG40TR'], ['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['EFA', 'Świat bez USA'], ['GLD', 'Złoto'], ['USO', 'Ropa'], ['TLT', 'Obligacje 20+'], ['BTC', 'Bitcoin']];
    const fxNow = FX.length > 1 ? FX[FX.length - 1][1] / FX[FX.length - 2][1] - 1 : null;
    const html = items.filter(([id]) => BY[id]).map(([id, n]) => { const m = metrics(BY[id]); return `<a href="#analiza" data-act="goan" data-sym="${id}"><b>${n}</b><span class="${m.d1 >= 0 ? 'pos' : 'neg'}">${fmtP(m.d1, 2)}</span></a>`; }).join('')
      + (isNum(fxNow) ? `<span class="tk"><b>USD/PLN</b><span>${fmtN(FX[FX.length - 1][1], 4)}</span><span class="${fxNow >= 0 ? 'pos' : 'neg'}">${fmtP(fxNow, 2)}</span></span>` : '');
    const st = tape.querySelector('.status-m');
    tape.innerHTML = html; if (st) tape.appendChild(st);
  }
  document.getElementById('tape')?.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act="goan"]'); if (!el) return;
    e.preventDefault(); UI.an.sym = el.dataset.sym; location.hash = '#analiza'; if (UI.route === 'analiza') render();
  });

  /* ----- Start ----- */
  (async () => {
    try {
      const res = await fetch('data.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setData(await res.json());
    } catch (e) {
      main.innerHTML = `<div class="loading">Nie udało się wczytać notowań (${esc(e.message)}). Odśwież stronę.</div>`;
      return;
    }
    adopt(loadLocal());
    renderTape();
    setStatus('local');
    route();
    initCloud();
  })();
})();
