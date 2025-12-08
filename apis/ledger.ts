// Internal ledger API
import express, { Request, Response } from 'express';
const router = express.Router();

import { Ledger } from '../database/models';

router.get('/', async (_req: Request, res: Response) => {
  const entries = await Ledger.find();
  res.json(entries);
});

router.post('/add', async (req: Request, res: Response) => {
  const entry = await Ledger.create(req.body);
  res.json({ success: true, entry });
});

export default router;
