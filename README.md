# si-fleet-api

**Express + Supabase REST API for the SuperInstance fleet.** 11 routes covering repo management, capability resolution, fleet budget transfers, conservation auditing, and ecosystem health — with TypeScript types throughout.

---

## Quick Start

```bash
git clone https://github.com/SuperInstance/si-fleet-api.git
cd si-fleet-api
npm install

# Set required environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key"

# Start the server
npm start
# 🚀 si-fleet-api running on port 3001
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | — | Service role key for admin access |
| `PORT` | No | `3001` | Server port |

---

## API Reference

### Health Check

```
GET /api/health
```

```bash
curl http://localhost:3001/api/health
```

```json
{
  "status": "ok",
  "service": "si-fleet-api",
  "version": "1.0.0"
}
```

---

### Repos

#### List All Repos

```
GET /api/repos
```

```bash
# All repos
curl http://localhost:3001/api/repos

# Filter by language
curl "http://localhost:3001/api/repos?language=rust"
```

**Response:**

```json
[
  {
    "name": "si-cli",
    "description": "Unified CLI for the SuperInstance ecosystem",
    "language": "rust",
    "url": "https://github.com/SuperInstance/si-cli"
  },
  {
    "name": "si-fleet-api",
    "description": "Express REST API for fleet management",
    "language": "typescript",
    "url": "https://github.com/SuperInstance/si-fleet-api"
  }
]
```

#### Search Repos

```
GET /api/repos/search?q=<query>
```

```bash
curl "http://localhost:3001/api/repos/search?q=conservation"
```

Searches both `name` and `description` fields using case-insensitive ILIKE matching.

**Response:** Same array format as `GET /api/repos`.

#### Get Single Repo

```
GET /api/repos/:name
```

```bash
curl http://localhost:3001/api/repos/si-cli
```

```json
{
  "name": "si-cli",
  "description": "Unified CLI for the SuperInstance ecosystem",
  "language": "rust",
  "url": "https://github.com/SuperInstance/si-cli"
}
```

Returns `404` if not found.

---

### Capabilities

#### List Capabilities

```
GET /api/capabilities
```

```bash
# All capabilities
curl http://localhost:3001/api/capabilities

# Filter by category
curl "http://localhost:3001/api/capabilities?category=infrastructure"
```

#### Resolve Capabilities

```
GET /api/capabilities/resolve?needs=<comma-separated>
```

```bash
curl "http://localhost:3001/api/capabilities/resolve?needs=conservation,budget-enforcement"
```

Finds repos whose `provides` array covers all requested capabilities.

**Response:**

```json
{
  "needed": ["conservation", "budget-enforcement"],
  "matched_repos": [
    {
      "repo": "conservation-law",
      "matching_capabilities": [
        {
          "name": "conservation-law",
          "provides": ["conservation", "budget-enforcement", "entropy-tracking"],
          "version": "2.0.0"
        }
      ]
    }
  ]
}
```

---

### Fleet Budgets

#### List Budgets with Conservation Status

```
GET /api/fleet/budgets
```

```bash
curl http://localhost:3001/api/fleet/budgets
```

Each budget row includes a computed `conservation` field verifying `gamma + eta ≈ total_budget`.

**Response:**

```json
[
  {
    "agent_id": "agent-alpha",
    "total_budget": 225,
    "gamma": 143,
    "eta": 82,
    "conservation": {
      "valid": true,
      "delta": 0
    }
  },
  {
    "agent_id": "agent-beta",
    "total_budget": 100,
    "gamma": 60,
    "eta": 40,
    "conservation": {
      "valid": true,
      "delta": 0
    }
  }
]
```

#### Transfer Budget

```
POST /api/fleet/transfer
```

```bash
curl -X POST http://localhost:3001/api/fleet/transfer \
  -H "Content-Type: application/json" \
  -d '{"from": "agent-alpha", "to": "agent-beta", "amount": 25}'
