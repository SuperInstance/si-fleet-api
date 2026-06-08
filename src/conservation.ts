import { getClient } from './supabase.js';

/** Tolerance for floating-point comparison */
const EPSILON = 0.01;

export interface BudgetRow {
  agent_id: string;
  total_budget: number;
  gamma: number;
  eta: number;
}

/**
 * Verify that a single budget satisfies the conservation law:
 * gamma + eta ≈ total_budget
 */
export function verifyBudget(budget: BudgetRow): { valid: boolean; delta: number } {
  const delta = Math.abs(budget.gamma + budget.eta - budget.total_budget);
  return { valid: delta < EPSILON, delta };
}

/**
 * Transfer budget between two agents atomically.
 * Decrements `from` agent's (total_budget, gamma) by amount,
 * increments `to` agent's (total_budget, gamma) by amount.
 * Maintains the gamma + eta ≈ total invariant.
 */
export async function transferBudget(
  fromAgent: string,
  toAgent: string,
  amount: number,
): Promise<{ success: boolean; error?: string }> {
  if (amount <= 0) return { success: false, error: 'Amount must be positive' };
  if (fromAgent === toAgent) return { success: false, error: 'Cannot transfer to self' };

  const supabase = getClient();

  // Fetch both budgets
  const { data: budgets, error: fetchErr } = await supabase
    .from('fleet_budgets')
    .select('*')
    .in('agent_id', [fromAgent, toAgent]);

  if (fetchErr) return { success: false, error: fetchErr.message };
  if (!budgets || budgets.length < 2) {
    return { success: false, error: 'One or both agents not found in fleet_budgets' };
  }

  const fromRow = budgets.find((b: BudgetRow) => b.agent_id === fromAgent);
  const toRow = budgets.find((b: BudgetRow) => b.agent_id === toAgent);

  if (!fromRow || !toRow) return { success: false, error: 'Agent not found' };

  // Check sufficient funds
  if (fromRow.total_budget < amount) {
    return { success: false, error: `Insufficient budget: ${fromRow.total_budget} < ${amount}` };
  }

  // Perform atomic-ish transfer via two updates
  const { error: err1 } = await supabase
    .from('fleet_budgets')
    .update({
      total_budget: fromRow.total_budget - amount,
      gamma: fromRow.gamma - amount,
    })
    .eq('agent_id', fromAgent);

  if (err1) return { success: false, error: `Debit failed: ${err1.message}` };

  const { error: err2 } = await supabase
    .from('fleet_budgets')
    .update({
      total_budget: toRow.total_budget + amount,
      gamma: toRow.gamma + amount,
    })
    .eq('agent_id', toAgent);

  if (err2) {
    // Attempt rollback
    await supabase
      .from('fleet_budgets')
      .update({
        total_budget: fromRow.total_budget,
        gamma: fromRow.gamma,
      })
      .eq('agent_id', fromAgent);
    return { success: false, error: `Credit failed: ${err2.message}` };
  }

  // Log transfer event
  await supabase.from('fleet_events').insert([
    { agent_id: fromAgent, event_type: 'transfer_out', payload: { to: toAgent, amount } },
    { agent_id: toAgent, event_type: 'transfer_in', payload: { from: fromAgent, amount } },
  ]);

  return { success: true };
}

/**
 * Audit all fleet budgets for conservation violations.
 */
export async function auditFleet(): Promise<{
  totalAgents: number;
  violations: Array<{ agent_id: string; total: number; gamma: number; eta: number; delta: number }>;
  fleetTotal: number;
}> {
  const supabase = getClient();
  const { data: budgets, error } = await supabase.from('fleet_budgets').select('*');

  if (error) throw new Error(`Audit failed: ${error.message}`);
  if (!budgets) return { totalAgents: 0, violations: [], fleetTotal: 0 };

  const violations: Array<{ agent_id: string; total: number; gamma: number; eta: number; delta: number }> = [];
  let fleetTotal = 0;

  for (const b of budgets as BudgetRow[]) {
    const { delta } = verifyBudget(b);
    if (delta >= EPSILON) {
      violations.push({
        agent_id: b.agent_id,
        total: b.total_budget,
        gamma: b.gamma,
        eta: b.eta,
        delta,
      });
    }
    fleetTotal += b.total_budget;
  }

  return { totalAgents: budgets.length, violations, fleetTotal };
}
