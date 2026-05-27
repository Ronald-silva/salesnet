import { formatOutgoingWhatsApp } from '../../agent/sanitize';

describe('formatOutgoingWhatsApp', () => {
  it('strips single and double asterisk markdown', () => {
    expect(formatOutgoingWhatsApp('Meu nome é *Sofia*, da *SalesNet*')).toBe(
      'Meu nome é Sofia, da SalesNet',
    );
    expect(formatOutgoingWhatsApp('Plano **500 Mega**')).toBe('Plano 500 Mega');
  });
});
