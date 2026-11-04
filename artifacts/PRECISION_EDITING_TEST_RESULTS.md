# Precision and editing validation — 2026-11-04

The existing clone was updated directly on `main`. Initial working tree: clean. Origin: `https://github.com/wkreho/electric-field-visualizer.git`. Initial HEAD: `2de6d95f3015758d4d92383bcf2f12e0bf6ba67a`. No commit, push, fetch, Git metadata edit, or hosting-configuration change was performed. No old development folder was modified. No dependencies were added.

## Numerical changes and measurements

The old `forces()` used ordinary accumulation at both quadrature and body levels. Independently evaluated trigonometric coordinates were antipodal but not exact X-axis reflection partners. Small residual transverse terms entered Velocity Verlet, which can propagate/amplify perturbations depending on the physical trajectory. The reported sudden large departure was not reproduced from an exact user scene because no scene file was provided; the small residual force/drift itself was reproduced.

The update uses Neumaier compensated summation, computes relative centers before offsets, and creates exact reflection partners without changing sample counts or the uniform-angle/equal-area quadrature. Pair forces are still evaluated once and applied equally/oppositely. Velocity Verlet and its safety/contact/travel checks are retained. There is no small-force threshold. A regression with two large opposing forces and a real weak force verifies a nonzero resultant of approximately 2.247e-30 N survives cancellation.

For each Ring/Disk quality, the committed original code was loaded into an isolated JavaScript context in memory and compared with the updated engine, OFF and ON, for 10,000 × 0.002 s steps. The disk point started at x=1.5 m, the ring point at x=0.3 m; both had y=vy=0. No source checkout or temporary project copy was made.

| Medium quality | Initial Fy before (N) | Max abs(y) before (m) | Initial Fy after OFF/ON | Max abs(y), abs(vy) after OFF/ON |
|---|---:|---:|---:|---:|
| Ring | 1.034e-24 | 1.091e-16 | 0 | 0 |
| Disk | 1.448e-24 | 1.063e-15 | 0 | 0 |

Low and high qualities also retained exactly zero transverse force/drift in these updated tests. Full values and the baseline commit are in [precision-comparison.json](precision-comparison.json). These are measured cases, not bounds on all scenes or proof that physically unstable motion cannot amplify a genuine disturbance.

Preserve X-Axis Symmetry defaults OFF. It verifies exact initial and current reflection geometry, velocities and body properties. Eligible scenes project forces into the reflection-invariant subspace; no nearly-zero coordinate is snapped. The constraint is inactive if conditions fail and its reason is shown. A moving mirrored pair and an axis particle were tested for 5,000 steps; asymmetry ON/OFF produced bitwise identical trajectories. Tiny actual initial y/vy remains nonzero. Breaking current symmetry recovers transverse force. JSON and history retain the requested option.

