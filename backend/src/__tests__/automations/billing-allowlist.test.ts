// Fake, checksum-valid but non-production CPFs — never use real customer documents in tests.
jest.mock('../../config/env', () => ({
  env: { BILLING_ALLOWLIST_CPFS: '12345678909,98765432100,13579246828,86420975310' },
}));

jest.mock('../../integrations/sgp/billing', () => ({
  getBillingStatusForAllowlist: jest.fn(),
}));

jest.mock('../../integrations/sgp', () => ({
  getCustomersDueInDays: jest.fn(),
  getOverdueCustomers: jest.fn(),
}));

import { getBillingStatusForAllowlist } from '../../integrations/sgp/billing';
import { getCustomersDueInDays, getOverdueCustomers } from '../../integrations/sgp';
import {
  BILLING_SEND_ALLOWLIST,
  isCpfSendAllowed,
  resolveDueSoonCustomers,
  resolveOverdueCustomers,
  logSkippedOutsideAllowlist,
} from '../../automations/billing-allowlist';

beforeEach(() => jest.clearAllMocks());

describe('BILLING_SEND_ALLOWLIST — sourced from BILLING_ALLOWLIST_CPFS', () => {
  it('parses and normalizes the CPFs configured in the env var', () => {
    expect(BILLING_SEND_ALLOWLIST.sort()).toEqual(
      ['12345678909', '98765432100', '13579246828', '86420975310'].sort()
    );
  });

  it('normalizes formatted CPFs (dots/dashes) and trims blank entries when parsed fresh', () => {
    jest.resetModules();
    jest.doMock('../../config/env', () => ({
      env: { BILLING_ALLOWLIST_CPFS: ' 123.456.789-09 , ,98765432100,' },
    }));

    const { BILLING_SEND_ALLOWLIST: fresh } = require('../../automations/billing-allowlist');

    expect(fresh).toEqual(['12345678909', '98765432100']);
  });

  it('treats a missing env var as an inactive allowlist (empty array) without throwing, and warns', () => {
    jest.resetModules();
    jest.doMock('../../config/env', () => ({ env: { BILLING_ALLOWLIST_CPFS: undefined } }));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let fresh: { BILLING_SEND_ALLOWLIST: string[] };
    expect(() => {
      fresh = require('../../automations/billing-allowlist');
    }).not.toThrow();

    expect(fresh!.BILLING_SEND_ALLOWLIST).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('BILLING_ALLOWLIST_CPFS'));
    warnSpy.mockRestore();
  });

  it('treats an empty-string env var the same way as a missing one', () => {
    jest.resetModules();
    jest.doMock('../../config/env', () => ({ env: { BILLING_ALLOWLIST_CPFS: '' } }));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { BILLING_SEND_ALLOWLIST: fresh } = require('../../automations/billing-allowlist');

    expect(fresh).toEqual([]);
  });
});

describe('isCpfSendAllowed', () => {
  it('returns true for a CPF in the allowlist', () => {
    expect(isCpfSendAllowed('12345678909')).toBe(true);
  });

  it('returns true for a formatted CPF in the allowlist (digits normalized)', () => {
    expect(isCpfSendAllowed('123.456.789-09')).toBe(true);
  });

  it('returns false for a CPF not in the allowlist', () => {
    expect(isCpfSendAllowed('11144477735')).toBe(false);
  });

  it('returns false when document is undefined', () => {
    expect(isCpfSendAllowed(undefined)).toBe(false);
  });
});

describe('resolveDueSoonCustomers', () => {
  it('sources from getBillingStatusForAllowlist and filters by stage d5, never calling getCustomersDueInDays', async () => {
    (getBillingStatusForAllowlist as jest.Mock).mockResolvedValue([
      { customerId: 'c1', document: '12345678909', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-13', amount: 90, daysUntilDue: 5, stage: 'd5' },
      { customerId: 'c2', document: '98765432100', name: 'Edi', phone: '+5585999990002', dueDate: '2026-07-10', amount: 70, daysUntilDue: 2, stage: 'd2' },
    ]);

    const result = await resolveDueSoonCustomers(5);

    expect(result).toEqual([
      { customerId: 'c1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-13', amount: 90, document: '12345678909', pixCode: undefined },
    ]);
    expect(getCustomersDueInDays).not.toHaveBeenCalled();
  });

  it('filters by stage d0', async () => {
    (getBillingStatusForAllowlist as jest.Mock).mockResolvedValue([
      { customerId: 'c3', document: '13579246828', name: 'Viviane', phone: '+5585999990003', dueDate: '2026-07-08', amount: 60, daysUntilDue: 0, stage: 'd0', pixCode: 'pix-x' },
    ]);

    const result = await resolveDueSoonCustomers(0);

    expect(result).toEqual([
      { customerId: 'c3', name: 'Viviane', phone: '+5585999990003', dueDate: '2026-07-08', amount: 60, document: '13579246828', pixCode: 'pix-x' },
    ]);
  });
});

describe('resolveOverdueCustomers', () => {
  it('filters by stage d3_overdue, never calling getOverdueCustomers', async () => {
    (getBillingStatusForAllowlist as jest.Mock).mockResolvedValue([
      { customerId: 'c4', document: '86420975310', name: 'Carlos', phone: '+5585999990004', dueDate: '2026-07-05', amount: 60, daysUntilDue: -3, stage: 'd3_overdue' },
    ]);

    const result = await resolveOverdueCustomers(3);

    expect(result).toEqual([
      { customerId: 'c4', name: 'Carlos', phone: '+5585999990004', daysOverdue: 3, amountDue: 60, document: '86420975310', pixCode: undefined },
    ]);
    expect(getOverdueCustomers).not.toHaveBeenCalled();
  });

  it('filters by stage d5_overdue', async () => {
    (getBillingStatusForAllowlist as jest.Mock).mockResolvedValue([
      { customerId: 'c4', document: '86420975310', name: 'Carlos', phone: '+5585999990004', dueDate: '2026-07-03', amount: 60, daysUntilDue: -5, stage: 'd5_overdue' },
    ]);

    const result = await resolveOverdueCustomers(5);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ customerId: 'c4', daysOverdue: 5 });
  });
});

describe('logSkippedOutsideAllowlist', () => {
  it('logs the skip without leaking the raw phone number', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    logSkippedOutsideAllowlist('c9', '+5585999998888', 'd3');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('c9'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('****8888'));
    expect(warnSpy).toHaveBeenCalledWith(expect.not.stringContaining('+5585999998888'));
    warnSpy.mockRestore();
  });
});
