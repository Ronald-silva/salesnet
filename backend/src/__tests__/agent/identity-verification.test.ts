jest.mock('../../integrations/sgp', () => ({
  getContratoPhonesByCpf: jest.fn(),
}));

import { isPhoneRegisteredToCpf } from '../../agent/identity-verification';
import * as sgp from '../../integrations/sgp';

describe('isPhoneRegisteredToCpf', () => {
  it('returns true when the phone is among the CPF\'s registered SGP phones', async () => {
    (sgp.getContratoPhonesByCpf as jest.Mock).mockResolvedValue(['+5585999990000', '+5585988887777']);

    await expect(isPhoneRegisteredToCpf('+5585999990000', '04976301338')).resolves.toBe(true);
  });

  it('matches regardless of phone formatting (normalizes before comparing)', async () => {
    (sgp.getContratoPhonesByCpf as jest.Mock).mockResolvedValue(['+5585999990000']);

    await expect(isPhoneRegisteredToCpf('85999990000', '04976301338')).resolves.toBe(true);
  });

  it('returns false when the phone is not among the CPF\'s registered phones', async () => {
    (sgp.getContratoPhonesByCpf as jest.Mock).mockResolvedValue(['+5585997761756']);

    await expect(isPhoneRegisteredToCpf('+558591993833', '62147824399')).resolves.toBe(false);
  });

  it('fails closed (returns false) when the SGP lookup throws', async () => {
    (sgp.getContratoPhonesByCpf as jest.Mock).mockRejectedValue(new Error('SGP timeout'));

    await expect(isPhoneRegisteredToCpf('+5585999990000', '04976301338')).resolves.toBe(false);
  });
});
