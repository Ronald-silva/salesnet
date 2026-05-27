import { classifySession } from '../../agent/session-classifier';

const activeCustomer = { status: 'active', plan: { downloadMbps: 30 } };
const suspendedCustomer = { status: 'suspended', plan: { downloadMbps: 50 } };
const notFound = { error: 'Cliente não encontrado' };

describe('classifySession — billing mode', () => {
  it('returns billing when customer is suspended', () => {
    expect(classifySession('oi', suspendedCustomer, 'open')).toBe('billing');
  });
  it('returns billing when invoice is overdue', () => {
    expect(classifySession('quero pagar', activeCustomer, 'overdue')).toBe('billing');
  });
  it('returns billing when message mentions pagamento', () => {
    expect(classifySession('como faço pra pagar a fatura?', activeCustomer, 'open')).toBe('billing');
  });
  it('returns billing when message mentions corte', () => {
    expect(classifySession('minha internet foi cortada', activeCustomer, 'open')).toBe('billing');
  });
});

describe('classifySession — support mode', () => {
  it('returns support when message mentions lentidão', () => {
    expect(classifySession('internet lenta demais', activeCustomer, 'open')).toBe('support');
  });
  it('returns support when message mentions queda', () => {
    expect(classifySession('caiu a internet', activeCustomer, 'open')).toBe('support');
  });
  it('returns support when message mentions técnico', () => {
    expect(classifySession('preciso de um técnico', activeCustomer, 'open')).toBe('support');
  });
  it('returns support when message mentions não conecta', () => {
    expect(classifySession('não estou conseguindo conectar', activeCustomer, 'open')).toBe('support');
  });
});

describe('classifySession — commercial mode', () => {
  it('returns commercial for low-plan customer complaining about speed', () => {
    expect(classifySession('tá muito lento pra videochamada', activeCustomer, 'open')).toBe('commercial');
  });
  it('does NOT return commercial for high-plan customer', () => {
    const highPlan = { status: 'active', plan: { downloadMbps: 100 } };
    expect(classifySession('tá muito lento pra videochamada', highPlan, 'open')).toBe('support');
  });
});

describe('classifySession — default', () => {
  it('returns default for generic greeting', () => {
    expect(classifySession('oi bom dia', activeCustomer, 'open')).toBe('default');
  });
  it('returns default for existing customer asking about own plan', () => {
    expect(classifySession('queria entender meu plano', activeCustomer, 'open')).toBe('default');
  });
  it('returns default when customer not found', () => {
    expect(classifySession('oi', notFound, undefined)).toBe('default');
  });
  it('returns prospect when not found and explicit contract intent exists', () => {
    expect(classifySession('quero contratar internet', notFound, undefined)).toBe('prospect');
  });
});
