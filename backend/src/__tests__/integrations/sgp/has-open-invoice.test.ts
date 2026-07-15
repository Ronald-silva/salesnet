jest.mock('../../../config/env', () => ({
  env: { SGP_BASE_URL: 'https://example.com', SGP_API_TOKEN: 'x', SGP_APP_NAME: 'test' },
}));

import { sgpClient } from '../../../integrations/sgp/client';
import { hasOpenInvoice } from '../../../integrations/sgp/billing';

describe('hasOpenInvoice', () => {
  const postSpy = jest.spyOn(sgpClient, 'post');
  beforeEach(() => jest.clearAllMocks());

  it('returns true when there is at least one open or overdue invoice', async () => {
    postSpy.mockResolvedValue({
      data: {
        paginacao: { offset: 0, limit: 20, parcial: 1, total: 1 },
        faturas: [{ id: 1, vencimento: '2099-01-01', valor: 90, valorcorrigido: 90, status: 'Gerado', statusid: 1 }],
      },
    });

    await expect(hasOpenInvoice('41')).resolves.toBe(true);
  });

  it('returns false when every invoice is paid or cancelled', async () => {
    postSpy.mockResolvedValue({
      data: {
        paginacao: { offset: 0, limit: 20, parcial: 1, total: 1 },
        faturas: [{ id: 1, vencimento: '2026-01-01', valor: 90, valorcorrigido: 90, status: 'Pago', statusid: 2 }],
      },
    });

    await expect(hasOpenInvoice('41')).resolves.toBe(false);
  });

  it('returns false when there are no invoices at all', async () => {
    postSpy.mockResolvedValue({
      data: { paginacao: { offset: 0, limit: 20, parcial: 0, total: 0 }, faturas: [] },
    });

    await expect(hasOpenInvoice('41')).resolves.toBe(false);
  });
});
