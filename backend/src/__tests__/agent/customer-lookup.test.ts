jest.mock('../../integrations/sgp', () => ({
  getCustomerByPhone: jest.fn(),
  getCustomerByCpf: jest.fn(),
}));

jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    }),
  },
}));

jest.mock('../../agent/memory', () => ({
  persistThreadCpf: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../agent/identity-verification', () => ({
  isPhoneRegisteredToCpf: jest.fn(),
}));

import { lookupCustomer } from '../../agent/customer-lookup';
import * as sgp from '../../integrations/sgp';
import { persistThreadCpf } from '../../agent/memory';
import { isPhoneRegisteredToCpf } from '../../agent/identity-verification';

const PHONE = '+5585999990000';
const TENANT = 'salesnet-default';
const CUSTOMER = { id: 'c1', name: 'João', document: '04976301338', status: 'active' };

describe('lookupCustomer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isPhoneRegisteredToCpf as jest.Mock).mockResolvedValue(true);
  });

  it('returns customer by phone when found', async () => {
    (sgp.getCustomerByPhone as jest.Mock).mockResolvedValue(CUSTOMER);

    const result = await lookupCustomer({
      whatsappPhone: PHONE,
      tenantId: TENANT,
    });

    expect(result.method).toBe('phone');
    expect(result.phoneLinked).toBe(true);
    expect(result.customer).toEqual(CUSTOMER);
    expect(sgp.getCustomerByCpf).not.toHaveBeenCalled();
    expect(persistThreadCpf).toHaveBeenCalledWith(PHONE, TENANT, CUSTOMER.document);
  });

  it('falls back to CPF when phone lookup fails', async () => {
    (sgp.getCustomerByPhone as jest.Mock).mockRejectedValue(new Error('not found'));
    (sgp.getCustomerByCpf as jest.Mock).mockResolvedValue(CUSTOMER);

    const result = await lookupCustomer({
      whatsappPhone: PHONE,
      tenantId: TENANT,
      cpfFromMessage: '04976301338',
    });

    expect(result.method).toBe('cpf');
    expect(result.phoneLinked).toBe(true);
    expect(result.cpfUsed).toBe('04976301338');
    expect(sgp.getCustomerByCpf).toHaveBeenCalledWith('04976301338', PHONE);
  });

  it('can identify by CPF without persisting the CPF when the WhatsApp phone is not linked', async () => {
    (sgp.getCustomerByPhone as jest.Mock).mockRejectedValue(new Error('not found'));
    (sgp.getCustomerByCpf as jest.Mock).mockResolvedValue(CUSTOMER);
    (isPhoneRegisteredToCpf as jest.Mock).mockResolvedValue(false);

    const result = await lookupCustomer({
      whatsappPhone: PHONE,
      tenantId: TENANT,
      cpfFromMessage: '04976301338',
    });

    expect(result.method).toBe('cpf');
    expect(result.customer).toEqual(CUSTOMER);
    expect(result.phoneLinked).toBe(false);
    expect(isPhoneRegisteredToCpf).toHaveBeenCalledWith(PHONE, '04976301338');
    expect(persistThreadCpf).not.toHaveBeenCalled();
  });

  it('uses CPF from thread when phone fails', async () => {
    (sgp.getCustomerByPhone as jest.Mock).mockRejectedValue(new Error('not found'));
    (sgp.getCustomerByCpf as jest.Mock).mockResolvedValue(CUSTOMER);

    const result = await lookupCustomer({
      whatsappPhone: PHONE,
      tenantId: TENANT,
      cpfFromThread: '04976301338',
    });

    expect(result.method).toBe('cpf');
    expect(sgp.getCustomerByCpf).toHaveBeenCalledWith('04976301338', PHONE);
  });

  it('returns error when all methods fail', async () => {
    (sgp.getCustomerByPhone as jest.Mock).mockRejectedValue(new Error('not found'));
    (sgp.getCustomerByCpf as jest.Mock).mockRejectedValue(new Error('not found'));

    const result = await lookupCustomer({
      whatsappPhone: PHONE,
      tenantId: TENANT,
      cpfFromMessage: '04976301338',
    });

    expect(result.method).toBeNull();
    expect(result.phoneLinked).toBe(false);
    expect(result.customer).toEqual({ error: 'Cliente não encontrado' });
    expect(result.attempts).toContain('phone');
  });
});
