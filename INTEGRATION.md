# Integration Guide: si-fleet-api

## What This Service Provides

`si-fleet-api` is the TypeScript/Express REST API layer for the SuperInstance fleet. It exposes fleet data stored in Supabase through a curated set of endpoints, with built-in conservation-law verification and budget transfer semantics.

### API Endpoints

- **`GET /api/health`** — Service health check. Returns `{ status: "ok", service: "si-fleet-api", version: "1.0.0" }`.
- **`GET /api/repos`** — List all repos from Supabase `repos` table. Filter by `?language=`.
- **`GET /api/repos/search?q=`** — Search repos by name or description (ILIKE).
- **`GET /api/repos/:name`** — Get a single repo by name.
- **`GET /api/capabilities`** — List all capabilities from `capabilities` table. Filter by `?category=`.
- **`GET /api/capabilities/resolve?needs=`** — Find repos that provide all comma-separated needed capabilities.
- **`GET /api/fleet/budgets`** — List all fleet budgets with enriched `conservation` field (`verifyBudget`).
- **`POST /api/fleet/transfer`** — Atomically transfer budget between agents: `{ from, to, amount }`. Maintains `gamma + eta ≈ total` invariant.
- **`GET /api/fleet/audit`** — Run conservation audit across all fleet budgets. Returns violations and fleet total.
- **`POST /api/fleet/events`** — Insert a fleet event: `{ agent_id, event_type, payload }`.
- **`GET /api/fleet/health`** — Comprehensive fleet health: repo count, capability count, active agents, recent events, conservation status.
- **`GET /api/stats`** — Ecosystem stats: total repos, total tests, languages breakdown, total capabilities.

### Core Modules

- **`index.ts`** — Express app with all route handlers, `startServer()`, `app` export.
- **`conservation.ts`** — `verifyBudget()`, `transferBudget()`, `auditFleet()`, `BudgetRow` interface.
- **`supabase.ts`** — `getClient()`, `createClient()` — singleton Supabase JS client.

## How to Run

```bash
npm install
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm start
# or
PORT=3001 node dist/index.js
```

## Cross-Repo Connections

### With `conservation-law-rs`: Budget Conservation Verification

Every budget returned from `/api/fleet/budgets` includes a `conservation` field computed by `verifyBudget`:

```typescript
import { verifyBudget, transferBudget, auditFleet } from './conservation.js';

// GET /api/fleet/budgets enriches each row:
const enriched = budgets.map(b => ({
  ...b,
  conservation: verifyBudget(b),  // { valid: boolean, delta: number }
}));

// POST /api/fleet/transfer atomically updates while preserving invariant
const result = await transferBudget('agent-a', 'agent-b', 100);
```

### With `si-cli`: CLI-Driven API Consumption

The si-cli consumes this API for remote ranking and conservation checks:

```typescript
// si-cli fetches from /api/fleet/budgets when --from-supabase is used
// si-cli POSTs audits to /api/fleet/events

// Example: fetch fleet health
const health = await fetch('http://localhost:3001/api/fleet/health')
  .then(r => r.json());
console.log(`Fleet: ${health.ecosystem.total_repos} repos, ${health.ecosystem.active_agents} agents`);
```

### With `ecosystem-dashboard`: Frontend Data Source

The dashboard fetches all data from this API (or directly from Supabase):

```javascript
// dashboard calls these endpoints directly via Supabase REST
const repos = await apiFetch('repos', 'select=*');
const budgets = await apiFetch('fleet_budgets', 'select=*');
const events = await apiFetch('fleet_events', 'select=*&order=created_at.desc&limit=20');
const caps = await apiFetch('capabilities', 'select=*');
```

### With Supabase: Direct Table Access

The API is a thin layer over Supabase PostgreSQL tables:

```typescript
import { getClient } from './supabase.js';

const supabase = getClient();

// repos table: name, description, language, url
const { data: repos } = await supabase.from('repos').select('*');

// fleet_budgets table: agent_id, total_budget, gamma, eta
const { data: budgets } = await supabase.from('fleet_budgets').select('*');

// fleet_events table: agent_id, event_type, payload, created_at
const { data: events } = await supabase.from('fleet_events').select('*');

// capabilities table: name, repo_name, category, provides, requires
const { data: caps } = await supabase.from('capabilities').select('*');
```

## Design Patterns

### Pattern: Conservation-Aware Transfers

Always verify conservation before and after budget transfers:

```typescript
import { verifyBudget } from './conservation.js';

async function safeTransfer(from: string, to: string, amount: number) {
  const before = await getClient().from('fleet_budgets').select('*').eq('agent_id', from).single();
  const result = await transferBudget(from, to, amount);
  const after = await getClient().from('fleet_budgets').select('*').eq('agent_id', from).single();
  console.log('Conservation valid:', verifyBudget(after.data).valid);
}
```

### Pattern: Capability Resolution

Find the smallest set of repos that cover all needed capabilities:

```typescript
// GET /api/capabilities/resolve?needs=gpu-scheduling,swarm-gossip
const needed = ['gpu-scheduling', 'swarm-gossip'];
const response = await fetch(`/api/capabilities/resolve?needs=${needed.join(',')}`);
const { matched_repos } = await response.json();
```

### Pattern: Event-Driven Audit Logging

Log every significant fleet operation as an event:

```typescript
await fetch('/api/fleet/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent_id: 'my-agent',
    event_type: 'deploy',
    payload: { version: '1.2.3', checksum: 'abc123' }
  })
});
```

### With `fleet-warden-rs`: Cleanup Trigger Endpoint

Expose a REST endpoint to trigger disk cleanup and record the result:

```typescript
// Additional route in index.ts
app.post('/api/maintenance/cleanup', async (req, res) => {
  const { node_id, category } = req.body;
  // Trigger fleet-warden cleanup via message queue or SSH
  // Log event to Supabase
  const supabase = getClient();
  await supabase.from('fleet_events').insert([{
    agent_id: node_id,
    event_type: 'cleanup',
    payload: { category, triggered_by: 'si-fleet-api' }
  }]);
  res.json({ success: true, node_id, category });
});
```

### With `agent-homeostasis-rs`: Health Metrics Endpoint

Store and retrieve homeostatic regulation data:

```typescript
app.get('/api/agents/:id/health', async (req, res) => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('sensor_readings')
    .select('*')
    .eq('agent_id', req.params.id)
    .order('timestamp', { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
```

### With Supabase: Realtime Subscriptions

Enable live dashboard updates via Supabase realtime:

```typescript
import { getClient } from './supabase.js';

const supabase = getClient();
const channel = supabase
  .channel('fleet-events')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'fleet_events'
  }, (payload) => {
    console.log('New event:', payload.new);
    // Broadcast to WebSocket clients
  })
  .subscribe();
```

## Design Patterns

### Pattern: Request Validation Middleware

Validate all incoming requests before processing:

```typescript
function validateBudgetTransfer(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { from, to, amount } = req.body;
  if (!from || !to || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid transfer request' });
  }
  next();
}
app.post('/api/fleet/transfer', validateBudgetTransfer, async (req, res) => { ... });
```

### Pattern: Circuit Breaker for Supabase Calls

Wrap Supabase queries in a circuit breaker to handle outages:

```typescript
class CircuitBreaker {
  private failures = 0;
  private threshold = 5;
  private open = false;

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.open) throw new Error('Circuit breaker is open');
    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (e) {
      this.failures++;
      if (this.failures >= this.threshold) this.open = true;
      throw e;
    }
  }
}
```
