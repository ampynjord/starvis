import express, { type Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { responseShapeMiddleware } from '../src/middleware/response-shape.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(responseShapeMiddleware);
  app.get('/jsend', (_req, res) => void res.json({ status: 'success', data: [1, 2] }));
  app.get('/legacy', (_req, res) => void res.json({ success: true, total: 2, data: [1, 2] }));
  app.get('/raw', (_req, res) => void res.json({ name: 'Starvis' }));
  app.get('/health-like', (_req, res) => void res.status(503).json({ status: 'not_ready' }));
  app.get('/failure', (_req, res) => void res.status(400).json({ success: false, error: 'Validation error' }));
  app.get('/array', (_req, res) => void res.json([1, 2, 3]));
});

describe('responseShapeMiddleware', () => {
  it('complète une réponse JSend avec le discriminant legacy', async () => {
    const res = await request(app).get('/jsend');
    expect(res.body).toEqual({ status: 'success', success: true, data: [1, 2] });
  });

  it('complète une réponse legacy avec le discriminant JSend', async () => {
    const res = await request(app).get('/legacy');
    expect(res.body.status).toBe('success');
    expect(res.body.success).toBe(true);
    // La pagination reste en racine : la déplacer casserait les intégrations.
    expect(res.body.total).toBe(2);
  });

  it('marque une réponse brute sans discriminant', async () => {
    const res = await request(app).get('/raw');
    expect(res.body).toEqual({ name: 'Starvis', success: true, status: 'success' });
  });

  it('dérive le statut du code HTTP et non du corps', async () => {
    const res = await request(app).get('/health-like');
    // `status` existe déjà ('not_ready') et n'est pas écrasé ; seul `success` est
    // ajouté, et il vaut false car la réponse est un 503.
    expect(res.body.status).toBe('not_ready');
    expect(res.body.success).toBe(false);
  });

  it("n'écrase jamais un discriminant existant", async () => {
    const res = await request(app).get('/failure');
    expect(res.body).toEqual({ success: false, error: 'Validation error', status: 'error' });
  });

  it('laisse les tableaux intacts', async () => {
    const res = await request(app).get('/array');
    expect(res.body).toEqual([1, 2, 3]);
  });
});
