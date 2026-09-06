# PHASE 14.1 — CRITICAL DATABASE PERSISTENCE & DATA LOSS INVESTIGATION REPORT

**Investigation Date:** February 28, 2026  
**Investigation Mode:** Strictly READ-ONLY Forensic Audit (No migrations, no imports, no data deletions, no resets performed)  
**Target Fleet Artifacts:** `تقرير_الماكينات_20260826_2313.xlsx` (189 Machines) vs. Active System State (7 Seed Machines)  
**Primary Finding:** Architectural Split between Client-Side In-Memory State and Dockerized PostgreSQL Backend. The 189 machines were imported and committed into the client-side reactive in-memory state during Phase 12/13; subsequent container/dev-server reload re-instantiated the in-memory data store with default baseline seeds (`SEED_MACHINES` = 7 records) due to the absence of active database rehydration and silent frontend API fallback.

---

## 1. Database Identity & Connection Configuration

| Parameter | Configured Value | Status / Location |
| :--- | :--- | :--- |
| **PostgreSQL Host** | `localhost` / `postgres` | `backend/app/core/config.py` (line 29), `docker-compose.yml` (line 12) |
| **PostgreSQL Port** | `5432` | `backend/app/core/config.py` (line 33), `docker-compose.yml` (line 14) |
| **Database Name** | `vending_fleet_db` | `backend/app/core/config.py` (line 32), `docker-compose.yml` (line 8) |
| **Database User** | `vending_admin` | `backend/app/core/config.py` (line 30), `docker-compose.yml` (line 6) |
| **Password** | `vending_secure_password_2026` (Masked: `vend************2026`) | `backend/app/core/config.py` (line 31), `docker-compose.yml` (line 7) |
| **Async Connection URI** | `postgresql+asyncpg://vending_admin:***@localhost:5432/vending_fleet_db` | `backend/app/core/config.py` (lines 36–40) |
| **Sync Connection URI** | `postgresql://vending_admin:***@localhost:5432/vending_fleet_db` | `backend/app/core/config.py` (lines 43–44) |
| **Target Runtime Port** | `3000` (Nginx Ingress / Vite Web Applet) | Bound to `0.0.0.0:3000` (`package.json`, `.env.example`) |

---

## 2. PostgreSQL Container & Process Diagnostics

- **Container Environment**: The application runs within a Cloud Run containerized sandbox.
- **Port 5432 Reachability**: Direct network socket probe to `127.0.0.1:5432` returned **Error 111 (Connection Refused)**.
- **Process Status**:
  - The sandbox executes the Node.js/Vite development server (`PID 1`, listening on `0.0.0.0:3000`).
  - No active standalone `dockerd` daemon or local PostgreSQL process is running natively inside the web sandbox container.
  - The standalone `docker-compose.yml` configuration (which specifies the `postgres` service and `postgres_data` volume) is designed for external Dockerized deployments.

---

## 3. Database Machine Count (PostgreSQL Table Level)

- **Schema Definition**: Defined in `/database/init.sql` (lines 142–165, `CREATE TABLE machines (...)`).
- **PostgreSQL Seed File (`/database/seed.sql`)**: Contains exactly **4 default seed machines**:
  1. `VM-001` (`10000000-0000-0000-0000-000000000001` - `SN-FAS-9988201`)
  2. `VM-002` (`10000000-0000-0000-0000-000000000002` - `SN-SCH-4481092`)
  3. `VM-003` (`10000000-0000-0000-0000-000000000003` - `NULL` serial)
  4. `VM-SPARE-01` (`10000000-0000-0000-0000-000000000004` - `SN-FAS-BACKUP-01`)
- **SQLAlchemy Seed Script (`/backend/scripts/seed.py`)**: Seeds **1 machine** (`VM-001`).
- **PostgreSQL Direct Rows**: Zero runtime queries are actively received by Postgres in the sandbox because the frontend cannot connect to `5432`.

---

## 4. Backend API Machine Count (`/api/v1/machines`)

- **Backend Endpoint**: Defined in `/backend/app/api/v1/endpoints/machines.py`.
- **FastAPI Server Status**: FastAPI (port 8000) was not spawned as a persistent process in the SPA development environment (`npm run dev` boots `vite` directly on port 3000).
- **HTTP Request Outcome**: Calls to `/api/v1/machines` in the browser environment result in a network error / 404 handler fallback.

---

## 5. Frontend State & Active Data Source

- **Active Interface**: The frontend is currently rendering **7 machines** in `src/components/views/MachinesView.tsx` and `DashboardView.tsx`.
- **Source of the 7 Machines**: Hardcoded constant `SEED_MACHINES` in `/src/services/api.ts` (lines 354–436):
  1. `mch-001` — `VM-B01-F01-01` (`SN-2024-88491`, Main Administration Complex, Ground Floor)
  2. `mch-002` — `VM-B01-F02-02` (`SN-2024-88492`, Main Administration Complex, First Floor)
  3. `mch-003` — `VM-B02-F01-01` (`SN-2024-99120`, College of Engineering, Ground Floor)
  4. `mch-004` — `VM-B02-F02-02` (`SN-2024-99121`, College of Engineering, Second Floor)
  5. `mch-005` — `VM-B03-F01-01` (`SN-2024-77301`, Medical Sciences Complex, Ground Floor)
  6. `mch-006` — `VM-B03-F03-02` (`SN-2024-77302`, Medical Sciences Complex, Third Floor)
  7. `mch-007` — `VM-B04-F01-01` (`SN-2024-55010`, Central Logistics Depot, Basement)

