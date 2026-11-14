// Headless physics check of the flight simulator. Run: node tests/simulate-flights.js
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'Mission_ Possible.html'), 'utf8');
const SQ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'launch-sequence.json'), 'utf8'));
const src = html.slice(html.indexOf('/*FS-BEGIN*/'), html.indexOf('/*FS-END*/'));
const FlightSim = new Function(src + ';return FlightSim')();
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const cv = { getContext: () => null, getBoundingClientRect: () => ({ width: 640, height: 280 }) };
const K = SQ.sim, DX = K.transfer.distance;

function fly(rocket, mission, outc, opts = {}) {
  const em = [], R = SQ.rockets[rocket], M = SQ.missions[mission];
  const V = FlightSim(cv, SQ, { rocket, mission, speed: () => 1, emit: n => em.push(n) });
  const ev = []; let T = 0;
  const total = R.preMs + R.post.reduce((a, e) => a + e.d, 0);
  ev.push([0, () => V.liftoff(total)]);
  R.pre.forEach(e => { T += e.d; if (e.ev !== 'liftoff') ev.push([T, () => V.cmd(e.ev, e.ev === 'maxq' ? R.maxqThrottle : 1)]); });
  T = R.preMs; R.post.forEach(e => { T += e.d; ev.push([T, () => V.cmd(e.ev)]); });
  if (opts.explodeAt) ev.push([opts.explodeAt, () => V.explode()]);
  T += 200; ev.push([T, () => V.orbit()]);
  let t = T + 900; M.transit.forEach(e => { t += e.d; ev.push([t, () => V.cmd(e.ev)]); });
  ev.push([T + (M.deep ? 12000 : 7000), () => V.dest(outc)]);
  ev.sort((a, b) => a[0] - b[0]);
  let now = 0, i = 0, peakAlt = 0, closest = 1e9, maxD = 0;
  while (now < 150000) {
    while (i < ev.length && ev[i][0] <= now) { ev[i][1](); i++; }
    V.step(1 / 60); now += 1000 / 60;
    const s = V.state(); peakAlt = Math.max(peakAlt, s.alt);
    if (M.deep) { const d = Math.hypot(s.x - DX, s.y); if (s.st === 'capture') { closest = Math.min(closest, d); maxD = Math.max(maxD, d); } }
    if (s.done || s.dead) break;
  }
  return { s: V.state(), em, closest, maxD, now, peakAlt, V };
}

for (const rk of Object.keys(SQ.rockets)) for (const ms of Object.keys(SQ.missions)) for (const oc of ['ok', 'short', 'miss']) {
  const r = fly(rk, ms, oc), tag = `${rk}/${ms}/${oc}`, M = SQ.missions[ms];
  ok(r.s.done, tag + ' sequence completes (' + (r.now / 1000).toFixed(0) + 's)');
  ok(!r.s.up && !r.s.mod, tag + ' upper stage and module both separated');
  ok(r.em.includes('burn_start') && r.em.includes('module_sep'), tag + ' emits burn_start and module_sep');
  if (M.deep) {
    const d = Math.hypot(r.s.x - DX, r.s.y);
    if (oc === 'ok') ok(d < 90 && r.maxD < 120, tag + ' captured into a tight orbit (r=' + d.toFixed(0) + ')');
    if (oc === 'short') ok(d < 400 && r.maxD < 500, tag + ' captured into a lopsided orbit (r=' + d.toFixed(0) + ')');
    if (oc === 'miss') ok(d > 150, tag + ' really flies past the target (r=' + d.toFixed(0) + ')');
  } else {
    const rr = Math.hypot(r.s.x, r.s.y);
    if (oc === 'ok') ok(Math.abs(rr - K.earth.leo.targetR) < 6, tag + ' settles on the target orbit (r=' + rr.toFixed(0) + ')');
    if (oc === 'short') ok(rr > K.earth.orbitR * .8 && rr < 200, tag + ' ends on an elliptical orbit (r=' + rr.toFixed(0) + ')');
    if (oc === 'miss') ok(rr < K.earth.r + 8, tag + ' decays into the atmosphere (r=' + rr.toFixed(0) + ')');
  }
}
const f = fly('h', 'mars', 'ok', { explodeAt: 1500 });
ok(f.s.dead && !f.s.done, 'launch failure explodes the vehicle and stops the flight');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
