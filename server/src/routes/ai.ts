import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../utils/async';
import { forbidden } from '../utils/errors';
import {
  getAiStatus,
  saveGeminiApiKey,
  generateScriptAssistance,
  generateCaptionAssistance,
} from '../services/ai';
import { Content, Client } from '../models';

const r = Router();

/** Check AI engine status and configuration */
r.get('/status', ah(async (_req, res) => {
  res.json(await getAiStatus());
}));

/** Update / Save Gemini API Key (Super Admin or Admin only) */
r.post('/config', ah(async (req, res) => {
  if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN') {
    throw forbidden('Only Admin or Super Admin can configure AI integrations');
  }
  const b = z.object({ apiKey: z.string().min(5).max(300) }).parse(req.body);
  await saveGeminiApiKey(b.apiKey, req.user!._id);
  res.json({ ok: true, message: 'Google Gemini API key saved successfully.' });
}));

/** Generate complete viral script package (Optional AI Assistant) */
r.post('/generate-script', ah(async (req, res) => {
  const schema = z.object({
    contentId: z.string().optional(),
    topic: z.string().min(2).max(500),
    niche: z.string().optional(),
    tone: z.string().optional(),
    language: z.string().optional(),
    duration: z.string().optional(),
    clientName: z.string().optional(),
  });
  const b = schema.parse(req.body);

  let niche = b.niche;
  let clientName = b.clientName;

  if (b.contentId && (!niche || !clientName)) {
    try {
      const c = await Content.findById(b.contentId).populate('clientId', 'name industry');
      if (c && c.clientId) {
        const cl = c.clientId as any;
        if (!clientName) clientName = cl.name;
        if (!niche) niche = cl.industry || 'Commercial Brand';
      }
    } catch {}
  }

  const result = await generateScriptAssistance({
    topic: b.topic,
    niche,
    tone: b.tone,
    language: b.language,
    duration: b.duration,
    clientName,
  });

  res.json(result);
}));

/** Generate social media caption and hashtags */
r.post('/generate-caption', ah(async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).max(300),
    script: z.string().optional(),
    niche: z.string().optional(),
    platform: z.string().optional(),
  });
  const b = schema.parse(req.body);
  const result = await generateCaptionAssistance(b);
  res.json(result);
}));

export default r;
