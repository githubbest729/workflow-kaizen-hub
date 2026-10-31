# WorkflowKaizen Hub

SCADA & Industrial Automation Continuous Improvement, SOP Compliance & Kaizen Board. A local-first PWA built with vanilla ES modules, CSS custom properties and IndexedDB. No runtime dependencies, no network calls, no cloud.

## Architecture

| File | Role |
|---|---|
| `index.html` | App shell, tab nav, modal `<dialog>`, toast region |
| `css/tokens.css` | Design tokens, dark (default) and light themes, AA-contrast palette |
| `css/layout.css` | Grid, safe-area insets, Window Controls Overlay, 320px to 4K breakpoints |
| `css/components.css` | Cards, Kanban, progress rings, badges, modals, buttons (44px targets) |
| `js/db.js` | IndexedDB wrapper. DB `workflow-kaizen-hub` v2, stores `sops`, `kaizens`, `runs`, `meta`, with indexes and an idempotent upgrade path |
| `js/seed-data.js` | Five SCADA/automation SOPs, six Kaizens, six audit runs |
| `js/pwa-installer.js` | Install prompt, update banner (`SKIP_WAITING`), `storage.persist()`, quota and capacity estimate |
| `js/app.js` | State, hash router, views, SOP check-off engine, PDCA board, import/export |
| `sw.js` | Precache + cache-first static, network-first navigations, `offline.html` fallback, sync placeholder |

### Data model
- **SOP**: `id, code, title, category, rev, owner, summary, steps[{text, detail}], updated`
- **Run**: `id, sopId, engineer, ts, total, pass, fail, na, score, results[{step, result, ts}], note`. Score = pass / (pass + fail); N/A is excluded.
- **Kaizen**: `id, title, stage(Plan|Do|Check|Act), priority, waste, owner, problem, whys[5], countermeasure, minutesSaved, incidentReduction, created, updated`

### Retention
Records are tiny (about 1 to 4 KB). Browser quotas are typically hundreds of MB or more, so 2 to 3 years of data is far below quota. The Data & Storage tab requests persistent storage, shows usage and a capacity estimate, and offers JSON backup/restore and CSV reports. Schedule a monthly JSON export as the offline archive.

## Run / deploy
Service workers need HTTPS or `localhost`.
```
cd workflow-kaizen-hub
python3 -m http.server 8080      # then open http://localhost:8080
```
For production, serve the folder over HTTPS from any static host or an internal IIS/nginx. To release an update, bump `VERSION` in `sw.js`; users see an "Update now" banner.

## Test matrix
| Area | Check | Expected |
|---|---|---|
| Install | Chrome/Edge desktop, Android Chrome | Install button appears; launches standalone |
| iOS | Safari Share > Add to Home Screen | Uses `apple-touch-icon.png`; safe areas respected |
| Offline | Load once, enable airplane mode, reload | App and data load; unknown routes show `offline.html` |
| SOP run | Start, mark steps, save | Timestamps per step; run in history; dashboard adherence updates |
| Kaizen | New, move with arrows, edit 5-Whys, delete | Persists after reload |
| Storage | Export JSON, erase, import | Data restored; merge vs replace honoured |
| CSV | Export both reports | Opens in Excel; cells starting with `=+-@` are neutralised |
| Themes | Toggle dark/light | Text contrast at least 4.5:1 |
| Responsive | 320px, 768px, 1440px, 4K | No horizontal scroll; board 1/2/4 columns |
| WCO | Installed desktop PWA | Title bar draggable; buttons not draggable |
| A11y | Keyboard only, screen reader | Visible focus, labelled controls, dialog trap |
| Update | Change `VERSION`, reload twice | Update banner then reload |

## Notes
- Background sync in `sw.js` is a placeholder; the app is local-first.
- Browsers may evict non-persistent storage under pressure; grant persistence and keep exports.
