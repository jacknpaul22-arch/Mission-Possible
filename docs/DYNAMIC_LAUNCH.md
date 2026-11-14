# Dynamic launch sequence: plan, implementation, tests

## 1. Project context
- **Engine:** none. One HTML5 file, `Mission_ Possible.html`: vanilla JS, Canvas 2D, WebAudio.
- **Flight scene:** a real-time simulator, `FlightSim` (between the `/*FS-BEGIN*/` and `/*FS-END*/` markers). It owns the canvas, runs its own physics loop, and is driven by commands from `fly()`.
- **Game logic:** `fly()` still decides odds, events and scoring. It tells the simulator what happens (`liftoff`, `stage_sep`, `tli`, `dest('ok'|'short'|'miss')`) and waits for `arrived()`.
- **Data:** `launch-sequence.json` (embedded in the page as `<script id="seq-config">`).
- Unity/Unreal: the original request was engine-agnostic. Section 9 maps each piece to Unity/Unreal if the team ports it.

## 2. What the player sees
| Phase | View | What is simulated |
|---|---|---|
| `pad` Kennedy Space Center, Pad 39A | side view, dusk | tower, vent glow, ignition |
| `ascent` | side view, camera follows rocket | gravity turn, max-Q vapor ring and throttle-down, shake, exhaust trail and ground smoke, sky fading to black, T+/altitude/velocity readout |
| `orbit` | Earth-centred | Earth with continents, craft on a circular orbit with trail |
| `deep` (Moon, Mars) | whole-system view | translunar/Mars injection burn, curved transfer path, Earth and destination labelled, distance readout |
| `dest` | destination-centred, auto-zoom | approach on a real hyperbolic arc, capture burn, then the outcome below |

## 3. Separations (up to 5 different points per flight)
1. **Booster separation** (heavy-lift only): side boosters peel off sideways.
2. **Core stage separation**: the core falls behind with real drag and gravity while the upper stage keeps burning.
3. **Fairing jettison**: two halves drift away.
4. **Upper stage separation** (in orbit or right after the injection burn): the spent stage stays behind on its own orbit; the spacecraft deploys its solar arrays.
5. **Module jettison** (just before the capture burn): the transfer module/adapter is released and follows the same arc under gravity.

Parts that separate become free bodies with their own motion, so they visibly fall or drift away instead of fading out.

## 4. Orbit outcomes (all physically simulated)
| Outcome | Moon / Mars | Low Earth orbit |
|---|---|---|
| Success (`ok`) | burn slows the craft to circular speed, it locks into a round orbit | craft raises to the target ring and circularises |
| Short (`short`) | burn leaves it too fast: a long, lopsided ellipse | elliptical orbit that swings above and below the target |
| **Miss** (`miss`) | burn is too weak, speed stays above escape speed: the craft bends around the planet and **flies away**, trail and "ORBIT MISSED" banner, camera zooms out | orbit decays in a spiral, the craft reenters in a fireball |

Gravity is integrated (not scripted) near the destination, so a miss really is a flyby. Launch failure: the vehicle explodes mid-ascent (fireball, flash, tumbling fragments).

## 5. Rocket variants
| | Small | Medium | Heavy |
|---|---|---|---|
| Plume | 1.0 | 1.35 | 1.8 |
| Max-Q throttle | 75% | 70% | 55% |
| Side boosters | none | none | 2 |
| Body size | smallest | mid | tallest |
| Launch sound | quiet | normal | loud, low |

