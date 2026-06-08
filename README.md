# si-fleet-api

> Fleet registry API — Supabase-backed cloud backbone for the [SuperInstance](https://github.com/SuperInstance) ecosystem

`si-fleet-api` is an Express-based REST API that serves as the central registry for the SuperInstance fleet. It provides real-time access to repos, capabilities, agent budgets, and fleet events — all backed by our live Supabase project.

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Repos](#repos)
  - [Capabilities](#capabilities)
  - [Fleet Budgets](#fleet-budgets)
  - [Fleet Events](#fleet-events)
  - [Fleet Health](#fleet-health)
  - [Stats](#stats)
- [Conservation Law](#conservation-law)
- [How si-cli Connects](#how-si-cli-connects)
- [Deployment](#deployment)
  - [Docker](#docker)
  - [Railway / Fly.io / Render](#railway--flyio--render)
  - [Manual](#manual)
- [Development](#development)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Supabase Schema](#supabase-schema)
- [Contributing](#contributing)
- [License](#license)

---

## Architecture

```
┌─────────────┐     HTTP/JSON      ┌────────────────┐     SQL      ┌───────────┐
│   si-cli     │ ───────────────▶  │  si-fleet-api   │ ──────────▶ │ Supabase  │
│  (terminal)  │ ◀───────────────  │  (Express/TS)   │ ◀────────── │ (Postgres)│
└─────────────┘                    └────────────────┘              └───────────┘
       │                                  │
       │                                  ├── /api/repos
       │                                  ├── /api/capabilities
       │                                  ├── /api/fleet/budgets
       │                                  ├── /api/fleet/transfer
       │                                  ├── /api/fleet/audit
       │                                  ├── /api/fleet/events
       │                                  └── /api/stats
       │
   ┌───┴────┐
   │ Agents │  Each agent has a budget row in fleet_budgets
   └────────┘  Conservation law: gamma + eta ≈ total_budget
```

The API is stateless — all state lives in Supabase (PostgreSQL). This means you can run multiple instances behind a load balancer with no session affinity requirements.

---

## Quick Start

```bash
# Clone
git clone https://github.com/SuperInstance/si-fleet-api.git
cd si-fleet-api

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Supabase service role key

# Development mode (hot reload)
npm run dev

# Or build and run
npm run build
npm start
```

The server starts on port 3001 by default.

---

## Configuration

Environment variables (set in `.env` or your hosting platform):

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | Yes | — | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | — | Service role key (bypasses RLS) |
| `PORT` | No | `3001` | HTTP port |

> ⚠️ **Never commit your `.env` file.** The `.gitignore` already excludes it.

---

## API Reference

### Health

#### `GET /api/health`

Returns service health.

```bash
curl http://localhost:3001/api/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "si-fleet-api",
  "version": "1.0.0"
}
```

---

### Repos

#### `GET /api/repos`

List all registered repos. Optionally filter by language.

```bash
# All repos
curl http://localhost:3001/api/repos

# Only Rust repos
curl http://localhost:3001/api/repos?language=rust
```

**Response:**
```json
[
  {
    "name": "si-core",
    "description": "Core runtime for SuperInstance agents",
    "language": "rust",
    "url": "https://github.com/SuperInstance/si-core",
    "test_count": 142,
    "capabilities": ["runtime", "scheduling", "memory"]
  },
  {
    "name": "si-physics",
    "description": "Physics engine for simulation instances",
    "language": "rust",
    "url": "https://github.com/SuperInstance/si-physics",
    "test_count": 89,
    "capabilities": ["physics", "collision", "spatial"]
  }
]
```

#### `GET /api/repos/:name`

Get a single repo by name.

```bash
curl http://localhost:3001/api/repos/si-core
```

**Response:**
```json
{
  "name": "si-core",
  "description": "Core runtime for SuperInstance agents",
  "language": "rust",
  "url": "https://github.com/SuperInstance/si-core",
  "test_count": 142,
  "capabilities": ["runtime", "scheduling", "memory"]
}
```

**Error (404):**
```json
{
  "error": "Repo not found"
}
```

#### `GET /api/repos/search?q=keyword`

Search repos by name or description.

```bash
curl http://localhost:3001/api/repos/search?q=physics
```

**Response:**
```json
[
  {
    "name": "si-physics",
    "description": "Physics engine for simulation instances",
    "language": "rust",
    "url": "https://github.com/SuperInstance/si-physics",
    "test_count": 89,
    "capabilities": ["physics", "collision", "spatial"]
  }
]
```

---

### Capabilities

#### `GET /api/capabilities`

List all capabilities. Optionally filter by category.

```bash
# All capabilities
curl http://localhost:3001/api/capabilities

# Filter by category
curl http://localhost:3001/api/capabilities?category=computation
```

**Response:**
```json
[
  {
    "repo_name": "si-core",
    "name": "runtime",
    "version": "1.0.0",
    "provides": ["scheduling", "memory", "concurrency"],
    "requires": [],
    "category": "infrastructure"
  },
  {
    "repo_name": "si-math",
    "name": "mathematics",
    "version": "2.1.0",
    "provides": ["math", "linear-algebra", "calculus"],
    "requires": ["runtime"],
    "category": "computation"
  }
]
```

#### `GET /api/capabilities/resolve?needs=math,physics`

Find repos that provide all requested capabilities.

```bash
curl http://localhost:3001/api/capabilities/resolve?needs=math,physics
```

**Response:**
```json
{
  "needed": ["math", "physics"],
  "matched_repos": [
    {
      "repo": "si-physics",
      "matching_capabilities": [
        {
          "repo_name": "si-physics",
          "name": "physics-engine",
          "version": "1.3.0",
          "provides": ["math", "physics", "collision"],
          "requires": ["runtime"],
          "category": "simulation"
        }
      ]
    }
  ]
}
```

> The resolve endpoint checks each capability's `provides` array for ALL needed capabilities. A repo matches only if it has a capability that provides everything you need.

---

### Fleet Budgets

The fleet budget system enforces a **conservation law**: for every agent, `gamma + eta ≈ total_budget`. This invariant is maintained across all transfers.

#### `GET /api/fleet/budgets`

List all agent budgets with conservation verification.

```bash
curl http://localhost:3001/api/fleet/budgets
```

**Response:**
```json
[
  {
    "agent_id": "agent-alpha",
    "total_budget": 1000,
    "gamma": 600,
    "eta": 400,
    "conservation": {
      "valid": true,
      "delta": 0
    }
  },
  {
    "agent_id": "agent-beta",
    "total_budget": 500,
    "gamma": 300,
    "eta": 200,
    "conservation": {
      "valid": true,
      "delta": 0
    }
  }
]
```

#### `POST /api/fleet/transfer`

Transfer budget between agents. The conservation law is maintained by adjusting `gamma` proportionally.

```bash
curl -X POST http://localhost:3001/api/fleet/transfer \
  -H "Content-Type: application/json" \
  -d '{"from": "agent-alpha", "to": "agent-beta", "amount": 100}'
```

**Success Response:**
```json
{
  "success": true,
  "message": "Transferred 100 from agent-alpha to agent-beta"
}
```

**Error Responses:**
```json
// Insufficient budget
{ "error": "Insufficient budget: 50 < 100" }

// Self-transfer
{ "error": "Cannot transfer to self" }

// Agent not found
{ "error": "One or both agents not found in fleet_budgets" }
```

The transfer:
1. Validates both agents exist
2. Checks sufficient funds
3. Debits `from` agent (total_budget and gamma decrease by amount)
4. Credits `to` agent (total_budget and gamma increase by amount)
5. Logs `transfer_out` and `transfer_in` events
6. Rolls back debit if credit fails

#### `GET /api/fleet/audit`

Verify conservation law across the entire fleet.

```bash
curl http://localhost:3001/api/fleet/audit
```

**Response:**
```json
{
  "totalAgents": 3,
  "violations": [],
  "fleetTotal": 2500
}
```

When violations exist:
```json
{
  "totalAgents": 3,
  "violations": [
    {
      "agent_id": "agent-gamma",
      "total": 500,
      "gamma": 300,
      "eta": 150,
      "delta": 50
    }
  ],
  "fleetTotal": 2500
}
```

---

### Fleet Events

#### `POST /api/fleet/events`

Log a fleet event.

```bash
curl -X POST http://localhost:3001/api/fleet/events \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-alpha",
    "event_type": "deploy",
    "payload": {"version": "2.0.0", "target": "production"}
  }'
```

**Response (201):**
```json
{
  "agent_id": "agent-alpha",
  "event_type": "deploy",
  "payload": {
    "version": "2.0.0",
    "target": "production"
  },
  "id": 42,
  "created_at": "2026-06-07T22:15:00Z"
}
```

Event types you might use:
- `deploy` — agent deployed to environment
- `scale` — agent scaled up/down
- `transfer_out` / `transfer_in` — budget transfer (auto-logged)
- `health_check` — periodic health ping
- `error` — error report
- `config_change` — configuration updated

---

### Fleet Health

#### `GET /api/fleet/health`

Aggregate health report combining ecosystem stats and conservation status.

```bash
curl http://localhost:3001/api/fleet/health
```

**Response:**
```json
{
  "ecosystem": {
    "total_repos": 8,
    "total_capabilities": 15,
    "active_agents": 3,
    "recent_events": 47
  },
  "conservation": {
    "fleet_total": 2500,
    "violations": 0,
    "healthy": true
  },
  "timestamp": "2026-06-07T22:20:00Z"
}
```

---

### Stats

#### `GET /api/stats`

Ecosystem statistics: repo counts by language, total tests, capability counts.

```bash
curl http://localhost:3001/api/stats
```

**Response:**
```json
{
  "total_repos": 8,
  "total_tests": 634,
  "by_language": {
    "rust": 5,
    "typescript": 2,
    "python": 1
  },
  "total_capabilities": 15,
  "languages": ["rust", "typescript", "python"]
}
```

---

## Conservation Law

The SuperInstance fleet operates under a budget conservation law:

```
γ (gamma) + η (eta) ≈ Total Budget
```

Where:
- **γ (gamma)** — operational compute budget (active allocation)
- **η (eta)** — latent/reserve budget (standby allocation)
- **Total** — the agent's full budget allocation

This invariant is enforced at the application layer:

1. **On read** — every budget response includes a `conservation` check
2. **On transfer** — the `transferBudget` function adjusts gamma proportionally
3. **On audit** — `auditFleet()` scans all agents for violations

The tolerance is ε = 0.01 to account for floating-point arithmetic.

### Transfer Mechanics

When transferring amount `Δ` from agent A to agent B:

```
A.total -= Δ,  A.gamma -= Δ   (debit)
B.total += Δ,  B.gamma += Δ   (credit)
```

Since `eta = total - gamma` (conceptually), this maintains the invariant:
- A: `(γ-Δ) + (η)` = `(γ-Δ) + (η)` ... wait, that breaks.

Actually, our transfer adjusts total AND gamma by the same amount, so:
- A: `(γ-Δ) + η_A` where `η_A = total_A - γ_A` originally
- After: `(γ_A - Δ) + η_A` = `γ_A - Δ + η_A`
- New total: `total_A - Δ`
- Check: `(γ_A - Δ) + η_A` vs `(total_A - Δ)`
- Since `γ_A + η_A ≈ total_A`, we get `(total_A - Δ)` on both sides ✓

The conservation law is preserved.

---

## How si-cli Connects

The `si-cli` tool interacts with this API to:

1. **Register repos** — `si register <repo>` adds the repo to the fleet
2. **Query capabilities** — `si resolve math physics` finds matching repos
3. **Check budgets** — `si budget` shows your agent's allocation
4. **Transfer budget** — `si transfer <to> <amount>` moves compute allocation
5. **Health check** — `si fleet health` shows ecosystem status

Example si-cli config (`~/.si/config.toml`):

```toml
[fleet]
api_url = "https://si-fleet-api.fly.dev"
agent_id = "agent-alpha"

[auth]
service_key = "your-service-role-key"
```

si-cli calls:
```
GET  {api_url}/api/fleet/budgets          → si budget
POST {api_url}/api/fleet/transfer          → si transfer
GET  {api_url}/api/repos                   → si repos
GET  {api_url}/api/capabilities/resolve     → si resolve
GET  {api_url}/api/fleet/health            → si fleet health
```

---

## Deployment

### Docker

```bash
# Build
docker build -t si-fleet-api .

# Run
docker run -p 3001:3001 \
  -e SUPABASE_URL=https://igogykhksgkaxcwzudwi.supabase.co \
  -e SUPABASE_SERVICE_KEY=your-key \
  si-fleet-api
```

### Railway / Fly.io / Render

1. Connect your GitHub repo
2. Set environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Expose port 3001

### Manual

```bash
npm install
npm run build
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node dist/index.js
```

For production, use PM2 or systemd:

```bash
# PM2
npm install -g pm2
pm2 start dist/index.js --name si-fleet-api

# systemd
cat > /etc/systemd/system/si-fleet-api.service <<EOF
[Unit]
Description=SI Fleet API
After=network.target

[Service]
Type=simple
User=si
WorkingDirectory=/opt/si-fleet-api
ExecStart=/usr/bin/node dist/index.js
Environment=SUPABASE_URL=https://igogykhksgkaxcwzudwi.supabase.co
Environment=SUPABASE_SERVICE_KEY=your-key
Restart=always

[Install]
WantedBy=multi-user.target
EOF
```

---

## Development

```bash
# Install dependencies
npm install

# Run in dev mode with hot reload
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Adding a New Route

1. Create a new route handler in `src/index.ts`
2. Add any Supabase queries using `getClient()`
3. Add tests in `tests/`
4. Update this README with the new endpoint

### Code Style

- TypeScript strict mode
- Async/await for all Supabase calls
- Proper error handling with HTTP status codes
- JSON request/response bodies

---

## Testing

The test suite uses [Vitest](https://vitest.dev/) and [Supertest](https://github.com/ladjs/supertest).

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

Tests are split into:
- `tests/conservation.test.ts` — Pure logic tests for the conservation law
- `tests/api.test.ts` — HTTP integration tests for all API routes

> **Note:** API tests hit the live Supabase instance. Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in your environment before running tests.

---

## Project Structure

```
si-fleet-api/
├── src/
│   ├── index.ts           # Express server & routes
│   ├── supabase.ts        # Supabase client wrapper
│   └── conservation.ts    # Budget conservation law enforcement
├── tests/
│   ├── conservation.test.ts  # Conservation unit tests
│   └── api.test.ts           # API integration tests
├── dist/                  # Compiled JavaScript (gitignored)
├── .env.example           # Environment template
├── .gitignore
├── Dockerfile             # Production Docker image
├── package.json
├── tsconfig.json
├── vitest.config.ts       # Test configuration
└── README.md              # This file
```

---

## Supabase Schema

The API expects these tables in your Supabase project:

### `repos`
| Column | Type | Description |
|---|---|---|
| `name` | text (PK) | Repository name |
| `description` | text | Human-readable description |
| `language` | text | Primary programming language |
| `url` | text | Repository URL |
| `test_count` | integer | Number of tests |
| `capabilities` | text[] | List of capability names |

### `capabilities`
| Column | Type | Description |
|---|---|---|
| `repo_name` | text | Foreign key to repos.name |
| `name` | text | Capability name |
| `version` | text | Semantic version |
| `provides` | text[] | What this capability provides |
| `requires` | text[] | Dependencies on other capabilities |
| `category` | text | Capability category |

### `fleet_budgets`
| Column | Type | Description |
|---|---|---|
| `agent_id` | text (PK) | Unique agent identifier |
| `total_budget` | numeric | Total budget allocation |
| `gamma` | numeric | Operational (active) budget |
| `eta` | numeric | Reserve (latent) budget |

**CHECK constraint:** `gamma + eta ≈ total_budget`

### `fleet_events`
| Column | Type | Description |
|---|---|---|
| `id` | bigint (PK) | Auto-incrementing ID |
| `agent_id` | text | Agent that emitted the event |
| `event_type` | text | Type of event |
| `payload` | jsonb | Arbitrary event data |
| `created_at` | timestamptz | Event timestamp |

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push: `git push origin feat/my-feature`
5. Open a Pull Request

Please add tests for any new functionality.

---

## License

MIT © SuperInstance
