import { Router, Request, Response } from 'express';
import { haClient } from '../services/haClient';

export const haRoutes = Router();

haRoutes.get('/status', (_req: Request, res: Response) => {
  res.json(haClient.getStatus());
});

haRoutes.get('/entities', async (req: Request, res: Response) => {
  try {
    const domain = typeof req.query.domain === "string" ? req.query.domain : undefined;
    const entities = await haClient.listEntities();
    res.json(domain ? entities.filter((entity) => entity.entity_id.startsWith(`${domain}.`)) : entities);
  } catch {
    res.status(503).json({ error: 'Home Assistant unavailable' });
  }
});