## 6. Dialogue rules
- A **cue** is a named moment (`phase_*`, `countdown`, `liftoff`, `maxq`, `booster_sep`, `meco`, `stage_sep`, `fairing`, `seco`, `tli`, `upper_sep`, `module_sep`, `insertion_start`, `insertion_ok`, `insertion_short`, `fail_launch`, `fail_orbit`).
- Entries in `dialogue[]` carry `on`, `who`, optional `rocket[]` / `mission[]`. **Most specific match wins**; ties pick at random. Every cue has a generic fallback (enforced by the test).
- The simulator raises two cues itself, because only it knows when they happen: `module_sep` and `burn_start`.
- Subtitles are the flight log. The canvas is `aria-hidden`; the log is the accessible record.
- Voice: `voice()` uses browser speech synthesis (Settings, Voice lines). For recorded audio, add `"vo"` per entry and play it in `voice()`.
- Localization: text lives in `strings[lang]`, keyed by dialogue `id`; `T()` falls back to English; `{margin}`-style placeholders allowed.
- Dialogue uses `Math.random`, never the seeded `rng()`, so "Fly same seed" replays stay identical. The simulator is cosmetic and never touches `rng()`.

## 7. Implementation notes
- **Loop:** `requestAnimationFrame`, time step clamped to 50 ms, multiplied by the Speed setting (same scale as the game timers).
- **Sync:** the simulator runs freely; `fly()` waits on `arrived()` for the arrival and capture, so animation never ends early or late. If the player is still choosing during an event card, the craft coasts.
- **Transitions:** fade between ascent and space; smooth camera zoom and pan between phases.
- **Performance:** one canvas, no per-frame allocations beyond particles (capped at 260, 70 in Lite). Lite mode (Settings, Scene quality) uses 1x pixel ratio, fewer stars and particles, no glow blending. Auto picks Lite on 2 GB or less RAM, 2 or fewer cores, or reduced-motion.
- **Reduced motion:** the canvas is hidden; the log carries everything and `arrived()` resolves on a short timer.
- **Tuning:** all world constants (speeds, radii, burn times, outcome speed factors) are in `sim` in the JSON.

## 8. Data config
`launch-sequence.json` (schema: `launch-sequence.schema.json`). **After editing it, paste it into the `seq-config` block**; the test fails if they differ. Add a rocket: new `rockets` entry plus the game's launcher list. Add a mission: `missions` entry plus `sim.bodies`.

## 9. Asset naming and porting map
Everything is drawn in code, so there are no image assets today. If art replaces it: `bg_<phase>_<body>.webp`, `rkt_<id>_<part>.svg`, `vfx_<name>.webp`, `sfx_<event>.ogg`, `vo_<dialogue id>.ogg`; keep the scene under 400 KB.

| Here | Unity | Unreal |
|---|---|---|
| `launch-sequence.json` | ScriptableObjects | Data Assets / DataTables |
| `FlightSim` phases | state machine + Timeline per phase | Level Sequence per phase |
| free bodies (stages, fairings, debris) | Rigidbody prefabs | Chaos physics actors |
| orbit and flyby integration | custom gravity (same equations) | custom gravity |
| `cue()` | dialogue manager | dialogue subsystem |
| Lite mode | Quality levels | Scalability groups |

## 10. Tests and acceptance
- `node tests/validate-sequence.js`: config matches the embedded copy; every rocket and mission is covered; timeline events have handlers; every cue has a fallback line; speakers exist; sim constants are sane (capture speeds ordered as success < short < escape < miss).
- `node tests/simulate-flights.js`: runs the simulator headless for **every rocket x mission x outcome** (27 flights) and checks the physics: both late separations happen, success locks into a tight orbit, short is lopsided, **miss really leaves**, LEO miss really decays, launch failure explodes.
- Manual: play each rocket at normal and fast speed, in Full and Lite quality; check the miss and the failure by eye (seed 43 fails launch on any rocket).

Acceptance: all tests pass; every flight shows 4 or 5 visible separations; a missed orbit visibly misses; no change to scoring or seeded replays; no console errors.

## 11. Effort and risks
Done in this change: about 3 days equivalent. A Unity/Unreal port: art/VFX 6-10 days, systems 4-6, audio/voice 3-5, QA 3.

| Risk | Mitigation |
|---|---|
| Config and embedded copy drift | validator test before every push |
| Low-end phones stutter | Lite mode, capped particles, test on a 2 GB device |
| Long flights feel slow | Speed setting scales the animation and the game together |
| Speech voices differ per device | optional; subtitles always shown |
| Visuals untested on real devices | review on a phone before merging |
