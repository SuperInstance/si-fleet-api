/**
 * SuperInstance Fleet API — Cloudflare Worker
 *
 * Edge-deployed fleet coordination API.
 * - Crate registry with conservation law metadata
 * - Fleet status endpoints
 * - Ternary computation utilities
 * - A2A endpoint discovery
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface CrateInfo {
  name: string;
  version: string;
  description: string;
  tests: number;
  category: string;
  conservation?: { law: string; invariant: number };
  published: boolean;
}

interface FleetStatus {
  total_repos: number;
  published_crates: number;
  published_pypi: number;
  tutorials: number;
  fleet_docs: number;
  tagged_repos: number;
  conservation_law: string;
  uptime: string;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const CRATES: CrateInfo[] = [
  { name: "spreadsheet-engine", version: "0.1.0", description: "Living AI spreadsheet with 7 cell types", tests: 67, category: "core", conservation: { law: "γ + η = C", invariant: 1.0 }, published: true },
  { name: "groovemesh-plr", version: "0.1.0", description: "PLR group algebra — you can never play a wrong note", tests: 45, category: "music", published: true },
  { name: "tropical-synth", version: "0.1.0", description: "Tropical semiring synthesizer", tests: 38, category: "music", published: true },
  { name: "noether-guard", version: "0.1.0", description: "Noether's theorem runtime invariant enforcement", tests: 42, category: "conservation", conservation: { law: "dL/dq - d/dt(dL/dq̇) = 0", invariant: 0 }, published: true },
  { name: "lotka-beats", version: "0.1.0", description: "Lotka-Volterra competitive dynamics for beat generation", tests: 35, category: "music", published: true },
  { name: "fleet-ensemble", version: "0.1.0", description: "Agent ensemble with conservation budgets", tests: 28, category: "agents", conservation: { law: "Σ energy = const", invariant: 1.0 }, published: true },
  { name: "conservation-law", version: "0.1.0", description: "Universal conservation law framework", tests: 89, category: "conservation", published: true },
  { name: "constraint-dynamics", version: "0.1.0", description: "Constraint satisfaction via Hamiltonian dynamics", tests: 56, category: "constraints", published: true },
  { name: "dial-ecology", version: "0.1.0", description: "Lotka-Volterra dynamics for tradition competition", tests: 68, category: "ecology", published: true },
  { name: "spectral-fleet", version: "0.1.0", description: "Spectral graph theory for fleet coordination", tests: 52, category: "agents", published: true },
  { name: "fleet-build", version: "0.1.0", description: "Fleet-wide build orchestration", tests: 34, category: "infra", published: true },
  { name: "session-miner", version: "0.1.0", description: "Mining patterns from agent sessions", tests: 41, category: "infra", published: true },
  { name: "graph-search-rs", version: "0.1.0", description: "Zero-dep graph search (BFS, DFS, Dijkstra, A*)", tests: 22, category: "data-structures", published: true },
  { name: "markov-chain-rs", version: "0.1.0", description: "Markov chains + HMM with Viterbi", tests: 28, category: "data-structures", published: true },
  { name: "fenwick-tree-rs", version: "0.1.0", description: "Fenwick/BIT tree with 2D extension", tests: 18, category: "data-structures", published: true },
  { name: "decision-tree-rs", version: "0.1.0", description: "Decision trees + Random Forest with pruning", tests: 35, category: "ml", published: true },
];

const FLEET_STATUS: FleetStatus = {
  total_repos: 500,
  published_crates: 42,
  published_pypi: 4,
  tutorials: 55,
  fleet_docs: 30,
  tagged_repos: 190,
  conservation_law: "|Σ ternary domains| ≤ 2 across 15 domains",
  uptime: "since 2026-05-25",
};

// ─── Ternary Computation ─────────────────────────────────────────────────────

type Ternary = -1 | 0 | 1;

function ternaryAdd(a: Ternary, b: Ternary): Ternary {
  const sum = a + b;
  if (sum > 1) return -1;
  if (sum < -1) return 1;
  return sum as Ternary;
}

function ternaryMul(a: Ternary, b: Ternary): Ternary {
  return (a * b) as Ternary;
}

function ternaryFromFloat(value: number, deadband: number = 0.3): Ternary {
  if (value > deadband) return 1;
  if (value < -deadband) return -1;
  return 0;
}

function conservationCheck(values: Ternary[]): { sum: number; conserved: boolean } {
  const sum = values.reduce((a, b) => a + b, 0);
  return { sum, conserved: Math.abs(sum) <= 2 };
}

// ─── Router ──────────────────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: corsHeaders(),
  });
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  // ── Routes ──

  // Fleet status
  if (path === "/" || path === "/status") {
    return json({
      ...FLEET_STATUS,
      crates_endpoint: "/crates",
      ternary_endpoint: "/ternary/compute",
      a2a_endpoint: "/a2a/discover",
      timestamp: new Date().toISOString(),
    });
  }

  // Crate registry
  if (path === "/crates") {
    const category = url.searchParams.get("category");
    const published = url.searchParams.get("published");
    let results = CRATES;
    if (category) results = results.filter(c => c.category === category);
    if (published === "true") results = results.filter(c => c.published);
    return json({ total: results.length, crates: results });
  }

  // Single crate
  const crateMatch = path.match(/^\/crates\/(.+)$/);
  if (crateMatch) {
    const crate = CRATES.find(c => c.name === crateMatch[1]);
    if (!crate) return json({ error: "Crate not found" }, 404);
    return json(crate);
  }

  // Categories
  if (path === "/categories") {
    const cats = [...new Set(CRATES.map(c => c.category))];
    return json({ categories: cats.map(cat => ({
      name: cat,
      count: CRATES.filter(c => c.category === cat).length,
      crates: CRATES.filter(c => c.category === cat).map(c => c.name),
    }))});
  }

  // Ternary computation
  if (path === "/ternary/compute") {
    const values = url.searchParams.get("values");
    if (!values) {
      return json({
        usage: "/ternary/compute?values=1,0,-1,1,-1",
        deadband: "/ternary/compute?floats=0.5,-0.2,0.8&deadband=0.3",
      });
    }
    const ternaryValues = values.split(",").map(Number).map(v => ternaryFromFloat(v)) as Ternary[];
    const check = conservationCheck(ternaryValues);
    return json({
      input: values,
      ternary: ternaryValues,
      ...check,
      algebra: { is_balanced_ternary: true, ring: "Z/3Z" },
    });
  }

  // Ternary from floats with deadband
  if (path === "/ternary/from-float") {
    const floats = url.searchParams.get("values");
    const deadband = parseFloat(url.searchParams.get("deadband") || "0.3");
    if (!floats) return json({ error: "Provide values parameter" }, 400);
    const vals = floats.split(",").map(Number);
    const ternaryValues = vals.map(v => ternaryFromFloat(v, deadband)) as Ternary[];
    const check = conservationCheck(ternaryValues);
    return json({ floats: vals, deadband, ternary: ternaryValues, ...check });
  }

  // Conservation law check
  if (path === "/conservation/check") {
    const values = url.searchParams.get("values");
    if (!values) return json({ error: "Provide comma-separated ternary values (-1, 0, 1)" }, 400);
    const ternaryValues = values.split(",").map(Number) as Ternary[];
    const check = conservationCheck(ternaryValues);
    return json({
      values: ternaryValues,
      sum: check.sum,
      conserved: check.conserved,
      law: "|Σ| ≤ 2",
      explanation: check.conserved
        ? "Fleet conservation law satisfied — total ternary energy within bounds"
        : "CONSERVATION VIOLATION — total ternary energy exceeds bounds",
    });
  }

  // A2A endpoint discovery
  if (path === "/a2a/discover") {
    return json({
      protocol: "A2A/1.0",
      org: "SuperInstance",
      endpoints: [
        { name: "fleet-status", method: "GET", path: "/status", description: "Fleet health and stats" },
        { name: "crate-registry", method: "GET", path: "/crates", description: "Published crate catalog" },
        { name: "ternary-compute", method: "GET", path: "/ternary/compute", description: "Balanced ternary arithmetic" },
        { name: "conservation-check", method: "GET", path: "/conservation/check", description: "Verify conservation law" },
        { name: "a2a-discover", method: "GET", path: "/a2a/discover", description: "This endpoint — A2A capability discovery" },
      ],
      capabilities: ["ternary-computation", "conservation-law", "crate-registry", "fleet-status"],
    });
  }

  // Health
  if (path === "/health") {
    return json({ status: "ok", version: "0.1.0", timestamp: new Date().toISOString() });
  }

  return json({ error: "Not found", available: ["/status", "/crates", "/ternary/compute", "/conservation/check", "/a2a/discover", "/health"] }, 404);
}

export default {
  fetch: handleRequest,
};
