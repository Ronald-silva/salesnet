/**
 * Admin — Instâncias WhatsApp
 *
 * CRUD de instâncias WhatsApp para o painel administrativo.
 */

import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { instanceManager } from '../services/instance-manager';
import { env } from '../config/env';

const router = Router();
router.use(adminAuthMiddleware);

/** GET /api/admin/instances — lista instâncias do tenant */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = env.DEFAULT_TENANT_ID ?? 'default';
    const instances = await instanceManager.listByTenant(tenantId);
    res.json({ instances });
  } catch (err) {
    console.error('[admin:instances] list error:', err);
    res.status(500).json({ error: 'Failed to list instances' });
  }
});

/** POST /api/admin/instances — cria nova instância */
router.post('/', async (req: Request, res: Response) => {
  const { instanceName } = req.body as { instanceName?: string };
  if (!instanceName) {
    res.status(400).json({ error: 'instanceName is required' });
    return;
  }

  try {
    const tenantId = env.DEFAULT_TENANT_ID ?? 'default';
    const webhookUrl = `${env.BACKEND_URL}/webhook/whatsapp/${instanceName}`;

    const instance = await instanceManager.provisionInstance(tenantId, {
      instanceName,
      webhookUrl,
      tenantId,
      qrcode: true,
    });

    res.status(201).json({ instance });
  } catch (err) {
    console.error('[admin:instances] create error:', err);
    res.status(500).json({ error: 'Failed to create instance' });
  }
});

/** GET /api/admin/instances/:id/qrcode — obtém QR code */
router.get('/:id/qrcode', async (req: Request, res: Response) => {
  try {
    const instance = await instanceManager.findById(String(req.params['id']));
    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    const result = await instanceManager.connectInstance(instance.id);
    res.json({ qrCode: result.qrCode, pairingCode: result.pairingCode });
  } catch (err) {
    console.error('[admin:instances] qrcode error:', err);
    res.status(500).json({ error: 'Failed to get QR code' });
  }
});

/** GET /api/admin/instances/:id/status — status de conexão */
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const instance = await instanceManager.findById(String(req.params['id']));
    if (!instance) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    const status = await instanceManager.syncStatus(instance.instanceName);
    res.json({ status, instance });
  } catch (err) {
    console.error('[admin:instances] status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/** DELETE /api/admin/instances/:id — remove instância */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await instanceManager.removeInstance(String(req.params['id']));
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin:instances] delete error:', err);
    res.status(500).json({ error: 'Failed to delete instance' });
  }
});

export { router as adminInstancesRouter };
