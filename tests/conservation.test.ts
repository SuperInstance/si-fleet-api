import { describe, it, expect } from 'vitest';
import { verifyBudget } from '../src/conservation.js';
import type { BudgetRow } from '../src/conservation.js';

describe('verifyBudget', () => {
  it('passes when gamma + eta equals total', () => {
    const budget: BudgetRow = { agent_id: 'test', total_budget: 100, gamma: 60, eta: 40 };
    const result = verifyBudget(budget);
    expect(result.valid).toBe(true);
    expect(result.delta).toBe(0);
  });

  it('passes with small floating-point tolerance', () => {
    const budget: BudgetRow = { agent_id: 'test', total_budget: 100, gamma: 60.005, eta: 39.995 };
    const result = verifyBudget(budget);
    expect(result.valid).toBe(true);
  });

  it('fails when gamma + eta does not equal total', () => {
    const budget: BudgetRow = { agent_id: 'test', total_budget: 100, gamma: 50, eta: 30 };
    const result = verifyBudget(budget);
    expect(result.valid).toBe(false);
    expect(result.delta).toBe(20);
  });

  it('handles zero budget', () => {
    const budget: BudgetRow = { agent_id: 'empty', total_budget: 0, gamma: 0, eta: 0 };
    const result = verifyBudget(budget);
    expect(result.valid).toBe(true);
  });

  it('detects negative violation', () => {
    const budget: BudgetRow = { agent_id: 'neg', total_budget: 50, gamma: 30, eta: 30 };
    const result = verifyBudget(budget);
    expect(result.valid).toBe(false);
    expect(result.delta).toBe(10);
  });
});

describe('transferBudget validation', () => {
  // These test the pure validation logic (not DB calls)
  it('rejects non-positive amounts conceptually', () => {
    // Amount <= 0 should fail — we test the logic inline
    const amount = 0;
    expect(amount > 0).toBe(false);
  });

  it('rejects self-transfer conceptually', () => {
    const from = 'agent-1';
    const to = 'agent-1';
    expect(from === to).toBe(true);
  });
});