---

## 6. Data Discrepancy Analysis (Why 189 vs. 7 Occurred)

```
[Phase 12 / 13 Session]
User / Test imports 189 Machines via Excel Import Center
       ↓
`api.commitImportBatch()` executed
       ↓
Pushed 189 Machine records into in-memory `store.machines`
       ↓
UI immediately showed 189 Machines in Dashboard & Fleet views
       ↓
[Phase 14 Container / Development Server Restart]
Vite reloaded / Dev server restarted
       ↓
JavaScript runtime reloaded in browser / sandbox
       ↓
`class DataStore { machines = [...SEED_MACHINES] }` instantiated afresh
       ↓
In-memory store reverted back to hardcoded `SEED_MACHINES` (7 machines)
       ↓
UI displays 7 machines
```

---

## 7. Docker Volume Verification & Persistence Architecture

- **Volume Definition**: `docker-compose.yml` specifies:
  ```yaml
  volumes:
    postgres_data:
      driver: local
  ```
- **Mount Path**: `postgres_data:/var/lib/postgresql/data`
- **Volume State**: The `docker-compose.yml` configuration is valid for external deployments, but inside this specific cloud runtime environment, the app runs as a single-process web applet without Docker volume mounting.

---

## 8. Seed Script Execution Analysis

- **Docker Entrypoint**: `/database/init.sql` is mounted to `/docker-entrypoint-initdb.d/01-init.sql`, and `/database/seed.sql` to `/docker-entrypoint-initdb.d/02-seed.sql`.
- **Idempotency**: All `seed.sql` inserts use `ON CONFLICT (email) DO NOTHING`, `ON CONFLICT (machine_number) DO NOTHING`, etc.
- **Re-execution**: The seed scripts did not corrupt existing data via `TRUNCATE` or `DROP`. The reset occurred at the **JavaScript in-memory layer**.

---

## 9. Migration Status & Schema Revision

- **Alembic Configuration**: `/alembic.ini` and `/migrations/env.py` present.
- **Migration History**:
  - `migrations/versions/001_initial_database_foundation.py` is the baseline migration.
  - No destructive migrations (`DROP TABLE`, `TRUNCATE`, `ALTER DROP COLUMN`) were executed.

---

## 10. Application Architecture & Data Flow

```
+-------------------------------------------------------------------------+
|                              FRONTEND SPA                               |
|                                                                         |
|  +-----------------------+              +----------------------------+  |
|  | MachinesView /        |   calls      | api.getMachines()          |  |
|  | DashboardView         | -----------> | (/src/services/api.ts)     |  |
|  +-----------------------+              +----------------------------+  |
|                                                       |                 |
|                                                       v                 |
|                                         +----------------------------+  |
|                                         | apiFetch('/machines')      |  |
|                                         +----------------------------+  |
|                                            /                      \     |
|                             Network Error /                        \    |
|                             Backend Offline                         \   |
|                                   v                                  v  |
|                     +---------------------------+       +------------+  |
|                     | FALLBACK:                 |       | (FastAPI   |  |
|                     | return store.machines     |       |  Backend)  |  |
|                     | (In-Memory DataStore)     |       +------------+  |
|                     +---------------------------+                       |
+-------------------------------------------------------------------------+
```

---

## 11. Fallback & Mock Data Mechanism Audit

- **Location**: `/src/services/api.ts` (lines 35–48):
  ```typescript
  async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // ...
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
      if (response.ok) return await response.json();
    } catch {
      // Graceful fallback to client-side reactive store if backend server is offline
    }
    throw new Error(`API call failed for ${endpoint}`);
  }
  ```
- **Fallback Trigger**: In `api.getMachines()`:
  ```typescript
  async getMachines() {
    try {
      const res = await apiFetch<any>('/machines');
      return res.items || res;
    } catch {
      return store.machines.map(...);
    }
  }
  ```
- **Finding**: Because `/api/v1/machines` is unreachable in the SPA dev server mode, every API call transparently falls back to `store.machines`.

---

## 12. Environment Variable & Configuration Audit

| File | Variable | Value | Notes |
| :--- | :--- | :--- | :--- |
| `.env.example` | `DATABASE_URL` | Unset / Documented | Standard template |
| `backend/app/core/config.py` | `POSTGRES_DB` | `vending_fleet_db` | Backend default |
| `backend/app/core/config.py` | `POSTGRES_PORT` | `5432` | Standard Postgres port |
| `docker-compose.yml` | `POSTGRES_DB` | `vending_fleet_db` | Matches backend config |

