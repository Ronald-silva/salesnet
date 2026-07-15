jest.mock('../../config/env', () => ({ env: { BILLING_ALLOWLIST_CPFS: undefined, DEFAULT_TENANT_ID: 'salesnet-default' } }));

jest.mock('../../lib/billing-recipients', () => ({ listActiveEligibleRecipients: jest.fn() }));
jest.mock('../../integrations/sgp/billing', () => ({ getBillingStatusForAllowlist: jest.fn() }));

import { listActiveEligibleRecipients } from '../../lib/billing-recipients';
import { getBillingStatusForAllowlist } from '../../integrations/sgp/billing';
import {
  isCpfSendAllowed,
  resolveDueSoonCustomers,
  resolveOverdueCustomers,
  logSkippedOutsideAllowlist,
} from '../../automations/billing-allowlist';

beforeEach(() => jest.clearAllMocks());

describe('isCpfSendAllowed — agora só filtro extra opcional (BILLING_ALLOWLIST_CPFS vazia = não restringe)', () => {
  it('returns true for any CPF when BILLING_ALLOWLIST_CPFS is not set', () => {
    expect(isCpfSendAllowed('12345678909')).toBe(true);
    expect(isCpfSendAllowed(undefined)).toBe(true);
  });
});

describe('resolveDueSoonCustomers', () => {
  it('resolves eligible recipients from billing_recipients for the d0 stage, then filters SGP status by stage', async () => {
    (listActiveEligibleRecipients as jest.Mock).mockResolvedValue([
      { id: 'r1', contract_id: 'c1', cpf: '12345678909', phone: '+5585999990001', customer_name: 'Maria' },
    ]);
    (getBillingStatusForAllowlist as jest.Mock).mockResolvedValue([
      { customerId: 'c1', document: '12345678909', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-15', amount: 90, daysUntilDue: 0, stage: 'd0' },
    ]);

    const result = await resolveDueSoonCustomers(0);

    expect(listActiveEligibleRecipients).toHaveBeenCalledWith('salesnet-default', 'd0');
    expect(getBillingStatusForAllowlist).toHaveBeenCalledWith(['12345678909']);
    expect(result).toEqual([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-15', amount: 90, document: '12345678909', pixCode: undefined },
    ]);
  });

  it('returns [] without calling SGP when there are no eligible recipients', async () => {
    (listActiveEligibleRecipients as jest.Mock).mockResolvedValue([]);

    const result = await resolveDueSoonCustomers(3);

    expect(result).toEqual([]);
    expect(getBillingStatusForAllowlist).not.toHaveBeenCalled();
  });

  it('resolves stage d3 (bug-fix coverage — was unreachable while the old env allowlist was active)', async () => {
    (listActiveEligibleRecipients as jest.Mock).mockResolvedValue([
      { id: 'r1', contract_id: 'c1', cpf: '12345678909', phone: '+5585999990001', customer_name: 'Maria' },
    ]);
    (getBillingStatusForAllowlist as jest.Mock).mockResolvedValue([
      { customerId: 'c1', document: '12345678909', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-18', amount: 90, daysUntilDue: 3, stage: 'd3' },
    ]);

    const result = await resolveDueSoonCustomers(3);

    expect(result).toHaveLength(1);
    expect(result[0]!.recipientId).toBe('r1');
  });

  it('normalizes CPF when matching formatted recipient CPF to normalized SGP document', async () => {
    (listActiveEligibleRecipients as jest.Mock).mockResolvedValue([
      { id: 'r-fmt', contract_id: 'c-fmt', cpf: '123.456.789-09', phone: '+5585999990099', customer_name: 'Ana' },
    ]);
    (getBillingStatusForAllowlist as jest.Mock).mockResolvedValue([
      { customerId: 'c-fmt', document: '12345678909', name: 'Ana', phone: '+5585999990099', dueDate: '2026-07-20', amount: 75, daysUntilDue: 0, stage: 'd0' },
    ]);

    const result = await resolveDueSoonCustomers(0);

    expect(result).toHaveLength(1);
    expect(result[0]!.recipientId).toBe('r-fmt');
    expect(result[0]!.document).toBe('12345678909');
  });
});

describe('resolveOverdueCustomers', () => {
  it('resolves eligible recipients, filters SGP status by overdue stage', async () => {
    (listActiveEligibleRecipients as jest.Mock).mockResolvedValue([
      { id: 'r4', contract_id: 'c4', cpf: '86420975310', phone: '+5585999990004', customer_name: 'Carlos' },
    ]);
    (getBillingStatusForAllowlist as jest.Mock).mockResolvedValue([
      { customerId: 'c4', document: '86420975310', name: 'Carlos', phone: '+5585999990004', dueDate: '2026-07-10', amount: 60, daysUntilDue: -3, stage: 'd3_overdue' },
    ]);

    const result = await resolveOverdueCustomers(3);

    expect(listActiveEligibleRecipients).toHaveBeenCalledWith('salesnet-default', 'overdue_d3');
    expect(result).toEqual([
      { customerId: 'c4', recipientId: 'r4', name: 'Carlos', phone: '+5585999990004', daysOverdue: 3, amountDue: 60, document: '86420975310', pixCode: undefined },
    ]);
  });
});

describe('logSkippedOutsideAllowlist', () => {
  it('logs the skip without leaking the raw phone number', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    logSkippedOutsideAllowlist('c9', '+5585999998888', 'd3');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('****8888'));
    warnSpy.mockRestore();
  });
});