```

Atomically transfers budget from one agent to another. The transfer:

1. Validates both agents exist in `fleet_budgets`
2. Checks sufficient funds on the sender
3. Debits `total_budget` and `gamma` from sender
4. Credits `total_budget` and `gamma` to receiver
5. Rolls back debit if credit fails
6. Logs `transfer_out` and `transfer_in` events to `fleet_events`

**Request body:**

```json
{
  "from": "agent-alpha",
  "to": "agent-beta",
  "amount": 25
}
```

**Response:**

```json
{
  "success": true,
  "message": "Transferred 25 from agent-alpha to agent-beta"
}
```

**Error cases:**

```json
{ "error": "Missing required fields: from, to, amount" }
{ "error": "Amount must be positive" }
{ "error": "Cannot transfer to self" }
{ "error": "One or both agents not found in fleet_budgets" }
{ "error": "Insufficient budget: 100 < 150" }
{ "error": "Debit failed: ..." }
{ "error": "Credit failed: ..." }
```

#### Fleet Audit

```
GET /api/fleet/audit
```

```bash
curl http://localhost:3001/api/fleet/audit
```

Audits all fleet budgets for conservation violations. Tolerance: `EPSILON = 0.01`.

**Response:**

```json
{
  "totalAgents": 5,
  "violations": [
    {
      "agent_id": "agent-gamma",
      "total": 100,
      "gamma": 50,
      "eta": 30,
      "delta": 20
    }
  ],
  "fleetTotal": 850
}
```

A clean audit returns an empty `violations` array.

---

### Fleet Events

#### Create Event

```
POST /api/fleet/events
```

```bash
curl -X POST http://localhost:3001/api/fleet/events \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-alpha",
    "event_type": "task_complete",
    "payload": {"task": "summarize", "tokens_used": 1500}
  }'
```

**Request body:**

```json
{
  "agent_id": "agent-alpha",
  "event_type": "task_complete",
  "payload": { "task": "summarize", "tokens_used": 1500 }
}
```

**Response (201 Created):**

```json
{
  "id": 42,
  "agent_id": "agent-alpha",
  "event_type": "task_complete",
  "payload": { "task": "summarize", "tokens_used": 1500 },
  "created_at": "2026-06-07T19:00:00Z"
}
```

---

### Fleet Health

```
GET /api/fleet/health
```

```bash
curl http://localhost:3001/api/fleet/health
```

Comprehensive fleet health check combining data from `repos`, `capabilities`, `fleet_budgets`, and `fleet_events`.

**Response:**

```json
{
  "ecosystem": {
    "total_repos": 12,
    "total_capabilities": 34,
    "active_agents": 8,
    "recent_events": 156
  },
  "conservation": {
    "fleet_total": 2500,
    "violations": 0,
    "healthy": true
  },
  "timestamp": "2026-06-07T19:00:00.000Z"
}
```

---

### Statistics

```
GET /api/stats
```

```bash
curl http://localhost:3001/api/stats
```

**Response:**

```json
{
  "total_repos": 12,
  "total_tests": 847,
  "by_language": {
    "rust": 6,
    "typescript": 2,
    "python": 2,
    "go": 1,
    "c": 1
  },
  "total_capabilities": 34,
  "languages": ["rust", "typescript", "python", "go", "c"]
}
```

---

## TypeScript Types

### BudgetRow

```typescript
interface BudgetRow {
  agent_id: string;
  total_budget: number;
  gamma: number;
  eta: number;
}
```

### Conservation Verification

```typescript
function verifyBudget(budget: BudgetRow): { valid: boolean; delta: number };
```

Checks `|gamma + eta - total_budget| < EPSILON` where `EPSILON = 0.01`.

### Budget Transfer

```typescript
function transferBudget(
  fromAgent: string,
  toAgent: string,
  amount: number
): Promise<{ success: boolean; error?: string }>;
```

### Fleet Audit

```typescript
function auditFleet(): Promise<{
  totalAgents: number;
  violations: Array<{
    agent_id: string;
    total: number;
    gamma: number;
    eta: number;
    delta: number;
  }>;
  fleetTotal: number;
}>;
```

---

## Architecture

```
src/
├── index.ts         # Express app, 11 route handlers, server startup
├── supabase.ts      # Supabase client singleton
└── conservation.ts  # Budget verification, transfer, audit logic
```

**Route summary:**

| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/repos` | List repos (optional `?language=` filter) |
| GET | `/api/repos/search` | Search repos (`?q=`) |
| GET | `/api/repos/:name` | Get single repo |
| GET | `/api/capabilities` | List capabilities (optional `?category=`) |
| GET | `/api/capabilities/resolve` | Resolve needs to repos (`?needs=`) |
| GET | `/api/fleet/budgets` | Budgets with conservation status |
| POST | `/api/fleet/transfer` | Transfer budget between agents |
| GET | `/api/fleet/audit` | Full fleet conservation audit |
| POST | `/api/fleet/events` | Create fleet event |
| GET | `/api/fleet/health` | Comprehensive health report |
| GET | `/api/stats` | Ecosystem statistics |

