# FIELDWORK integration validation — 2026-11-03

Scope: the existing GitHub clone, branch `main`, origin `https://github.com/wkreho/electric-field-visualizer.git`. The initial working tree was clean. Local HEAD and the live origin main ref were both `672c077763d2e62571324406fa0961aa25b7f7e2` before editing. No commit, push, fetch, remote change, or Pages configuration change was performed. The old development directory was read only for comparison; its core simulation files matched this clone.

## Automated validation

Command: `node --test tests/*.test.cjs` (Node.js, no packages).

The suite contains 65 checks: 23 shared physics/metadata regressions, 30 existing simulation checks, 10 new history checks, and 2 static hosting/document checks. The execution log is [integration-node-tests.txt](integration-node-tests.txt).

History coverage includes point/ring/disk addition, deletion, Clear All, presets, name/q/mass/radius/fixed/velocity/position changes, one transaction for many drag updates, no-op preservation of redo, isolated snapshots, apply-failure atomicity, 150-entry bounds, redo invalidation, input shortcut routing, and JSON migration. Integration with the real Engine checks restoration after physical stepping, initial/current conditions, forces, paused status, and safe Resume/Reset. The force and Velocity Verlet implementations were not rewritten.

Hosting checks start the actual local server under `/electric-field-visualizer/`, fetch the main page and every linked CSS/JS asset, inspect worker dependencies, verify relative compatibility routing, and confirm removed controllers return 404. README file links and image paths must exist, and every browser script must parse.

## Browser validation

Chromium-based in-app browser; root HTTP URL and an independent server mounted at `/electric-field-visualizer/`. Desktop viewport 1280×820 and mobile viewport 390×844 were inspected; temporary viewport overrides were reset afterward. The mobile document width and scroll width both measured 375 CSS px (remaining width reserved for the scrollbar), with no horizontal overflow. No console warnings or errors were captured in the final session.

Observed UI operations:

- All three keyboard shortcuts restored a renamed object correctly.
- Typing into the name field followed by Ctrl+Z changed the text through native editing while application history remained at zero. Native grouping may undo part of a typed word, as decided by the browser.
- A property form changed charge, mass and velocity together; one Undo restored the previous values. Fixed/Free Undo restored Free. A new edit disabled Redo.
- A real pointer drag changed X from 1.5 to 1.8891509433962264 and Y to −0.3113207547169811. History grew from 3 to 4. One Undo restored X=1.5, Y=0 and Vx=0.1; Redo returned to the dragged position.
- Point, ring, and disk addition each supported Undo/Redo; deletion restored the selected object and ID/name. Ring radius restored 1.3 → 1.1 → 1.3, and disk radius Undo restored 0.85.
- Physics ran to 6.650 s while history stayed at one entry. Ctrl+Z paused and restored the scene before the preset edit. Redo, Resume and Reset worked afterward; Reset returned t=0 and X=1.5.
- Clear All produced 0 bodies; Undo restored 2. Preset Undo restored the prior scene and preset description.
- The actual file chooser imported `simulation-scene.json`, restoring Fixed Source / Orbiting Test and t=0.250 s. Import was one history entry. Undo returned to Test; Redo restored Fixed Source and t=0.250 s. The browser file-selection tool had unusually slow response, but completed successfully.
- Overlay visibility hid only the switches; maximize remained accessible. Arrow density, line width and arrow size controls accepted changes. Zoom and maximize/Esc restore worked. Field lines, arrows, grid, velocity vector and the real orbital trajectory were visually inspected.
- Repository-prefix main URL rendered the simulator and computed field lines. Visiting `simulation.html?legacy=1#field` resolved to `index.html?legacy=1#field` under the same repository prefix.

Raw observed values: [integration-browser-checks.json](integration-browser-checks.json). Current UI screenshot: [fieldwork-current.jpg](fieldwork-current.jpg). Older screenshots and test reports are retained as historical artifacts.

## Verification limits

The existing public Live Demo URL returned HTTP 200 before changes. The modified version has not been pushed, so its production deployment has not been verified. All deployment compatibility results refer to local static hosting. Cross-browser/native mobile-device behavior was not tested. JSON serialization/validation is covered automatically and actual file import was exercised; OS download dialogs and final downloaded JSON/PNG file contents were not revalidated in this integration pass. Existing export code was retained.

No known implementation failures remained after the checks recorded here. History is intentionally in-memory, trails restart on restoration, and legacy static JSON must satisfy the simulation model’s stricter limits; these are documented behavior, not silent compatibility conversions.

## Changed files

Modified:

- `index.html`, `simulation.html`
- `js/simulation.js`, `js/simulation-physics.js`, `js/renderer.js`, `js/ui.js`
- `css/style.css`, `css/field-controls.css`, `css/simulation.css`
- `README.md`, `SIMULATION.md`, `serve.cjs`, `tests/simulation.test.cjs`

Added:

- `js/edit-history.js`
- `tests/history.test.cjs`, `tests/pages.test.cjs`
- `artifacts/fieldwork-current.jpg`
- `artifacts/INTEGRATION_TEST_RESULTS.md`
- `artifacts/integration-browser-checks.json`
- `artifacts/integration-node-tests.txt`

Removed after dependency review:

- `js/main.js`: unused static Visualizer controller
- `js/worker.js`: unused static Visualizer worker
- `css/navigation.css`: removed two-page navigation styles

Final checks also exercised the documented Python HTTP server: the main page, simulation controller, history module and simulation stylesheet each returned HTTP 200. Touched source line endings were normalized after the final whitespace review flagged CRLF as trailing whitespace. Shared Coulomb/RK4 files, the force/integrator implementation, initial regression fixtures, Git remote and HEAD were preserved.
