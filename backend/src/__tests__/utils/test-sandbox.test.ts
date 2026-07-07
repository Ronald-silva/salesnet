const mockEnv: { TEST_SANDBOX_PHONE?: string } = {};

jest.mock('../../config/env', () => ({
  env: mockEnv,
}));

import { assertSandboxNumber } from '../../utils/test-sandbox';

beforeEach(() => {
  mockEnv.TEST_SANDBOX_PHONE = undefined;
});

describe('assertSandboxNumber', () => {
  it('throws when TEST_SANDBOX_PHONE is not configured', () => {
    expect(() => assertSandboxNumber('+5585999990000')).toThrow(/TEST_SANDBOX_PHONE não configurado/);
  });

  it('throws when phone does not match the configured sandbox number', () => {
    mockEnv.TEST_SANDBOX_PHONE = '+5585900000000';
    expect(() => assertSandboxNumber('+5585999990000')).toThrow(/não é o número sandbox configurado/);
  });

  it('does not throw when phone matches the configured sandbox number', () => {
    mockEnv.TEST_SANDBOX_PHONE = '+5585900000000';
    expect(() => assertSandboxNumber('+5585900000000')).not.toThrow();
  });

  it('normalizes format before comparing (digits only vs E.164)', () => {
    mockEnv.TEST_SANDBOX_PHONE = '5585900000000';
    expect(() => assertSandboxNumber('+5585900000000')).not.toThrow();
  });

  it('rejects a real-looking number even if it happens to share a prefix', () => {
    mockEnv.TEST_SANDBOX_PHONE = '+5585900000000';
    expect(() => assertSandboxNumber('+558591993833')).toThrow();
  });
});
