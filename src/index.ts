import express from 'express';
import cors from 'cors';
import { getClient } from './supabase.js';
import { verifyBudget, transferBudget, auditFleet } from './conservation.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

// ─── Health ────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'si-fleet-api', version: '1.0.0' });
});

// ─── Repos ─────────────────────────────────────────────────────────
app.get('/api/repos', async (req, res) => {
  const supabase = getClient();
  let query = supabase.from('repos').select('*');

  if (req.query.language) {
    query = query.eq('language', req.query.language);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/repos/search', async (req, res) => {
  const q = req.query.q as string;
  if (!q) return res.status(400).json({ error: 'Missing ?q= query parameter' });

  const supabase = getClient();
  const { data, error } = await supabase
    .from('repos')
    .select('*')
    .or(`name.ilike.%${q}%,description.ilike.%${q}%`);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/repos/:name', async (req, res) => {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('repos')
    .select('*')
    .eq('name', req.params.name)
    .single();

  if (error) return res.status(404).json({ error: 'Repo not found' });
  res.json(data);
});

// ─── Capabilities ──────────────────────────────────────────────────
app.get('/api/capabilities', async (req, res) => {
  const supabase = getClient();
  let query = supabase.from('capabilities').select('*');

  if (req.query.category) {
    query = query.eq('category', req.query.category);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/capabilities/resolve', async (req, res) => {
  const needsParam = req.query.needs as string;
  if (!needsParam) return res.status(400).json({ error: 'Missing ?needs= comma-separated capabilities' });

  const needs = needsParam.split(',').map((n) => n.trim().toLowerCase());
  const supabase = getClient();

  const { data, error } = await supabase.from('capabilities').select('*');
  if (error) return res.status(500).json({ error: error.message });

  // Find repos whose `provides` array covers all needed capabilities
  const matched = (data || []).filter((cap: any) => {
    const provides = (cap.provides || []).map((p: string) => p.toLowerCase());
    return needs.every((need) => provides.includes(need));
  });

  // Group by repo_name for clarity
  const repoMap = new Map<string, any[]>();
  for (const cap of matched) {
    const list = repoMap.get(cap.repo_name) || [];
    list.push(cap);
    repoMap.set(cap.repo_name, list);
  }

  res.json({
    needed: needs,
    matched_repos: Array.from(repoMap.entries()).map(([repo, caps]) => ({
      repo,
      matching_capabilities: caps,
    })),
  });
});

// ─── Fleet Budgets ─────────────────────────────────────────────────
app.get('/api/fleet/budgets', async (_req, res) => {
  const supabase = getClient();
  const { data, error } = await supabase.from('fleet_budgets').select('*');
  if (error) return res.status(500).json({ error: error.message });

  // Add verification status to each budget
  const enriched = (data || []).map((b: any) => ({
    ...b,
    conservation: verifyBudget(b),
  }));

  res.json(enriched);
});

app.post('/api/fleet/transfer', async (req, res) => {
  const { from, to, amount } = req.body;
  if (!from || !to || !amount) {
    return res.status(400).json({ error: 'Missing required fields: from, to, amount' });
  }

  const result = await transferBudget(from, to, Number(amount));
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true, message: `Transferred ${amount} from ${from} to ${to}` });
});

app.get('/api/fleet/audit', async (_req, res) => {
  try {
    const report = await auditFleet();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Fleet Events ──────────────────────────────────────────────────
app.post('/api/fleet/events', async (req, res) => {
  const { agent_id, event_type, payload } = req.body;
  if (!agent_id || !event_type) {
    return res.status(400).json({ error: 'Missing required fields: agent_id, event_type' });
  }

  const supabase = getClient();
  const { data, error } = await supabase
    .from('fleet_events')
    .insert([{ agent_id, event_type, payload: payload || {} }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.get('/api/fleet/health', async (_req, res) => {
  const supabase = getClient();

  const [reposResult, capsResult, budgetsResult, eventsResult] = await Promise.all([
    supabase.from('repos').select('name', { count: 'exact', head: true }),
    supabase.from('capabilities').select('name', { count: 'exact', head: true }),
    supabase.from('fleet_budgets').select('agent_id'),
    supabase.from('fleet_events').select('event_type'),
  ]);

  const audit = await auditFleet();

  res.json({
    ecosystem: {
      total_repos: reposResult.count || 0,
      total_capabilities: capsResult.count || 0,
      active_agents: (budgetsResult.data || []).length,
      recent_events: (eventsResult.data || []).length,
    },
    conservation: {
      fleet_total: audit.fleetTotal,
      violations: audit.violations.length,
      healthy: audit.violations.length === 0,
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── Stats ─────────────────────────────────────────────────────────
app.get('/api/stats', async (_req, res) => {
  const supabase = getClient();

  const { data: repos, error } = await supabase.from('repos').select('*');
  if (error) return res.status(500).json({ error: error.message });

  const reposList = repos || [];
  const byLanguage: Record<string, number> = {};
  let totalTests = 0;

  for (const repo of reposList) {
    const lang = repo.language || 'unknown';
    byLanguage[lang] = (byLanguage[lang] || 0) + 1;
    totalTests += repo.test_count || 0;
  }

  const { count: capCount } = await supabase
    .from('capabilities')
    .select('*', { count: 'exact', head: true });

  res.json({
    total_repos: reposList.length,
    total_tests: totalTests,
    by_language: byLanguage,
    total_capabilities: capCount || 0,
    languages: Object.keys(byLanguage),
  });
});

// ─── Start ─────────────────────────────────────────────────────────
export function startServer() {
  return app.listen(PORT, () => {
    console.log(`🚀 si-fleet-api running on port ${PORT}`);
  });
}

// Only start if this file is run directly (not imported)
if (require.main === module) {
  startServer();
}

export { app };
