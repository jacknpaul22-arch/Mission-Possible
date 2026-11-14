// Run: node tests/validate-sequence.js   (no dependencies)
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Mission_ Possible.html'), 'utf8');
const file = JSON.parse(fs.readFileSync(path.join(root, 'launch-sequence.json'), 'utf8'));
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

const m = html.match(/<script type="application\/json" id="seq-config">([\s\S]*?)<\/script>/);
ok(!!m, 'embedded seq-config found');
const emb = JSON.parse(m[1]);
ok(JSON.stringify(emb) === JSON.stringify(file), 'embedded config matches launch-sequence.json');

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x => x[1]);
const code = scripts[scripts.length - 1];
try { new vm.Script(code); ok(true, 'game script parses'); } catch (e) { ok(false, 'game script parses: ' + e.message); }

const rocketIds = [...code.matchAll(/var LA=\[(.*?)\];/g)][0][1].match(/id:'(\w+)'/g).map(x => x.slice(4, -1));
const missionIds = [...code.matchAll(/var MS=\[([\s\S]*?)\];/g)][0][1].match(/\{id:'(\w+)'/g).map(x => x.slice(5, -1));
ok(rocketIds.every(r => emb.rockets[r]), 'every game rocket has a sequence: ' + rocketIds);
ok(missionIds.every(r => emb.missions[r]), 'every game mission has a sequence: ' + missionIds);

const handlers = [...code.matchAll(/^ (\w+):function\(\)/gm)].map(x => x[1]);
for (const [id, r] of Object.entries(emb.rockets)) {
  for (const k of ['pre', 'post']) ok(r[k].every(e => handlers.includes(e.ev)), `${id}.${k} events all have handlers`);
  const sum = r.pre.reduce((a, e) => a + e.d, 0);
  ok(sum <= r.preMs, `${id}.pre fits in preMs (${sum} <= ${r.preMs})`);
  ok(r.pre[0].ev === 'liftoff', `${id}.pre starts with liftoff`);
  ok(r.post.some(e => e.ev === 'stage_sep'), `${id}.post has stage_sep`);
  ok((r.boosters > 0) === r.post.some(e => e.ev === 'booster_sep'), `${id} booster count matches booster_sep event`);
}

const cast = [...code.matchAll(/var CAST=\{(.*?)\};/g)][0][1];
const ids = new Set(), en = emb.strings.en;
for (const d of emb.dialogue) {
  ok(!ids.has(d.id), 'unique id ' + d.id); ids.add(d.id);
  ok(typeof en[d.id] === 'string' && en[d.id].length > 0, 'en string exists for ' + d.id);
  ok(cast.includes("'" + d.who.split(',')[0] + "'"), 'speaker in cast table: ' + d.who);
  ok((d.rocket || []).every(r => rocketIds.includes(r)) && (d.mission || []).every(x => missionIds.includes(x)), 'valid filters on ' + d.id);
}
// every cue the code fires must have a generic (unfiltered) fallback line, otherwise a rocket/mission combo could go silent
const fired = new Set([...code.matchAll(/cue\('(\w+)'/g)].map(x => x[1]).filter(x => !x.endsWith('_')));
for (const p of Object.keys(emb.phases)) fired.add('phase_' + p);
['fail_launch', 'fail_orbit'].forEach(x => fired.add(x));
const SILENT = ['phase_ascent']; // liftoff cue speaks instead
for (const c of fired) if (!SILENT.includes(c)) ok(emb.dialogue.some(d => d.on === c && !d.rocket && !d.mission), 'generic fallback line for cue ' + c);
for (const d of emb.dialogue) ok(fired.has(d.on) || d.on === 'phase_ascent', 'cue "' + d.on + '" is fired by the game (' + d.id + ')');
for (const lang of Object.keys(emb.strings)) {
  const miss = [...ids].filter(i => !emb.strings[lang][i]);
  ok(lang === 'en' || miss.length === 0, `language ${lang}: ${miss.length} missing (falls back to en)`);
  for (const [k, v] of Object.entries(emb.strings[lang])) { const vars = [...v.matchAll(/\{(\w+)\}/g)].map(x => x[1]); ok(vars.every(x => x === 'margin'), 'placeholders ok in ' + lang + ':' + k); }
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