Numerical reference: [Goldberg, What Every Computer Scientist Should Know About Floating-Point Arithmetic](https://docs.oracle.com/cd/E19422-01/819-3693/ncg_goldberg.html). Compensated summation reduces accumulation error; it is not a replacement for valid physical initial conditions or a cure for all roundoff/instability.

## Automated regression

Run `node --test tests/*.test.cjs`. The original 65 checks are retained and 19 precision/editing checks were added. The actual final run is recorded in [precision-editing-node-tests.txt](precision-editing-node-tests.txt).

New checks cover:

- Compensated cancellation retaining a real tiny force; exact reflected sample counts; common-translation invariance.
- Ring and disk at all three qualities, lock OFF/ON: each runs 10,000 steps with exact y=vy=0.
- Moving mirrored bodies, strict rejection of asymmetric initial data, safe constraint release, JSON/history roundtrip.
- Shift toggling, common group displacement, initial-velocity copying, unique IDs/names, repeated nonoverlapping pastes.
- Atomic rejection at body/coordinate/contact/sample limits and rollback of invalid whole-group motion.
- Group paste/delete history with restored multi-selection; Coulomb/atan2 probe values; singularity handling; invalid coordinates and native-input routing.

Existing regression covers force direction, mass response, fixed bodies, free ring/disk dynamics, momentum/energy convergence, Reset/Pause/Resume, JSON, bounded trails, field lines, original numerical fixtures, keyboard Undo and repository-prefix static hosting. README local links/images and browser-script syntax are also checked.

## Browser checks

Executed on the Chromium-based in-app browser under `/electric-field-visualizer/`, desktop 1280×820 and mobile 390×844. Temporary viewport overrides were reset. Raw values: [precision-browser-checks.json](precision-browser-checks.json).

- Shift selection added a second charge, a second Shift click removed only that charge, and a selected group disabled/then hid the single-object form.
- A real group drag moved Source from (0,0) to approximately (0.424,−0.432) and Test from (1.5,0) to (1.924,−0.432). History increased from 0 to 1; one Undo restored both positions and group selection, and Redo reapplied it.
- Ctrl+C/Ctrl+V copied two charges with unique Copy names/IDs. Group paste Undo/Redo and group deletion Undo restored complete groups. Repeated paste reached 16 objects; the next paste showed the limit warning and retained all 16 without partial additions.
- Copy/Paste buttons also worked. The browser automation's virtual clipboard delivers native clipboard events rather than app keydown in some cases; both normal keyboard shortcuts and native copy/paste events are supported. Native text Copy/Paste in Probe inputs changed text and did not add charges.
- No hover panel appeared. Probe creation, coordinate Apply/Enter, panel-internal editing, native text Undo, invalid-coordinate retention, singularity messages, × and Esc were exercised. At (1,0) m for +1 nC, the UI showed Ex=|E|=8.988 N/C, Ey=0, θ=0°.
- Probe zoom/Pan changed panel position while retaining world coordinates and history count (7 before/after). Maximized Probe remained visible and within the viewport. The mobile panel fit within the field, with no horizontal overflow (document width=scrollWidth=375 CSS px, with scrollbar).
- A running orbit changed the probe at fixed (0.5,0.5) from displayed |E|=194 to 178 N/C as time progressed; its input coordinates stayed fixed.
- A symmetric ring scene ran to t=95.306 s and retained exact y=vy=0. After changing y to 0.01 m the UI reported incompatible symmetry instead of forcing it onto the axis.
- Clicking Delete selected while dismissing a Probe closed only the Probe and retained the two charges. View/transport controls remain usable with the panel open. The panel chooses among nearby positions to avoid controls and charge centers where space permits.
- No console warning/error was captured in the final desktop session. Screenshots: [current interface](fieldwork-editing.jpg), [mobile Probe](fieldwork-probe-mobile.jpg).

## Changed files

Modified: `index.html`, `css/simulation.css`, `js/simulation-physics.js`, `js/simulation.js`, `js/simulation-renderer.js`, `js/edit-history.js`, `README.md`, `SIMULATION.md`.

Added: `js/simulation-editing.js`, `tests/precision-editing.test.cjs`, and this report, numerical/browser JSON records, test log, desktop/mobile screenshots in `artifacts/`. No files were deleted.

## Limits

The clipboard is app-local and resets on reload; Copy/Paste in text fields stays native. Probe state is temporary and intentionally excluded from JSON and edit history. The symmetry option is strict: roundoff already present in imported asymmetric positions/velocities will not be silently erased. If requested but ineligible, the option remains checked while the actual constraint is inactive.

The modified production Pages deployment was not tested because no push/deployment was requested. Browser checks used local static hosting, not multiple native browser engines or physical mobile devices. JSON validation/roundtrip and session restoration are covered, including the new option; operating-system download dialogs and the full file-picker import flow were not repeated in this update. Existing file import/export paths were retained.

## Final result

All 84 tests passed (0 failed, 0 skipped). `git diff --check` found no whitespace errors. The repository-prefix main page, new editing module and current JPEG each returned HTTP 200 with the expected MIME type. Final HEAD and live origin/main remained `2de6d95f3015758d4d92383bcf2f12e0bf6ba67a`; origin and branch were unchanged. The owned preview server was stopped after verification.

Suggested commit message: `Improve numerical precision and add group editing and field probes`.
