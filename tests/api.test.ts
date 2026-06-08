import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';

const HAS_DB = !!process.env.SUPABASE_SERVICE_KEY;

describe('API Routes', () => {
  describe('GET /api/health', () => {
    it('returns ok status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('si-fleet-api');
    });
  });

  describe('GET /api/repos', () => {
    it('returns a list or graceful error', async () => {
      const res = await request(app).get('/api/repos');
      if (HAS_DB) {
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      } else {
        expect([200, 500]).toContain(res.status);
      }
    });
  });

  describe('GET /api/repos/search', () => {
    it('returns 400 when missing q parameter', async () => {
      const res = await request(app).get('/api/repos/search');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('accepts a search query', async () => {
      const res = await request(app).get('/api/repos/search?q=test');
      if (HAS_DB) {
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      } else {
        expect([200, 500]).toContain(res.status);
      }
    });
  });

  describe('GET /api/repos/:name', () => {
    it('returns 404 for non-existent repo', async () => {
      const res = await request(app).get('/api/repos/nonexistent-repo-xyz');
      expect([404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/capabilities', () => {
    it('returns capabilities list or graceful error', async () => {
      const res = await request(app).get('/api/capabilities');
      if (HAS_DB) {
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      } else {
        expect([200, 500]).toContain(res.status);
      }
    });
  });

  describe('GET /api/capabilities/resolve', () => {
    it('returns 400 when missing needs parameter', async () => {
      const res = await request(app).get('/api/capabilities/resolve');
      expect(res.status).toBe(400);
    });

    it('resolves capabilities', async () => {
      const res = await request(app).get('/api/capabilities/resolve?needs=math');
      if (HAS_DB) {
        expect(res.status).toBe(200);
        expect(res.body.needed).toContain('math');
        expect(Array.isArray(res.body.matched_repos)).toBe(true);
      } else {
        expect([200, 500]).toContain(res.status);
      }
    });
  });

  describe('Fleet Budgets', () => {
    it('GET /api/fleet/budgets returns list or error', async () => {
      const res = await request(app).get('/api/fleet/budgets');
      if (HAS_DB) {
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      } else {
        expect([200, 500]).toContain(res.status);
      }
    });

    it('POST /api/fleet/transfer rejects missing fields', async () => {
      const res = await request(app).post('/api/fleet/transfer').send({});
      expect(res.status).toBe(400);
    });

    it('POST /api/fleet/transfer rejects self-transfer', async () => {
      const res = await request(app)
        .post('/api/fleet/transfer')
        .send({ from: 'a', to: 'a', amount: 10 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/fleet/audit', () => {
    it('returns audit report or error', async () => {
      const res = await request(app).get('/api/fleet/audit');
      if (HAS_DB) {
        expect(res.status).toBe(200);
        expect(res.body.totalAgents).toBeDefined();
        expect(res.body.violations).toBeDefined();
      } else {
        expect([200, 500]).toContain(res.status);
      }
    });
  });

  describe('Fleet Events', () => {
    it('POST /api/fleet/events rejects missing fields', async () => {
      const res = await request(app).post('/api/fleet/events').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/fleet/health', () => {
    it('returns health report or error', async () => {
      const res = await request(app).get('/api/fleet/health');
      if (HAS_DB) {
        expect(res.status).toBe(200);
        expect(res.body.ecosystem).toBeDefined();
        expect(res.body.conservation).toBeDefined();
      } else {
        expect([200, 500]).toContain(res.status);
      }
    });
  });

  describe('GET /api/stats', () => {
    it('returns ecosystem stats or error', async () => {
      const res = await request(app).get('/api/stats');
      if (HAS_DB) {
        expect(res.status).toBe(200);
        expect(res.body.total_repos).toBeDefined();
        expect(res.body.by_language).toBeDefined();
      } else {
        expect([200, 500]).toContain(res.status);
      }
    });
  });
});
