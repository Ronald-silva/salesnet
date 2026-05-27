import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';

// TODO: migrate to RedisStore when Redis queue is implemented
// import { RedisStore } from 'rate-limit-redis';

export const webhookRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  keyGenerator: (req: Request) => {
    const instanceName = req.params['instanceName'] ?? 'unknown';
    const rawIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const ip = ipKeyGenerator(rawIp);
    return `${ip}:${instanceName}`;
  },
  handler: (req: Request, res: Response) => {
    const instanceName = req.params['instanceName'] ?? 'unknown';
    const rawIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const ip = ipKeyGenerator(rawIp);
    console.warn(`[rate-limit] webhook blocked — ip=${ip} instance=${instanceName}`);
    res.status(429).json({ error: 'rate_limit_exceeded' });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
