import { Router, Request, Response, NextFunction } from 'express';
import { validateRequest } from 'twilio';
import { env } from '../../config/env';
import { messageBus } from '../../services/message-bus';

const router = Router();

function twilioSignatureGuard(req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV !== 'production') {
    next();
    return;
  }

  const signature = (req.headers['x-twilio-signature'] as string) ?? '';
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const valid = validateRequest(
    env.TWILIO_AUTH_TOKEN ?? '',
    signature,
    url,
    req.body as Record<string, string>,
  );

  if (!valid) {
    res.status(403).json({ error: 'Invalid Twilio signature' });
    return;
  }

  next();
}

router.post('/', twilioSignatureGuard, (req: Request, res: Response) => {
  const { From, Body, ProfileName } = req.body as {
    From?: string;
    Body?: string;
    ProfileName?: string;
  };

  if (!From || !Body) {
    res.status(200).send('');
    return;
  }

  const phone = From.replace('whatsapp:', '');

  messageBus.emitIncomingMessage({
    phone,
    body: Body,
    profileName: ProfileName,
  });

  res.status(200).send('');
});

export default router;
