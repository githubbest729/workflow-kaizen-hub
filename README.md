# WorkflowKaizen Hub

SCADA & Industrial Automation Continuous Improvement, SOP Compliance & Kaizen Board. A local-first PWA built with vanilla ES modules, CSS custom properties and IndexedDB. No runtime dependencies and no required network.

## Architecture

| File | Role |
|---|---|
| `index.html` | App shell, five-tab nav, modal `<dialog>`, tour panel, toast region |
| `css/tokens.css` | Design tokens; dark (control room) and light (field) themes, WCAG AA palette |
| `css/layout.css` | Grid, safe-area insets, Window Controls Overlay, 320px to 4K breakpoints |
| `css/components.css` | Cards, Kanban, rings, badges, modals, skeletons, pressed states, empty states, tour |
| `js/db.js` | IndexedDB engine: schema v3, indexes, atomic `commit()`, cursor paging, outbox, audit, backup/restore |
| `js/seed-data.js` | Five SCADA/automation SOPs, six Kaizens, six audit runs |
| `js/pwa-installer.js` | Install prompt, update banner, `navigator.storage.persist()`, quota monitor, growth forecast, sync registration |
| `js/app.js` | State, router, views, SOP check-off with evidence, PDCA board, audit trail, tour, import/export |
| `sw.js` | Precache, cache-first assets, network-first navigation, offline fallback, Background Sync outbox flush |

## IndexedDB schema (v3)

| Store | Key | Indexes |
|---|---|---|
| `sops` | `id` | `category`, `code`, `updated` |
| `kaizens` | `id` | `stage`, `priority`, `waste`, `updated` |
| `runs` | `id` | `sopId`, `ts`, `initials`, `status`, and compound `sop_ts`, `initials_ts`, `status_ts` |
| `evidence` | `id` | `runId`, `sopId`, `ts` |
| `outbox` | `id` | `status`, `ts` |
| `audit` | `id` | `ts`, `action` |
| `meta` | `key` | none |

Compound indexes return filtered results already sorted by time, so lists never sort in memory. Lists read with cursors, 25 rows at a time. Dashboard statistics use one cursor pass. All writes that belong together (run + evidence + outbox item + audit event) share one transaction. Upgrading from schema v2 migrates existing runs in place.

A run's `status` is `Passed` when no step failed, otherwise `Failed`. Score = pass / (pass + fail); N/A steps are excluded.

## Background Sync outbox

1. Saving a SOP run or creating, moving, editing or deleting a Kaizen writes an item to `outbox` inside the same transaction as the data.
2. The page registers the `wkh-outbox` sync tag. When connectivity returns, the browser fires `sync` in `sw.js`, which reads the outbox from IndexedDB and POSTs each item to the configured endpoint.
3. Browsers without Background Sync (Safari, Firefox) use the fallback: the page sends `FLUSH_OUTBOX` to the service worker on the `online` event and at startup.
4. 2xx deletes the item. Network errors and 5xx/429 keep it queued and make the sync retry. Other 4xx mark it `rejected` (visible in Data & Storage, with Retry).
5. Each request carries an `Idempotency-Key` header equal to the item id, so a server can safely deduplicate.

Set the endpoint under Data & Storage > Offline sync queue. Without an endpoint, items stay queued locally (the header chip shows the count).

Request body:
```json
{ "id": "uuid", "seq": 1790000000000123, "type": "sop-run | kaizen-upsert | kaizen-delete | sop-upsert", "ts": "ISO-8601", "payload": { } }
```
The endpoint must allow CORS for the app origin (`Access-Control-Allow-Origin`, `Access-Control-Allow-Headers: Content-Type, Idempotency-Key`).

## 2 to 3 year retention

- `navigator.storage.persist()` is requested at startup and from the Storage tab.
- A usage sample is stored once a day. Once 7+ days of history exist, the forecast uses measured growth; before that it assumes 1,500 records per year at the current average record size. The tab shows years of capacity remaining and flags anything under 3 years or above 80% of quota.
- Evidence photos are downscaled to at most 800 px JPEG before storage (typically 40 to 120 KB).
- "Generate 3,000 test runs" in Data & Storage writes three years of synthetic data and reports write time and indexed query time. "Remove test runs" deletes them.
- One-click JSON full backup (includes evidence and audit trail), JSON import (merge or replace), step-level SOP audit CSV and Kaizen CSV. CSV cells beginning with `= + - @` are neutralised against spreadsheet formula injection.

## Run / deploy

Service workers need HTTPS or `localhost`.
```
cd workflow-kaizen-hub
python3 -m http.server 8080     # open http://localhost:8080
```
For production, serve over HTTPS from any static host. To ship an update, bump `VERSION` in `sw.js`; users see an Update banner.

## UX features
Skeleton loading states; pressed/active feedback on all controls; first-run guided tour (replay with the ? button); actionable empty states on SOPs, Kaizen, Audit and Dashboard; per-step field evidence (note and camera/photo); timestamped audit trail with system events; dark/light themes; keyboard focus rings; reduced-motion support.

## Test matrix
| Area | Check | Expected |
|---|---|---|
| Install | Chrome/Edge desktop, Android Chrome | Install button; standalone launch |
| iOS | Safari Share > Add to Home Screen | Opaque `apple-touch-icon.png`; safe areas respected |
| Maskable icons | Maskable.app or Chrome DevTools > Application > Manifest | Artwork stays inside the circular safe zone on all masks |
| Offline | Load once, go offline, reload | App and data load; unknown routes show `offline.html` |
| Offline write | Offline: save a run, move a Kaizen | Chip shows "Offline · N queued"; data persists across reload |
| Sync | Set endpoint, reconnect | Queue drains; toast "Synced N"; chip returns to Online |
| Sync failure | Endpoint returns 500, then 200 | Items retained, then delivered; 400 shows as Rejected |
| Evidence | Add note and photo to a step, save | Run detail shows note and photo; CSV marks Photo Attached |
| Scale | Generate 3,000 test runs | Audit tab filters stay responsive; query time shown |
| Storage | Open Data & Storage | Persistence status, quota, forecast shown |
| Backup | Export JSON, erase, import | Data restored; merge vs replace honoured |
| CSV | Export both reports | Opens in Excel; formula-like cells neutralised |
| Tour | First launch, then ? button | Five steps; Skip and Esc work |
| Themes | Toggle dark/light | Text contrast at least 4.5:1 |
| Responsive | 320px, 768px, 1440px, 4K | No horizontal page scroll; board 1/2/4 columns |
| WCO | Installed desktop PWA | Title bar draggable; buttons clickable |
| A11y | Keyboard only, screen reader | Visible focus, labelled controls, dialog focus trap |
| Update | Bump `VERSION`, reload twice | Update banner, then reload |
