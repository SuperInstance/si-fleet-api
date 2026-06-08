# INTEGRATION.md — si-fleet-api

> Express REST API for the SuperInstance fleet. Provides endpoints for
> repos, capabilities, fleet budgets, budget transfers, conservation
> audits, fleet events, and ecosystem health monitoring.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [REST Endpoints Reference](#rest-endpoints-reference)
3. [Supabase Integration](#supabase-integration)
4. [How si-cli Calls si-fleet-api](#how-si-cli-calls-si-fleet-api)
5. [Conservation Law Enforcement](#conservation-law-enforcement)
6. [Budget Transfer Protocol](#budget-transfer-protocol)
7. [Fleet Monitoring Flow](#fleet-monitoring-flow)
8. [Capability Resolution](#capability-resolution)
9. [Event Logging](#event-logging)
10. [Ecosystem Health Endpoint](#ecosystem-health-endpoint)
11. [Dashboard Integration](#dashboard-integration)
12. [Environment Variables](#environment-variables)
13. [Running Locally](#running-locally)
14. [Deployment](#deployment)
15. [Error Handling](#error-handling)

---

## Architecture Overview

`si-fleet-api` is an Express.js server (`src/index.ts`) backed by Supabase
(`src/supabase.ts`) with conservation law logic in `src/conservation.ts`.

```
src/
├── index.ts          — Express app, all REST routes
├── supabase.ts       — Supabase client singleton (env-configured)
└── conservation.ts   — Budget verification, transfer, fleet audit
```

### Technology Stack

- **Express** — HTTP server with CORS enabled
- **@supabase/supabase-js** — Postgres REST client
- **TypeScript** — strict mode, ES module output

---

## REST Endpoints Reference

### Health

| Method | Path              | Description              |
|--------|-------------------|--------------------------|
| GET    | `/api/health`     | Service health check     |

```json
// Response
{ "status": "ok", "service": "si-fleet-api", "version": "1.0.0" }
```

### Repos

| Method | Path                    | Description                    |
|--------|-------------------------|--------------------------------|
| GET    | `/api/repos`            | List all repos, optional `?language=` filter |
| GET    | `/api/repos/search?q=`  | Search repos by name/description |
| GET    | `/api/repos/:name`      | Get a single repo by name      |

```bash
# List all Rust repos
curl http://localhost:3001/api/repos?language=rust

# Search for "transport"
curl http://localhost:3001/api/repos/search?q=transport

# Get specific repo
curl http://localhost:3001/api/repos/si-cli
```

### Capabilities

| Method | Path                          | Description                    |
|--------|-------------------------------|--------------------------------|
| GET    | `/api/capabilities`           | List all, optional `?category=`|
| GET    | `/api/capabilities/resolve`   | Find repos by needed capabilities |

```bash
# List infrastructure capabilities
curl http://localhost:3001/api/capabilities?category=infrastructure

# Find repos that provide "conservation-checker" and "supabase-rest-client"
curl "http://localhost:3001/api/capabilities/resolve?needs=conservation-checker,supabase-rest-client"
```

The resolve endpoint returns matched repos grouped by repo name:

```json
{
  "needed": ["conservation-checker", "supabase-rest-client"],
  "matched_repos": [
    {
      "repo": "si-cli",
      "matching_capabilities": [...]
    }
  ]
}
```

### Fleet Budgets

| Method | Path                     | Description                    |
|--------|--------------------------|--------------------------------|
| GET    | `/api/fleet/budgets`     | All budgets with conservation status |
| POST   | `/api/fleet/transfer`    | Transfer budget between agents  |
| GET    | `/api/fleet/audit`       | Full fleet conservation audit   |

```bash
# Get all budgets (includes conservation verification per row)
curl http://localhost:3001/api/fleet/budgets

# Response includes:
# { ..., "conservation": { "valid": true, "delta": 0.0 } }

# Transfer 0.5 budget from wasserstein-0 to categorical-0
curl -X POST http://localhost:3001/api/fleet/transfer \
  -H "Content-Type: application/json" \
  -d '{"from":"wasserstein-0","to":"categorical-0","amount":0.5}'

# Full fleet audit
curl http://localhost:3001/api/fleet/audit
```

### Fleet Events

| Method | Path                     | Description                    |
|--------|--------------------------|--------------------------------|
| POST   | `/api/fleet/events`      | Log a fleet event              |
| GET    | `/api/fleet/health`      | Ecosystem-wide health summary  |

### Stats

| Method | Path          | Description                          |
|--------|---------------|--------------------------------------|
| GET    | `/api/stats`  | Aggregate ecosystem statistics       |

```json
{
  "total_repos": 12,
  "total_tests": 48,
  "by_language": { "rust": 6, "typescript": 3, "python": 2, "zig": 1 },
  "total_capabilities": 34,
  "languages": ["rust", "typescript", "python", "zig"]
}
```

---

## Supabase Integration

### Client Configuration

```typescript
import { getClient } from './supabase.js';

// Reads from environment:
//   SUPABASE_URL         — project URL
//   SUPABASE_SERVICE_KEY  — service role key
const supabase = getClient();
```

The client is a singleton with `autoRefreshToken: false` and
`persistSession: false` (server-side usage).

### Tables Queried

| Table             | Read | Write | Endpoints Using It                    |
|-------------------|------|-------|---------------------------------------|
| `repos`           | ✓    | —     | GET /api/repos, /api/repos/search     |
| `capabilities`    | ✓    | —     | GET /api/capabilities, /resolve       |
| `fleet_budgets`   | ✓    | ✓     | GET/POST /api/fleet/budgets, transfer |
| `fleet_events`    | ✓    | ✓     | POST /api/fleet/events, GET health    |

### Supabase Queries in Detail

#### Repo Listing with Filter

```typescript
let query = supabase.from('repos').select('*');
if (req.query.language) {
    query = query.eq('language', req.query.language);
}
const { data, error } = await query;
```

#### Case-Insensitive Search

```typescript
const { data, error } = await supabase
    .from('repos')
    .select('*')
    .or(`name.ilike.%${q}%,description.ilike.%${q}%`);
```

#### Budget Enrichment with Conservation Check

```typescript
const enriched = (data || []).map((b: any) => ({
    ...b,
    conservation: verifyBudget(b),
    // verifyBudget returns { valid: boolean, delta: number }
}));
```

---

## How si-cli Calls si-fleet-api

Currently, si-cli connects directly to Supabase rather than through
si-fleet-api. However, both services share the same database and
write compatible data:

### Data Flow

```
si scan . ──────► Supabase repos table ◄──── GET /api/repos
                                           ◄──── GET /api/repos/search

si audit . ─────► Supabase fleet_events ────► GET /api/fleet/events
                  (event_type="audit")

si check ───────► Supabase fleet_budgets ───► GET /api/fleet/budgets
  --from-supabase                          ◄──── GET /api/fleet/audit
```

### Future: si-cli → si-fleet-api Direct

The API provides richer query capabilities than direct Supabase access:

- **`/api/fleet/budgets`** adds `conservation` field automatically
- **`/api/fleet/audit`** returns structured violation report
- **`/api/capabilities/resolve`** does multi-capability matching

Adding an `--api-url` flag to si-cli would enable:

```bash
export SI_FLEET_API_URL="http://localhost:3001"
si check . --via-api    # routes through si-fleet-api
```

---

## Conservation Law Enforcement

The conservation module (`src/conservation.ts`) enforces the invariant:

```
gamma + eta ≈ total_budget  (within epsilon = 0.01)
```

### Single Budget Verification

```typescript
import { verifyBudget, BudgetRow } from './conservation.js';

const budget: BudgetRow = {
    agent_id: 'wasserstein-0',
    total_budget: 1.0,
    gamma: 0.35,
    eta: 0.65,
};

const { valid, delta } = verifyBudget(budget);
// valid: true, delta: 0.0
```

### Fleet-Wide Audit

```typescript
import { auditFleet } from './conservation.js';

const report = await auditFleet();
// {
//   totalAgents: 5,
//   violations: [],
//   fleetTotal: 5.0
// }
```

---

## Budget Transfer Protocol

The transfer endpoint atomically moves budget between agents while
maintaining the conservation invariant.

### Transfer Flow

```
1. Fetch both agents from fleet_budgets
2. Verify sufficient funds (from.total_budget >= amount)
3. Debit from: total_budget -= amount, gamma -= amount
4. Credit to: total_budget += amount, gamma += amount
5. If credit fails, rollback the debit
6. Log transfer_in/transfer_out events to fleet_events
```

### Implementation

```typescript
const result = await transferBudget('wasserstein-0', 'categorical-0', 0.25);
if (!result.success) {
    console.error(result.error);
}
```

### Rollback Safety

If the credit update fails, the debit is automatically rolled back:

```typescript
if (err2) {
    // Attempt rollback
    await supabase
        .from('fleet_budgets')
        .update({ total_budget: fromRow.total_budget, gamma: fromRow.gamma })
        .eq('agent_id', fromAgent);
    return { success: false, error: `Credit failed: ${err2.message}` };
}
```

---

## Fleet Monitoring Flow

### Real-Time Dashboard Updates

The ecosystem-dashboard fetches from si-fleet-api every 60 seconds:

```javascript
// From ecosystem-dashboard index.html
const budgets = await apiFetch('fleet_budgets', 'select=*');
const events = await apiFetch('fleet_events', 'select=*&order=created_at.desc&limit=20');
```

### Monitoring Pipeline

```
Agent spawns ──► fleet_events INSERT ──► si-fleet-api GET /fleet/events
                                              │
Budget change ► fleet_budgets UPDATE ► GET /fleet/budgets (with conservation)
                                              │
Conservation ► /fleet/audit ──────────► Dashboard conservation panel
                                              │
Health check ► /fleet/health ─────────► Summary: repos, caps, agents, violations
```

### Fleet Health Response

```json
{
  "ecosystem": {
    "total_repos": 12,
    "total_capabilities": 34,
    "active_agents": 5,
    "recent_events": 47
  },
  "conservation": {
    "fleet_total": 5.0,
    "violations": 0,
    "healthy": true
  },
  "timestamp": "2026-06-07T18:30:00.000Z"
}
```

---

## Capability Resolution

The `/api/capabilities/resolve` endpoint finds repos whose `provides`
cover a set of needed capabilities:

```typescript
// GET /api/capabilities/resolve?needs=conservation-checker,supabase-rest-client

const needs = needsParam.split(',').map(n => n.trim().toLowerCase());
const matched = (data || []).filter((cap: any) => {
    const provides = (cap.provides || []).map((p: string) => p.toLowerCase());
    return needs.every(need => provides.includes(need));
});
```

Returns repos grouped with their matching capabilities.

---

## Event Logging

```bash
curl -X POST http://localhost:3001/api/fleet/events \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "wasserstein-0",
    "event_type": "spawn",
    "payload": {"reason": "high-load", "priority": 3}
  }'
```

The API inserts into `fleet_events` and returns the created row.

---

## Ecosystem Health Endpoint

`GET /api/fleet/health` combines multiple queries in parallel:

```typescript
const [reposResult, capsResult, budgetsResult, eventsResult] = await Promise.all([
    supabase.from('repos').select('name', { count: 'exact', head: true }),
    supabase.from('capabilities').select('name', { count: 'exact', head: true }),
    supabase.from('fleet_budgets').select('agent_id'),
    supabase.from('fleet_events').select('event_type'),
]);
const audit = await auditFleet();
```

This gives a comprehensive snapshot: repo count, capability count,
active agents, recent events, fleet total budget, and conservation status.

---

## Dashboard Integration

The `ecosystem-dashboard` is a static HTML page that calls si-fleet-api
(or Supabase directly via REST) to populate its panels:

- **Language Pie** — reads `repos` table, groups by `language`
- **Repo Table** — reads `repos`, client-side search/sort
- **Capability Cloud** — reads `capabilities`, groups by `category`
- **Conservation Gauge** — reads `fleet_budgets`, renders γ/η bars
- **Event Timeline** — reads `fleet_events`, shows last 20 events

All data flows through the same Supabase tables that si-fleet-api serves.

---

## Environment Variables

| Variable               | Required | Default | Description              |
|------------------------|----------|---------|--------------------------|
| `PORT`                 | No       | `3001`  | HTTP listen port         |
| `SUPABASE_URL`         | Yes      | —       | Supabase project URL     |
| `SUPABASE_SERVICE_KEY` | Yes      | —       | Service role API key     |

---

## Running Locally

```bash
# Install dependencies
npm install

# Set environment
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-key"

# Start in development
npx tsx src/index.ts

# Or build and run
npm run build && node dist/index.js
```

---

## Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Environment Setup

Ensure Supabase credentials are set in the deployment environment.
The service does not manage its own database — it reads/writes the
existing Supabase instance.

---

## Error Handling

All endpoints return JSON errors:

```json
{ "error": "Repo not found" }
{ "error": "Missing required fields: from, to, amount" }
{ "error": "Insufficient budget: 0.3 < 0.5" }
```

| Status | Meaning                              |
|--------|--------------------------------------|
| 200    | Success                              |
| 201    | Created (events)                     |
| 400    | Bad request (missing params, bad transfer) |
| 404    | Not found (repo by name)             |
| 500    | Supabase query error                 |
