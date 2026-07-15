import { sgpClient } from '../../../integrations/sgp/client';
import { getCustomerByCpf, getCustomerByPhone, getContratoPhonesByCpf, SgpSchemaMismatchError } from '../../../integrations/sgp/customers';
import { ContratoSchema } from '../../../integrations/sgp/types';
import realShapeResponse from './fixtures/consultacliente-response.json';

/**
 * Contract test against a payload shaped like real production SGP responses
 * (see diagnostic 2026-07-05): `telefones`/`emails` are arrays of objects
 * ({ tipoContato, contato, inscricoes }), not arrays of strings.
 *
 * Only sgpClient.post is mocked here — ContratoSchema.parse() runs for real,
 * unlike customer-lookup.test.ts which mocks the whole `sgp` module and would
 * never have caught this regression.
 */
describe('SGP customers — contract test with real-shaped payload', () => {
  const postSpy = jest.spyOn(sgpClient, 'post');

  afterEach(() => {
    postSpy.mockReset();
  });

  it('parses a contrato whose telefones/emails are arrays of objects', async () => {
    postSpy.mockResolvedValue({ data: realShapeResponse });

    const customer = await getCustomerByCpf('11144477735');

    expect(customer.id).toBe('41');
    expect(customer.name).toBe('CLIENTE FAKE');
    expect(customer.status).toBe('active');
    expect(customer.phone).toBe('+5585900000000');
  });

  it('also parses correctly via the phone lookup path', async () => {
    postSpy.mockResolvedValue({ data: realShapeResponse });

    const customer = await getCustomerByPhone('+5585900000000');

    expect(customer.id).toBe('41');
    expect(customer.document).toBe('11144477735');
  });

  it('sends the CPF under the `cpfcnpj` key — SGP silently ignores `cpf` and returns no contratos', async () => {
    postSpy.mockResolvedValue({ data: realShapeResponse });

    await getCustomerByCpf('11144477735');

    const [, body] = postSpy.mock.calls[0]!;
    expect(String(body)).toContain('cpfcnpj=11144477735');
    expect(String(body)).not.toMatch(/cpf=/);
  });

  it('throws SgpSchemaMismatchError (not a generic "not found") when every contrato fails to parse', async () => {
    postSpy.mockResolvedValue({
      data: { contratos: [{ contratoId: 'not-a-number', clienteId: 1 }] },
    });

    await expect(getCustomerByCpf('11144477735')).rejects.toThrow(SgpSchemaMismatchError);
  });

  it('throws the plain "not found" error when SGP genuinely returns no contratos', async () => {
    postSpy.mockResolvedValue({ data: { contratos: [] } });

    await expect(getCustomerByCpf('11144477735')).rejects.toThrow('não encontrado');
    await expect(getCustomerByCpf('11144477735')).rejects.not.toThrow(SgpSchemaMismatchError);
  });

  it('getContratoPhonesByCpf resolves E.164 phones from the real telefones-as-objects shape', async () => {
    postSpy.mockResolvedValue({ data: realShapeResponse });

    const phones = await getContratoPhonesByCpf('11144477735');

    expect(phones).toEqual(['+5585900000000']);
  });

  it('exposes the raw SGP clienteId, distinct from contratoId', async () => {
    postSpy.mockResolvedValue({ data: realShapeResponse });

    const customer = await getCustomerByCpf('11144477735');

    expect(customer.id).toBe('41'); // contratoId
    expect(customer.sgpClienteId).toBe('900001'); // clienteId — pessoa distinta do contrato
  });

  it('never logs contratoCentralLogin/contratoCentralSenha when a malformed contrato fails to parse', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // A contrato that fails ContratoSchema (bad contratoId) but still carries real
    // portal credentials — exactly the shape a live SGP schema mismatch would produce.
    postSpy.mockResolvedValue({
      data: {
        contratos: [{
          contratoId: 'not-a-number',
          clienteId: 1,
          contratoCentralLogin: 'joao.silva',
          contratoCentralSenha: 'super-secreta',
        }],
      },
    });

    await expect(getCustomerByCpf('11144477735')).rejects.toThrow(SgpSchemaMismatchError);

    const logged = errorSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(logged).not.toContain('joao.silva');
    expect(logged).not.toContain('super-secreta');
    expect(logged).not.toContain('contratoCentralLogin');
    expect(logged).not.toContain('contratoCentralSenha');

    errorSpy.mockRestore();
  });
});

describe('ContratoSchema — silent-fallback fields must log when triggered', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('logs and defaults to 0 when contratoStatus arrives malformed (would otherwise silently read as suspended)', () => {
    const raw = { ...realShapeResponse.contratos[0], contratoStatus: 'not-a-number' };

    const parsed = ContratoSchema.parse(raw);

    expect(parsed.contratoStatus).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ContratoSchema field 'contratoStatus' fell back to default"),
      expect.anything(),
      '| raw:',
      expect.anything(),
    );
  });

  it('logs and defaults to [] when a single telefone entry is malformed (would otherwise silently drop all phones)', () => {
    const raw = {
      ...realShapeResponse.contratos[0],
      telefones: [{ tipoContato: 'Celular Pessoal', contato: null }],
    };

    const parsed = ContratoSchema.parse(raw);

    expect(parsed.telefones).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ContratoSchema field 'telefones' fell back to default"),
      expect.anything(),
      '| raw:',
      expect.anything(),
    );
  });

  it('does not log when contratoStatus and telefones are well-formed', () => {
    ContratoSchema.parse(realShapeResponse.contratos[0]);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
