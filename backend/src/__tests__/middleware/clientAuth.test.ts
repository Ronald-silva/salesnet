import { Request, Response, NextFunction } from 'express';
import { clientAuthMiddleware, AuthenticatedRequest } from '../../middleware/clientAuth';

jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../../config/supabase';

beforeEach(() => jest.clearAllMocks());

function makeReq(token?: string): Partial<Request> {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

function makeRes(): { status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json };
}

function mockSession(data: { customer_id: string; phone: string } | null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data, error: data ? null : { code: 'PGRST116' } }),
  };
  (supabase.from as jest.Mock).mockReturnValue(chain);
}

describe('clientAuthMiddleware', () => {
  it('calls next() and sets customerId/customerPhone when token is valid', async () => {
    mockSession({ customer_id: 'cust1', phone: '+5585999990001' });
    const req = makeReq('valid-token') as AuthenticatedRequest;
    const res = makeRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    await clientAuthMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.customerId).toBe('cust1');
    expect(req.customerPhone).toBe('+5585999990001');
  });

  it('returns 401 when no Authorization header', async () => {
    const req = makeReq() as AuthenticatedRequest;
    const res = makeRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    await clientAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token not found in database', async () => {
    mockSession(null);
    const req = makeReq('invalid-token') as AuthenticatedRequest;
    const res = makeRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    await clientAuthMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
