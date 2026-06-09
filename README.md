# si-fleet-api

Edge-deployed fleet coordination API for the SuperInstance ecosystem.

## Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/status` | GET | Fleet status (repos, crates, docs, conservation law) |
| `/crates` | GET | Published crate registry (filter by `?category=` or `?published=true`) |
| `/crates/:name` | GET | Single crate info |
| `/categories` | GET | Crate categories with counts |
| `/ternary/compute?values=1,0,-1` | GET | Balanced ternary computation with conservation check |
| `/ternary/from-float?values=0.5,-0.2&deadband=0.3` | GET | Float → ternary with configurable deadband |
| `/conservation/check?values=1,0,-1,1,-1` | GET | Verify fleet conservation law (|Σ| ≤ 2) |
| `/a2a/discover` | GET | A2A protocol endpoint discovery |
| `/health` | GET | Health check |

## Conservation Law

The fleet obeys: **|Σ ternary domains| ≤ 2** across 15 ternary domains.
This worker verifies conservation at the edge.

## Deploy

```bash
wrangler login
wrangler deploy
```

## Local Dev

```bash
wrangler dev
# Test:
curl http://localhost:8787/status
curl http://localhost:8787/ternary/compute?values=1,0,-1,1,-1
curl http://localhost:8787/conservation/check?values=1,0,-1
```

## Architecture

```
Browser/App → Cloudflare Edge (this worker) → Fleet
                    ↓
              Ternary Compute
              Conservation Check
              Crate Registry (static)
              A2A Discovery
```

Part of the [SuperInstance](https://github.com/SuperInstance) ecosystem.
