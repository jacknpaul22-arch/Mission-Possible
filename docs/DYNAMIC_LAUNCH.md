# Dynamic launch sequence: plan, implementation, tests

## 1. Project context (what this game actually is)
- **Engine:** none. One self-contained HTML5 file, `Mission_ Possible.html`, vanilla JS, CSS and inline SVG, WebAudio for sound.
- **Where things live:** flight logic is `fly()`. The scene (backgrounds, rocket, VFX) is built by `sceneHTML()` / `rocketSVG()`. Crew dialogue goes through `cue()`. Subtitles are the flight log (`#lg`). All launch data is in `launch-sequence.json`, embedded in the page as `<script id="seq-config">`.
- **Unity/Unreal:** the request was written engine-agnostic. This repo is HTML5, so the plan is implemented here. Section 8 maps each piece to Unity or Unreal if the team ports it.

## 2. Phases
| Phase | Background | Camera | Environment VFX | Audio ambient |
|---|---|---|---|---|
| `pad` Kennedy Space Center, Pad 39A | dusk gradient, horizon glow, launch tower | wide, static | vent steam | low, dark pad |
| `ascent` | gradient fades to black, stars fade in, pad drops away | follow with shake, sky scroll doubles after stage separation | ground smoke, plume, debris | filter opens (900 Hz) |
| `orbit` | Earth limb rises, probe cruises | slow pan | star pan | mid (450 Hz) |
| `deep` (Moon and Mars missions only) | Earth shrinks, destination appears small | parallax, two star layers at different speeds | drifting probe | low (220 Hz) |
| `dest` | destination planet pushes in (5 s) | push-in | burn glow during insertion | mid-high (600 Hz) |

Order is fixed: `pad > ascent > orbit > [deep] > dest`. LEO skips `deep`.

## 3. Rocket variants
| | Small (`s`) | Medium (`m`) | Heavy (`h`) |
|---|---|---|---|
| Plume scale | 1.0 | 1.35 | 1.8 |
| Max Q throttle | 75% | 70% | 55% |
| Side boosters | none | none | 2, separate first and fall sideways |
| Stage separation | core falls away, debris | same | same, after boosters |
| Fairing jettison | yes | yes | yes |
| Launch sound | quiet | normal | loud, lower pitch |

Body size also scales per type (`coreW`, `coreH`, `upH`, `fairingH`).

## 4. Dialogue rules
- A **cue** is a named moment: `phase_pad`, `countdown`, `liftoff`, `maxq`, `throttle_up`, `booster_sep`, `meco`, `stage_sep`, `fairing`, `seco`, `phase_orbit`, `phase_deep`, `phase_dest`, `insertion_start`, `insertion_ok`, `insertion_short`, `fail_launch`, `fail_orbit`.
- Each entry in `dialogue[]` has `on`, speaker `who`, optional `rocket[]` and `mission[]` filters. **Most specific match wins** (rocket and mission > one of them > generic). Ties pick randomly.
- **Every cue must have a generic line**, so no rocket and mission combo can go silent. `tests/validate-sequence.js` enforces this.
- **Branching:** failure and success are separate cues. `fail_launch` fires from the launch roll, `fail_orbit` from the delta-v check. `insertion_ok` and `insertion_short` fire after the burn.
- **Timing:** cues fire from timeline events, so they track the flight speed setting.
- **Subtitles:** every line is written to the flight log with the speaker and portrait. Scene visuals are `aria-hidden`, so the log is the accessible record.
- **Voiceover sync:** `voice(who, text)` is the hook. It uses browser speech synthesis (Settings > Voice lines). To use recorded audio, add `"vo": "vo/<id>.ogg"` to entries and play it inside `voice()`. Subtitles and audio start in the same call, so they stay in sync.
- **Localization:** text lives in `strings[lang]`, keyed by dialogue `id`. `T()` falls back to `en`, so partial translations work. `{margin}` style placeholders are allowed. Set `ST.lang` to switch. Keep sentences whole (no string concatenation) so word order can differ per language.
- Dialogue uses `Math.random`, never the seeded `rng()`, so "Fly same seed" replays stay identical.

