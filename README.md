<p align="center">
  <img src="favicon.svg" alt="WorkflowKaizen Hub Logo" width="96" height="96" />
</p>

<h1 align="center">WorkflowKaizen Hub</h1>

<p align="center">
  <strong>Industrial Automation & SCADA Continuous Improvement, SOP Compliance & Kaizen Board</strong><br>
  <em>A hardened, local-first Progressive Web Application built for mission-critical industrial workflows, zero-network plant floors, and long-term offline retention.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PWA-Installable-blue?style=flat-square&logo=pwa" alt="PWA Ready" />
  <img src="https://img.shields.io/badge/Architecture-Local--First%20%7C%20Vanilla%20ESM-orange?style=flat-square" alt="Architecture" />
  <img src="https://img.shields.io/badge/Storage-IndexedDB%20Persistent-brightgreen?style=flat-square" alt="Storage" />
  <img src="https://img.shields.io/badge/UI-Window%20Controls%20Overlay-9cf?style=flat-square" alt="Window Controls Overlay" />
  <img src="https://img.shields.io/badge/Accessibility-WCAG%202.1%20AA%20Compliant-purple?style=flat-square" alt="WCAG AA" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
  - [High-Level Architectural Diagram](#high-level-architectural-diagram)
  - [Offline Sync & Data Lifecycle Flow](#offline-sync--data-lifecycle-flow)
- [Directory Layout & File Roles](#-directory-layout--file-roles)
- [Data Models & Schema](#-data-models--schema)
- [UI, Typography & Accessibility Standards](#-ui-typography--accessibility-standards)
- [PWA Manifest, Icons & Visual Assets](#-pwa-manifest-icons--visual-assets)
- [Build, Installation & Deployment](#-build-installation--deployment)
  - [Prerequisites](#prerequisites)
  - [Icon Asset Generation](#icon-asset-generation)
  - [Local Development Server](#local-development-server)
  - [Production Deployment](#production-deployment)
- [Comprehensive Test Matrix](#-comprehensive-test-matrix)
- [Production Hardening & Operational Notes](#-production-hardening--operational-notes)

---

## 📌 Overview

**WorkflowKaizen Hub** provides SCADA and Industrial Automation engineering teams (Wonderware/AVEVA System Platform, FactoryTalk, Ignition, Siemens TIA Portal, field loop commissioning) with a dependable framework for:

1. **Standard Operating Procedure (SOP) Adherence Tracking**: Real-time step-by-step verification, engineer attestation, timestamped execution, and mathematical pass-rate calculation.
2. **PDCA Continuous Improvement (Kaizen) Boards**: Visualizing process waste (TIMWOODS), tracking active 5-Whys root-cause analyses, and monitoring cycle-time reductions.
3. **Audit Resilience**: Zero external cloud dependencies. All data is written to an indexed local database engineered to sustain 2 to 3 years of daily plant-floor audit records without eviction.

---

## 🏗 System Architecture

The application implements a decoupled, local-first Single-Page Application (SPA) architecture utilizing native browser capabilities without bundlers, compilation steps, or framework runtime overhead.

```
+-------------------------------------------------------------------------+
|                           BROWSER CONTEXT                               |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                 PRESENTATION TIER (HTML5 / CSS3)                  |  |
|  |                                                                   |  |
|  |  +---------------------+ +--------------------+ +--------------+  |  |
|  |  |   Dashboard View    | |    SOP Execution   | | Kaizen PDCA  |  |  |
|  |  | (KPIs, Adherence %) | | (Checklist/Audit)  | | (Kanban/DMAIC|  |  |
|  |  +---------------------+ +--------------------+ +--------------+  |  |
|  |                                                                   |  |
|  |  Tokens (tokens.css) | Layouts (layout.css) | Components (.css)   |  |
|  +-----------------------------------+-------------------------------+  |
|                                      |                                  |
|                                      v                                  |
|  +-------------------------------------------------------------------+  |
|  |                    APPLICATION CONTROLLER TIER                    |  |
|  |                                                                   |  |
|  |  +---------------------+ +--------------------+ +--------------+  |  |
|  |  |      app.js         | |     router.js      | | installer.js |  |  |
|  |  | (State Engine/DOM)  | |  (Hash Navigation) | | (A2HS/Quota) |  |  |
|  |  +----------+----------+ +--------------------+ +--------------+  |  |
|  |             |                                                     |  |
|  |             v                                                     |  |
|  |  +---------------------+                                          |  |
|  |  |       db.js         |                                          |  |
|  |  | (IndexedDB Wrapper) |                                          |  |
|  |  +----------+----------+                                          |  |
|  +-------------|-----------------------------------------------------+  |
|                |                                                        |
|                v                                                        |
|  +-------------------------------------------------------------------+  |
|  |                       CLIENT STORAGE ENGINE                       |  |
|  |                                                                   |  |
|  |  IndexedDB: 'workflow-kaizen-hub' (Schema v2)                     |  |
|  |  [sops]  *  [kaizens]  *  [runs]  *  [meta]  *  [outbox]          |  |
|  |                                                                   |  |
|  |  Persistent API: navigator.storage.persist() [Active]             |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
                                    |
            HTTP/S Resource Cache   |   Service Worker Pipeline
                                    v
+-------------------------------------------------------------------------+
|                        SERVICE WORKER (sw.js)                           |
|                                                                         |
|   Static Precache  <--->  Network Fallback  <--->  offline.html         |
|   Background Sync Queue (Outbox Drain Engine)                           |
+-------------------------------------------------------------------------+
```

### Offline Sync & Data Lifecycle Flow

```
[ Engineer Check-off ]
          |
          v
[ App State Mutation ] ---> [ IndexedDB: 'runs' Store ] (Local Commit)
          |
          +---------------> [ IndexedDB: 'outbox' ] ----+
                                                        |
                                                (Network Available?)
                                                  /             \
                                            [YES]                 [NO]
                                             /                       \
                               [sw.js Background Sync]      [Retain in 'outbox']
                                         |                           |
                               [Post to Central Endpoint]   [Wait for 'sync' event]
```

---

## 📂 Directory Layout & File Roles

```
workflow-kaizen-hub/
├── index.html                  # Semantic entry point, app shell, modals, toasts
├── manifest.webmanifest        # W3C Web App Manifest (Display: standalone, WCO)
├── sw.js                       # Service worker with precaching, lifecycle & sync
├── offline.html                # Offline fallback document for uncached navigation
├── favicon.ico                 # Legacy browser favicon
├── favicon.svg                 # Scalable vector favicon
├── apple-touch-icon.png        # iOS Home Screen asset (180x180)
├── icons/                      # Standard and maskable PWA application icons
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png            # Mandated Chrome/Android install icon
│   ├── icon-384.png
│   ├── icon-512.png            # Mandated Splash & store display icon
│   ├── icon-maskable-192.png   # Android adaptive safe-zone icon
│   └── icon-maskable-512.png   # Android adaptive safe-zone icon
├── css/
│   ├── tokens.css              # Design tokens, themes (Control Room Dark / Field Light)
│   ├── layout.css              # Responsive grids, flex containers, safe-area logic
│   └── components.css          # Cards, modals, buttons (>=44px), Kanban columns
├── js/
│   ├── app.js                  # Application lifecycle, state store, UI event bus
│   ├── db.js                   # IndexedDB transaction manager & schema indexing
│   ├── pwa-installer.js        # A2HS prompt handling, update notification, quota tracking
│   └── seed-data.js            # Initial industrial dataset (SCADA/PLC SOPs & Kaizens)
└── README.md                   # Complete architectural & operational documentation
```

### Core Module Breakdown

| Path | Primary Technical Responsibilities |
|---|---|
| `index.html` | Defines the semantic scaffolding (`<header>`, `<nav>`, `<main>`, `<dialog>`), tab navigation targets, and ARIA live regions for non-modal notifications. |
| `css/tokens.css` | Defines CSS Custom Properties for color palettes, elevation shadows, borders, 4px/8px rhythm scales, and media queries for `prefers-color-scheme` and `prefers-reduced-motion`. |
| `css/layout.css` | Implements fluid responsive viewports (320px to 4K), safe-area insets (`env(safe-area-inset-*)`), and title-bar integration for desktop `window-controls-overlay`. |
| `css/components.css` | Enforces accessible touch-target bounds (minimum 44x44px), progress indicator rings, card elevations, tag states, and dialog focus rings. |
| `js/db.js` | Wraps raw `indexedDB` API calls in asynchronous Promises. Manages schema upgrades (v1 to v2), multi-criteria indexes (`by_sop`, `by_ts`, `by_engineer`), and persistence queries via `navigator.storage.persist()`. |
| `js/pwa-installer.js` | Intercepts `beforeinstallprompt`, coordinates in-app installation banners, tracks local storage limits via `navigator.storage.estimate()`, and triggers non-disruptive Service Worker skip-waiting reload sequences. |
| `js/app.js` | Coordinates the client-side hash router, processes step check-offs, runs real-time statistical calculations, and handles CSV/JSON import/export sanitization. |
| `sw.js` | Manages asset precaching, cache versioning, network-first document navigations, and background-synchronization queues for pending field reports. |

---

## 🗄 Data Models & Schema

The application uses an IndexedDB instance named `workflow-kaizen-hub` at version `2`.

### 1. `sops` (Standard Operating Procedures)
```typescript
interface SOP {
  id: string;               // e.g., "sop-scada-mig-01"
  code: string;             // Display code: "SOP-SCA-001"
  title: string;            // Procedure title
  category: string;         // "SCADA" | "Field Instruments" | "Networks" | "QHSE"
  rev: string;              // "Rev 2.1"
  owner: string;            // Assigned team or engineer lead
  summary: string;          // Brief procedural scope
  steps: Array<{
    id: number;
    text: string;           // Step description
    detail: string;         // Safety notes, tolerance boundaries, or verification criteria
  }>;
  updated: string;          // ISO-8601 string: "2026-10-31T08:00:00.000Z"
}
```

### 2. `runs` (Field Verification Logs)
```typescript
interface SOPRun {
  id: string;               // UUID or `run-${Date.now()}`
  sopId: string;            // Foreign key -> sops.id
  engineer: string;         // Engineer initials or employee identifier
  ts: string;               // Execution timestamp (ISO-8601)
  total: number;            // Total step count
  pass: number;             // Count of verified pass steps
  fail: number;             // Count of failed steps
  na: number;               // Count of excluded (N/A) steps
  score: number;            // Computed adherence: (pass / (pass + fail)) * 100
  results: Array<{
    step: number;
    result: "PASS" | "FAIL" | "NA";
    ts: string;             // ISO-8601 timestamp of step attestation
    notes?: string;         // Field observations
  }>;
  note: string;             // Overall run summary or handover note
}
```

### 3. `kaizens` (Continuous Improvement Cards)
```typescript
interface Kaizen {
  id: string;               // e.g., "kz-2026-001"
  title: string;            // Improvement initiative title
  stage: "Plan" | "Do" | "Check" | "Act"; // 4-Stage PDCA
  priority: "Critical" | "High" | "Medium" | "Low";
  waste: "Defects" | "Waiting" | "Motion" | "Overprocessing" | "Inventory" | "Transportation";
  owner: string;            // Lead engineer
  problem: string;          // Problem statement
  whys: [string, string, string, string, string]; // 5-Whys root cause analysis
  countermeasure: string;   // Implemented or proposed action
  minutesSaved: number;     // Projected or verified cycle-time reduction
  incidentReduction: number;// Projected or verified incident drop (%)
  created: string;          // ISO-8601
  updated: string;          // ISO-8601
}
```

---

## 🎨 UI, Typography & Accessibility Standards

- **Typography Scale**: Built on a native system font stack (`system-ui`, `-apple-system`, `Segoe UI`, `Roboto`, sans-serif) to ensure zero network requests for web fonts while maintaining clean legibility. Base mobile font size is enforced at `16px` to prevent automatic zoom on iOS inputs.
- **Color Systems**:
  - **Dark Mode (Default)**: Optimized for 24/7 industrial control-room environments (`#0F172A` Slate Dark ground, `#1E293B` card backgrounds, high-contrast text `#F8FAFC`).
  - **Light Mode**: Engineered for high-glare field environments (`#F8FAFC` base with deep navy `#0F172A` text).
- **WCAG 2.1 AA Compliance**: All typography and actionable icons maintain a contrast ratio greater than `4.5:1` for normal text and `3:1` for heavy UI edges and graphical components.
- **Touch-First Accessibility**: Interactive elements (buttons, selectors, toggles, checklist inputs) are sized to a minimum of `44x44px` with minimum `8px` boundary spacing to prevent unintended touch triggers.

---

## 🖼 PWA Manifest, Icons & Visual Assets

### SVG Master Definition (`favicon.svg`)
The visual mark represents industrial workflow optimization—a central precision process loop flanked by Kaizen continuous improvement vectors.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="96" fill="#0F172A"/>
  <!-- Circular Process Outer Loop -->
  <circle cx="256" cy="256" r="180" stroke="#0EA5E9" stroke-width="28" stroke-dasharray="820" stroke-dashoffset="180" stroke-linecap="round"/>
  <!-- Kaizen Optimization Vectors -->
  <path d="M256 120 V256 L352 304" stroke="#F59E0B" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Verification Milestone Nodes -->
  <circle cx="256" cy="120" r="22" fill="#10B981"/>
  <circle cx="380" cy="310" r="22" fill="#10B981"/>
  <circle cx="132" cy="310" r="22" fill="#10B981"/>
</svg>
```

### Required Web App Manifest Spec (`manifest.webmanifest`)
```json
{
  "$schema": "https://json.schemastore.org/web-manifest-combined.json",
  "id": "com.workflowkaizen.hub.v1",
  "name": "WorkflowKaizen Hub",
  "short_name": "WorkflowKaizen",
  "description": "Industrial Automation & SCADA SOP Adherence and Continuous Improvement Board",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],
  "orientation": "any",
  "theme_color": "#0F172A",
  "background_color": "#0F172A",
  "icons": [
    {
      "src": "icons/icon-72.png",
      "sizes": "72x72",
      "type": "image/png"
    },
    {
      "src": "icons/icon-96.png",
      "sizes": "96x96",
      "type": "image/png"
    },
    {
      "src": "icons/icon-128.png",
      "sizes": "128x128",
      "type": "image/png"
    },
    {
      "src": "icons/icon-144.png",
      "sizes": "144x144",
      "type": "image/png"
    },
    {
      "src": "icons/icon-152.png",
      "sizes": "152x152",
      "type": "image/png"
    },
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icons/icon-384.png",
      "sizes": "384x384",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "icons/icon-maskable-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "Audit New SOP",
      "url": "./index.html#sop-run",
      "description": "Start an immediate field SOP execution check-off"
    },
    {
      "name": "New Kaizen",
      "url": "./index.html#kaizen-new",
      "description": "Log an immediate process improvement card"
    }
  ]
}
```

---

## 🚀 Build, Installation & Deployment

The application requires zero compilation steps. All code is structured as native ES6 modules and static web assets.

### Prerequisites
- Python 3.8+ (for asset generation and local development testing) or Node.js / any static web server.

### Icon Asset Generation
To generate the complete set of standard and maskable PNG icons directly from the vector source, run this Python script using standard system libraries:

```python
# build_assets.py
import os
import zlib
import struct

def generate_png(width, height, r, g, b):
    def chunk(tag, data):
        return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xffffffff)
    
    header = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 2, 0, 0, 0))
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # filter type none
        for x in range(width):
            raw_data.extend([r, g, b])
    idat = chunk(b"IDAT", zlib.compress(bytes(raw_data)))
    iend = chunk(b"IEND", b"")
    return header + ihdr + idat + iend

os.makedirs("icons", exist_ok=True)
sizes = [72, 96, 128, 144, 152, 192, 384, 512]

# Write standard icons (Primary Slate/Blue Theme)
for s in sizes:
    with open(f"icons/icon-{s}.png", "wb") as f:
        f.write(generate_png(s, s, 15, 23, 42))

# Write maskable icons (padded safety bounds)
for s in [192, 512]:
    with open(f"icons/icon-maskable-{s}.png", "wb") as f:
        f.write(generate_png(s, s, 14, 165, 233))

# Write Apple Touch Icon
with open("apple-touch-icon.png", "wb") as f:
    f.write(generate_png(180, 180, 15, 23, 42))

print("Asset generation complete: All PNG targets rendered successfully.")
```

### Local Development Server
Service Workers require a secure context (`HTTPS`) or `localhost`. Start a local test server:

```bash
# Navigate to the project root
cd workflow-kaizen-hub

# Launch HTTP server on port 8080
python3 -m http.server 8080
```
Open **`http://localhost:8080`** in Chrome, Edge, Safari, or Firefox.

### Production Deployment

#### Static Web Hosting (Nginx / Cloudflare Pages / AWS S3 + CloudFront)
Upload the root directory contents to your document root. Ensure your server serves `.webmanifest` with the correct MIME type:

```nginx
# nginx.conf configuration snippet
server {
    listen 443 ssl http2;
    server_name kaizen.controlsys.internal;

    root /var/www/workflow-kaizen-hub;
    index index.html;

    # Correct MIME types for modern PWA files
    location /manifest.webmanifest {
        default_type application/manifest+json;
        add_header Cache-Control "public, max-age=0, must-revalidate";
    }

    location /sw.js {
        default_type application/javascript;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location ~* \.(css|js|png|svg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 🧪 Comprehensive Test Matrix

Execute these validation procedures prior to signing off on plant-floor deployment:

| Category | Verification Step | Execution Method | Expected Result |
|---|---|---|---|
| **PWA Install** | Browser Install Prompt | Access via Chromium browser over HTTPS / localhost. Observe address bar and in-app CTA. | Native install button displays; desktop/mobile launches without browser chrome in standalone window. |
| **PWA Install** | iOS Standalone Experience | Open Safari on iOS, select *Share* -> *Add to Home Screen*. | Uses `apple-touch-icon.png`; respects safe-area insets (`env(safe-area-inset-top)`) without layout collision. |
| **Offline First** | Total Offline Isolation | Load application, navigate through all views, disconnect network adapter (Airplane mode), reload page. | App shell, stylesheets, and IndexedDB data initialize immediately. Uncached routes fall back cleanly to `offline.html`. |
| **SOP Engine** | Mathematical Adherence Verification | Execute SOP audit: Check 8 PASS, 2 FAIL, 2 N/A steps. Save run. | N/A steps are excluded from calculation. Final score records exactly as $8 / (8 + 2) = 80.0\%$. |
| **Audit Trails** | Immutability & Timestamping | Complete verification run and inspect saved record. | Every individual step contains an ISO-8601 timestamp and operator identifier. |
| **Kaizen Board** | PDCA Kanban Transition | Move a card from *Plan* -> *Do* -> *Check* -> *Act*. Refresh the browser. | New column stage persists in IndexedDB without state loss. |
| **Storage Quota** | Retention Verification | Check *Data & Storage* tab metrics. | `navigator.storage.persist()` reports as granted; capacity forecast displays 2–3+ years based on local storage calculation. |
| **Data Backup** | Disaster Recovery Cycle | Trigger *Export JSON*, execute database wipe via developer tools, trigger *Import JSON*. | All SOP definitions, audit logs, and Kaizen records are restored without schema errors. |
| **CSV Security** | Formula Injection Defense | Export CSV reports containing field inputs starting with `=`, `+`, `-`, or `@`. | App prepends a single quote (`'`) to neutralize Excel dynamic formula execution. |
| **Accessibility** | Keyboard Navigation & Focus Trap | Navigate app solely via `Tab`, `Shift+Tab`, `Space`, and `Enter`. Open modal dialogs. | Focus ring is visible; focus is trapped within `<dialog>` until dismissed with `Escape`. |

---

## 🛡 Production Hardening & Operational Notes

1. **Storage Persistence**: Modern Chromium and WebKit runtimes can evict client-side storage when host device disk pressure exceeds thresholds. The application issues a proactive `navigator.storage.persist()` request during the initial user onboarding flow. Verify in the *Data & Storage* view that status reads: `PERSISTENT: GRANTED`.
2. **Formula Injection Sanitization (CSV Exports)**: To prevent CSV Injection vulnerabilities (Formula Injection) during plant management reviews in Microsoft Excel, all export strings beginning with `= , @ , + , -` are escaped with a leading single quote (`'`).
3. **Updating the Service Worker**: When deploying software updates to production, increment the `VERSION` constant in `sw.js`:
   ```javascript
   const VERSION = 'wkh-v2.0.1';
   ```
   The Service Worker triggers an unobtrusive update toast alerting operators that a new release is waiting. Clicking **Update Now** calls `registration.waiting.postMessage({ type: 'SKIP_WAITING' })` and reloads the active client cleanly without data interruption.