---

## Conservation Law

The API enforces the SuperInstance conservation law:

```
γ + η = C

gamma + eta = total_budget
```

- **`verifyBudget()`** checks this with tolerance 0.01
- **`transferBudget()`** maintains the invariant by adjusting both `gamma` and `total_budget` in lockstep
- **`auditFleet()`** scans every agent for violations

---

## Working Examples

### Full Fleet Health Check Script

```bash
#!/bin/bash
API="http://localhost:3001"

echo "=== Health ==="
curl -s "$API/api/health" | jq .

echo ""
echo "=== Fleet Health ==="
curl -s "$API/api/fleet/health" | jq .

echo ""
echo "=== Conservation Audit ==="
curl -s "$API/api/fleet/audit" | jq .

echo ""
echo "=== Stats ==="
curl -s "$API/api/stats" | jq .
```

### Transfer Budget Between Agents

```bash
#!/bin/bash
API="http://localhost:3001"

# Before transfer
echo "Before:"
curl -s "$API/api/fleet/budgets" | jq '.[] | {agent_id, gamma, eta, total_budget}'

# Transfer 50 units
curl -s -X POST "$API/api/fleet/transfer" \
  -H "Content-Type: application/json" \
  -d '{"from":"agent-alpha","to":"agent-beta","amount":50}' | jq .

# After transfer
echo "After:"
curl -s "$API/api/fleet/budgets" | jq '.[] | {agent_id, gamma, eta, total_budget}'
```

### Resolve Capabilities for a Task

```bash
#!/bin/bash
# Find repos that provide all needed capabilities
API="http://localhost:3001"

curl -s "$API/api/capabilities/resolve?needs=conservation,budget-enforcement" | jq .
```

### Log a Task Completion Event

```bash
#!/bin/bash
API="http://localhost:3001"

curl -s -X POST "$API/api/fleet/events" \
  -H "Content-Type: application/json" \
  -d "{
    \"agent_id\": \"agent-alpha\",
    \"event_type\": \"task_complete\",
    \"payload\": {
      \"task\": \"email-summary\",
      \"tokens_used\": 3400,
      \"quality_score\": 0.87
    }
  }" | jq .
```

### Docker Deployment

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src/ ./src/
COPY tsconfig.json ./
EXPOSE 3001
CMD ["node", "--import", "tsx", "src/index.ts"]
```

```bash
docker build -t si-fleet-api .
docker run -p 3001:3001 \
  -e SUPABASE_URL="https://your-project.supabase.co" \
  -e SUPABASE_SERVICE_KEY="your-key" \
  si-fleet-api
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{ "error": "Description of what went wrong" }
```

| HTTP Status | When |
|-------------|------|
| 400 | Missing required parameters, invalid input |
| 404 | Repo not found |
| 500 | Supabase query failure, unexpected errors |

---

## Related Repos

| Repo | Language | Description |
|------|----------|-------------|
| [`si-cli`](https://github.com/SuperInstance/si-cli) | Rust | CLI that syncs to this API's Supabase backend |
| [`conservation-law`](https://github.com/SuperInstance/conservation-law) | Rust | Core conservation law crate |
| [`si-conservation-python`](https://github.com/SuperInstance/si-conservation-python) | Rust/Python | PyO3 Python bindings |
| [`ecosystem-dashboard`](https://github.com/SuperInstance/ecosystem-dashboard) | HTML/JS | Dashboard that queries this API |

---

## License

MIT
