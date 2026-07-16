jest.mock('../../../config/env', () => ({
  env: {
    SGP_BASE_URL: 'https://example.com',
    SGP_API_TOKEN: 'x',
    SGP_APP_NAME: 'test',
  },
}));

jest.mock('../../../integrations/sgp/customers', () => ({
  getCustomerByCpf: jest.fn(),
}));

import { sgpClient } from '../../../integrations/sgp/client';
import { getCustomerByCpf } from '../../../integrations/sgp/customers';
import { getBillingStatusForAllowlist } from '../../../integrations/sgp/billing';

/** ISO YYYY-MM-DD for "today + offsetDays", avoiding any Date mocking. */
function isoInDays(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().split('T')[0]!;
}

describe('getBillingStatusForAllowlist', () => {
  const postSpy = jest.spyOn(sgpClient, 'post');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a CPF, computes days until due, and picks stage d5 when due in exactly 5 days', async () => {
    (getCustomerByCpf as jest.Mock).mockResolvedValue({
      id: '104225', name: 'Thiago Alves', phone: '+5585999990001',
    });
    const dueDate = isoInDays(5);
    postSpy.mockResolvedValue({
      data: {
        paginacao: { offset: 0, limit: 5, parcial: 1, total: 1 },
        faturas: [{ id: 1, vencimento: dueDate, valor: 90, valorcorrigido: 90, status: 'Gerado', statusid: 1 }],
      },
    });

    const [entry] = await getBillingStatusForAllowlist(['12345678909']);

    expect(entry).toMatchObject({
      customerId: '104225',
      document: '12345678909',
      name: 'Thiago Alves',
      dueDate,
      daysUntilDue: 5,
      stage: 'd5',
    });
  });

  it('returns stage null when the due date does not match any tracked window', async () => {
    (getCustomerByCpf as jest.Mock).mockResolvedValue({ id: '1', name: 'X', phone: '+5585999990009' });
    const dueDate = isoInDays(12);
    postSpy.mockResolvedValue({
      data: {
        paginacao: { offset: 0, limit: 5, parcial: 1, total: 1 },
        faturas: [{ id: 2, vencimento: dueDate, valor: 50, valorcorrigido: 50, status: 'Gerado', statusid: 1 }],
      },
    });

    const [entry] = await getBillingStatusForAllowlist(['12345678909']);

    expect(entry!.stage).toBeNull();
  });

  it('includes pixCode when codigopix is present on the invoice, stage d0 when due today', async () => {
    (getCustomerByCpf as jest.Mock).mockResolvedValue({ id: '1', name: 'X', phone: '+5585999990009' });
    const dueDate = isoInDays(0);
    postSpy.mockResolvedValue({
      data: {
        paginacao: { offset: 0, limit: 5, parcial: 1, total: 1 },
        faturas: [{ id: 3, vencimento: dueDate, valor: 50, valorcorrigido: 50, status: 'Gerado', statusid: 1, codigopix: 'pix-abc' }],
      },
    });

    const [entry] = await getBillingStatusForAllowlist(['12345678909']);

    expect(entry!.pixCode).toBe('pix-abc');
    expect(entry!.stage).toBe('d0');
  });

  it('trims surrounding whitespace from codigopix so the copied PIX code has no stray characters', async () => {
    (getCustomerByCpf as jest.Mock).mockResolvedValue({ id: '1', name: 'X', phone: '+5585999990009' });
    const dueDate = isoInDays(0);
    postSpy.mockResolvedValue({
      data: {
        paginacao: { offset: 0, limit: 5, parcial: 1, total: 1 },
        faturas: [{ id: 4, vencimento: dueDate, valor: 50, valorcorrigido: 50, status: 'Gerado', statusid: 1, codigopix: '  pix-abc\n' }],
      },
    });

    const [entry] = await getBillingStatusForAllowlist(['12345678909']);

    expect(entry!.pixCode).toBe('pix-abc');
  });

  it('skips the CPF (no entry, no throw) when there is no open invoice', async () => {
    (getCustomerByCpf as jest.Mock).mockResolvedValue({ id: '1', name: 'X', phone: '+5585999990009' });
    postSpy.mockResolvedValue({
      data: { paginacao: { offset: 0, limit: 5, parcial: 0, total: 0 }, faturas: [] },
    });

    const result = await getBillingStatusForAllowlist(['12345678909']);

    expect(result).toEqual([]);
  });

  it('skips a CPF whose lookup fails, but still returns entries for the others', async () => {
    (getCustomerByCpf as jest.Mock)
      .mockRejectedValueOnce(new Error('Cliente não encontrado'))
      .mockResolvedValueOnce({ id: '2', name: 'Maria', phone: '+5585999990002' });
    const dueDate = isoInDays(0);
    postSpy.mockResolvedValue({
      data: {
        paginacao: { offset: 0, limit: 5, parcial: 1, total: 1 },
        faturas: [{ id: 4, vencimento: dueDate, valor: 40, valorcorrigido: 40, status: 'Gerado', statusid: 1 }],
      },
    });

    const result = await getBillingStatusForAllowlist(['98765432100', '13579246828']);

    expect(result).toHaveLength(1);
    expect(result[0]!.customerId).toBe('2');
  });

  it('rejects a CPF that fails checksum validation without calling the SGP', async () => {
    const result = await getBillingStatusForAllowlist(['00000000000']);

    expect(result).toEqual([]);
    expect(getCustomerByCpf).not.toHaveBeenCalled();
  });

  it('picks the invoice with the nearest due date when multiple open invoices exist', async () => {
    (getCustomerByCpf as jest.Mock).mockResolvedValue({ id: '1', name: 'X', phone: '+5585999990009' });
    const farDate = isoInDays(30);
    const nearDate = isoInDays(2);
    postSpy.mockResolvedValue({
      data: {
        paginacao: { offset: 0, limit: 5, parcial: 2, total: 2 },
        faturas: [
          { id: 5, vencimento: farDate, valor: 90, valorcorrigido: 90, status: 'Gerado', statusid: 1 },
          { id: 6, vencimento: nearDate, valor: 90, valorcorrigido: 90, status: 'Gerado', statusid: 1 },
        ],
      },
    });

    const [entry] = await getBillingStatusForAllowlist(['12345678909']);

    expect(entry!.dueDate).toBe(nearDate);
    expect(entry!.stage).toBe('d2');
  });

  it('picks stage d3 when due in exactly 3 days (bug found during billing_recipients audit — was previously unmapped, always null)', async () => {
    (getCustomerByCpf as jest.Mock).mockResolvedValue({ id: '1', name: 'X', phone: '+5585999990009' });
    const dueDate = isoInDays(3);
    postSpy.mockResolvedValue({
      data: {
        paginacao: { offset: 0, limit: 5, parcial: 1, total: 1 },
        faturas: [{ id: 7, vencimento: dueDate, valor: 60, valorcorrigido: 60, status: 'Gerado', statusid: 1 }],
      },
    });

    const [entry] = await getBillingStatusForAllowlist(['12345678909']);

    expect(entry!.stage).toBe('d3');
  });
});