## 5. Implementation
- **Phase state machine:** `setPhase(p)` swaps a `ph-*` class on `#stg`. CSS transitions do the camera and background changes. It also sets the audio ambient filter and fires the `phase_*` cue.
- **Timeline runner:** `seq(list, total)` fires events (`{d, ev}`) in order, waiting `d` ms (scaled by speed) before each. Handlers live in `EV` (liftoff, maxq, throttle_up, booster_sep, meco, stage_sep, fairing, seco).
- **Pre and post:** `pre` runs before the launch reliability roll (fixed 1500 ms total, same as before), `post` runs after it succeeds. Game balance and RNG order are untouched.
- **Blending:** plume throttle is a CSS variable (`--pl`) with a transition. Camera and planet moves are CSS transitions between phase states.
- **Performance and fallback:** transforms and opacity only. Settings > Scene quality: Auto, Full, Lite. **Lite** drops the second star layer, smoke, blur glow and extra debris. Auto picks Lite on reduced-motion, 2 GB or less RAM, or 2 or fewer CPU cores. With reduced-motion, animations are off and separated parts are simply hidden.

## 6. Data config
- `launch-sequence.json` is the source of truth. Its schema is `launch-sequence.schema.json`.
- The page embeds a copy so it works from `file://` with no fetch. **After editing the JSON, paste it into the `seq-config` block**; the test fails if they differ.
- Add a rocket: add an entry under `rockets` and in the game's launcher list (`LA`). Add a mission: `missions` entry plus the mission list (`MS`). Add a line: one `dialogue` entry plus its `strings.en` text.

## 7. Asset naming (for when real art or audio replaces the CSS and SVG)
- Backgrounds: `bg_<phase>_<body>.webp` (for example `bg_dest_mars.webp`), 1600x400, under 150 KB each.
- Rocket sprites: `rkt_<id>_<part>.svg` (`core`, `upper`, `fairing_l`, `fairing_r`, `booster`).
- VFX sheets: `vfx_<name>.webp`. Audio: `sfx_<event>.ogg`, `vo_<dialogue id>.ogg`, `amb_<phase>.ogg`.
- Budget: scene under 400 KB total, 60 fps on mid phones, no per-frame JS (CSS handles animation).

## 8. Porting map (Unity / Unreal)
| Here | Unity | Unreal |
|---|---|---|
| `launch-sequence.json` | ScriptableObjects: `PhaseConfig`, `RocketConfig`, `DialogueCue` | Data Assets or DataTables |
| `setPhase` + CSS classes | Animator state machine or Timeline per phase | Level Sequence per phase |
| `seq` timeline events | Timeline signal tracks / Animation Events | Sequencer event tracks |
| `cue()` | `DialogueDirector.Cue(name)` | Dialogue subsystem |
| `strings[lang]` | Localization package | String Tables |
| Lite quality | Quality levels, VFX Graph LOD | Scalability groups |

## 9. Test plan and acceptance criteria
Automated: `node tests/validate-sequence.js` checks the config against the game:
- embedded copy equals the JSON file;
- every rocket and mission has a sequence;
- timeline events have handlers;
- every cue has a generic fallback line;
- speakers exist in the cast table;
- every dialogue id has an English string.

Manual (run each, normal and fast speed, Full and Lite quality):
| Case | Expect |
|---|---|
| Small-lift, LEO | pad > ascent > orbit > dest, no deep phase, no boosters |
| Medium-lift, Moon | adds deep phase "Trans-lunar coast", Moon grows in dest |
| Heavy-lift, Mars | 2 boosters separate first, then core, fairing, deep cruise, Mars dest |
| Launch failure (try seed 43 on any rocket) | scene explodes, failure line matches rocket, results screen shows |
| Missed orbit (too little fuel) | `fail_orbit` line, no "orbit reached" lines |
| Fly same seed | same events and odds as the first run |
| Voice lines on | each line is spoken once, mute silences it |
| Reduced-motion OS setting | no animation, parts hidden after separation |
| Menu during flight | speech and sequence stop |

Acceptance: all cases pass, no console errors, every cue produces exactly one subtitle line, no change in scoring.

## 10. Effort and risks
**Done in this change:** about 2 days equivalent (scene, timeline, dialogue engine, config, tests, docs).
**If ported to Unity/Unreal:** art and VFX 6 to 10 days, systems 4 to 6 days, audio and voice 3 to 5 days, QA 3 days.

| Risk | Mitigation |
|---|---|
| Config and embedded copy drift | validator test; run before every push |
| Low-end phones stutter | Lite mode, transforms only, test on a 2 GB device |
| Speech synthesis voices differ per device | optional feature; subtitles always shown |
| Translated lines too long for the log | keep lines under about 120 characters, test each language |
| Dialogue repeating | more variants per cue; use `once` for story beats |
