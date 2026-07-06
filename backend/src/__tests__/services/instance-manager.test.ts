jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'default', ADMIN_ALERT_PHONE: '5585999998888' },
}));
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../integrations/whatsapp/provider-registry', () => ({
  providerRegistry: { get: jest.fn() },
}));

import { supabase } from '../../config/supabase';
import { whatsappService } from '../../services/whatsapp-service';
import { providerRegistry } from '../../integrations/whatsapp/provider-registry';
import { instanceManager } from '../../services/instance-manager';

function instanceRow(name: string) {
  return {
    id: name,
    tenant_id: 'default',
    instance_name: name,
    provider: 'evolution-go',
    phone_number: undefined,
    status: 'connected',
    webhook_url: undefined,
    instance_token: 'tok',
    last_connected_at: undefined,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

// Builder encadeável e thenable: `select('*')` (usado por healthCheckAll) resolve
// a lista direto no `await`; `.eq().maybeSingle()` (usado por findByName/syncStatus)
// resolve uma única linha. `.update().eq()` resolve pelo mesmo `then`.
function chainableFrom(row: ReturnType<typeof instanceRow>) {
  return jest.fn().mockImplementation(() => {
    const obj: any = {
      select: jest.fn(() => obj),
      eq: jest.fn(() => obj),
      update: jest.fn(() => obj),
      maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: [row], error: null }).then(resolve, reject),
    };
    return obj;
  });
}

function mockDisconnected(name: string) {
  (supabase.from as jest.Mock) = chainableFrom(instanceRow(name));
  (providerRegistry.get as jest.Mock).mockReturnValue({
    getInstanceStatus: jest.fn().mockResolvedValue({ connected: false, state: 'close' }),
    connectInstance: jest.fn().mockResolvedValue({ success: true }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('instanceManager.healthCheckAll — disconnect alert', () => {
  it('does not alert on the first detected disconnect', async () => {
    mockDisconnected('salesnet-t1');

    await instanceManager.healthCheckAll();

    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('alerts once ADMIN_ALERT_PHONE after the outage exceeds 15 minutes', async () => {
    mockDisconnected('salesnet-t2');

    await instanceManager.healthCheckAll(); // t=0, começa a rastrear
    jest.setSystemTime(Date.now() + 16 * 60 * 1000);
    await instanceManager.healthCheckAll(); // t=16min, deve alertar

    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      'default',
      '5585999998888',
      expect.stringContaining('salesnet-t2'),
    );
  });

  it('does not repeat the alert on every subsequent cycle of the same outage', async () => {
    mockDisconnected('salesnet-t3');

    await instanceManager.healthCheckAll();
    jest.setSystemTime(Date.now() + 16 * 60 * 1000);
    await instanceManager.healthCheckAll();
    jest.setSystemTime(Date.now() + 5 * 60 * 1000);
    await instanceManager.healthCheckAll();

    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
  });

  it('does not alert when ADMIN_ALERT_PHONE is unset, but still attempts reconnect', async () => {
    jest.resetModules();
    jest.doMock('../../config/env', () => ({
      env: { DEFAULT_TENANT_ID: 'default', ADMIN_ALERT_PHONE: undefined },
    }));
    jest.doMock('../../config/supabase', () => ({ supabase: { from: jest.fn() } }));
    jest.doMock('../../services/whatsapp-service', () => ({
      whatsappService: { sendText: jest.fn().mockResolvedValue(undefined) },
    }));
    jest.doMock('../../integrations/whatsapp/provider-registry', () => ({
      providerRegistry: { get: jest.fn() },
    }));

    const freshSupabase = (await import('../../config/supabase')).supabase;
    const freshWhatsapp = (await import('../../services/whatsapp-service')).whatsappService;
    const freshRegistry = (await import('../../integrations/whatsapp/provider-registry')).providerRegistry;
    const name = 'salesnet-t4';
    (freshSupabase.from as jest.Mock) = chainableFrom(instanceRow(name));
    const connectInstance = jest.fn().mockResolvedValue({ success: true });
    (freshRegistry.get as jest.Mock).mockReturnValue({
      getInstanceStatus: jest.fn().mockResolvedValue({ connected: false, state: 'close' }),
      connectInstance,
    });

    const { instanceManager: freshInstanceManager } = await import('../../services/instance-manager');

    await freshInstanceManager.healthCheckAll();
    jest.setSystemTime(Date.now() + 16 * 60 * 1000);
    await freshInstanceManager.healthCheckAll();

    expect(connectInstance).toHaveBeenCalledTimes(2);
    expect(freshWhatsapp.sendText).not.toHaveBeenCalled();
  });
});