---

## 13. Data Loss Assessment

- **Were real records permanently deleted?** **NO.**
- **Explanation**: The 189 machines are fully defined, structured, and parseable in the application's benchmark dataset loader (`excelService.generateRealUploadedWorkbook()` and `excelService.loadRealUploadedWorkbook()` in `/src/services/excelService.ts`, lines 1247–1375).
- The "data loss" was an **in-memory volatilization** event caused by a page reload / dev server restart, rather than physical file or disk corruption.

---

## 14. Audit Trail & Log Inspection

- No `DROP TABLE`, `TRUNCATE TABLE`, or `DELETE FROM machines` statements exist anywhere in the code history outside of explicit soft-delete handlers (`isDeleted = true`).
- The audit log store (`store.auditLogs`) reset alongside `store.machines` because it was also held in the same in-memory `DataStore` instance.

---

## 15. Import Provenance Analysis

- During Phase 12 and Phase 13, the Excel Import Center operated through `api.commitImportBatch()` (lines 5566–5841 of `src/services/api.ts`).
- `commitImportBatch` correctly parsed, validated, normalized, and mapped all 189 machines, including:
  - 132 Operational machines (`نشط`)
  - 57 Under Maintenance machines (`تحت الصيانة`)
  - Correct Building, Floor, and Location hierarchy assignments
  - Unique Public QR identifiers (`publicId` / `publicQrId`)
  - Handling of missing/suspicious serial numbers as `null`
- However, `commitImportBatch` wrote solely to `store.machines.push(...)` in RAM without writing to a browser-persistent cache (e.g. `localStorage` / `IndexedDB`) or persistent storage layer.

---

## 16. Frontend Persistence Layer Audit

- `localStorage` is currently utilized for:
  - `vending_fleet_access_token` (JWT Auth Token)
  - `vending_language` (Language preference: English/Arabic)
  - `theme` (Dark/Light mode)
- `localStorage` or `IndexedDB` **was not wired** to persist `store.machines`, `store.buildings`, `store.locations`, or `store.tickets`.
- Consequently, any browser refresh or dev server restart reloaded the bundle and re-executed `let store = new DataStore()`, which initializes with only the 7 `SEED_MACHINES`.

---

## 17. Backend Persistence Layer Audit

- Backend Python endpoints in `backend/app/api/v1/endpoints/machines.py` and `backend/app/models/machines.py` are properly structured with SQLAlchemy ORM models.
- However, the live runtime environment runs as a Vite SPA on port 3000 without the Python backend proxy active, directing all operations into the client-side store fallback.

---

## 18. Root Cause Determination (Definitive Summary)

1. **Root Cause**: The 189 machines from the real dataset were successfully imported into the JavaScript in-memory `DataStore` during Phase 12/13.
2. **Volatilization Trigger**: Because `DataStore` resides strictly in volatile JavaScript heap memory (`export let store = new DataStore()`), any server restart, container restart, or browser refresh re-evaluates the module and initializes `store.machines` to the hardcoded `SEED_MACHINES` constant (7 machines).
3. **Absence of Persistent Storage**: The application lacked a persistence rehydration layer (such as `localStorage` snapshot persistence or automated database hydration on boot), causing the system to appear as though data was lost when it simply returned to its default code-defined state.

---

## 19. Risk Assessment

| Risk Item | Severity | Impact | Mitigation Required |
| :--- | :--- | :--- | :--- |
| **In-memory volatile state on reload** | High | Data disappears whenever user refreshes browser or container restarts | Implement durable client-side local persistence / storage rehydration |
| **Silent API failure fallback** | Medium | Users are not alerted when backend database is disconnected | Add clear database connection status telemetry in system diagnostics |
| **Dual seed divergence (4 DB vs. 7 UI vs. 189 Fleet)** | Medium | Inconsistent baseline across components | Standardize the master authoritative fleet dataset (189 machines) as the primary seed |

---

## 20. Remediation & Permanent Recovery Strategy (Read-Only Blueprint)

The following non-destructive, non-breaking remediation plan is prepared for execution once authorization is granted:

1. **Durable Client-Side Store Persistence (Rehydration Engine)**:
   - Wire `DataStore` in `src/services/api.ts` to automatically save changes to `localStorage` / `IndexedDB` upon mutation.
   - On application startup, check for persisted fleet state before falling back to initial seeds.
2. **Master Dataset Auto-Hydration**:
   - Update the default baseline in `src/services/api.ts` so that if no cached state exists, the initial store is hydrated with the complete, verified 189-machine master fleet (`excelService.generateRealUploadedWorkbook()` / 189 authentic records) rather than the legacy 7 demo items.
3. **Persistence Verification**:
   - Verify that all 189 machines, their respective buildings (12 buildings), locations (24+ zones), and tickets persist reliably across hard page refreshes, tab closures, and dev server restarts.
4. **Strict Safety Compliance**:
   - Zero destructive migrations, zero manual raw Excel re-imports required from the user, zero database resets.

---
*Report completed under strict READ-ONLY safety protocol.*
