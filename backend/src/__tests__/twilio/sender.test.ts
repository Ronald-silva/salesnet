jest.mock('../../integrations/twilio/client', () => ({
  twilioClient: {
    messages: {
      create: jest.fn().mockResolvedValue({ sid: 'SM_test_123' }),
    },
  },
}));

jest.mock('../../config/env', () => ({
  env: {
    TWILIO_WHATSAPP_NUMBER: '5585996032957',
    TWILIO_ACCOUNT_SID: 'ACtest',
    TWILIO_AUTH_TOKEN: 'authtest',
    NODE_ENV: 'test',
    PORT: 3001,
    SGP_BASE_URL: 'http://sgp.test',
    SGP_API_TOKEN: 'sgptoken',
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'supabasekey',
    ANTHROPIC_API_KEY: 'anthropickey',
  },
}));

import { sendMessage, sendTemplate, sendMediaMessage } from '../../integrations/twilio/sender';
import { twilioClient } from '../../integrations/twilio/client';

const mockCreate = twilioClient.messages.create as jest.Mock;

describe('sendMessage', () => {
  it('sends with whatsapp: prefix and correct from/to', async () => {
    await sendMessage('5585999990000', 'Olá!');
    expect(mockCreate).toHaveBeenCalledWith({
      from: 'whatsapp:+5585996032957',
      to:   'whatsapp:+5585999990000',
      body: 'Olá!',
    });
  });

  it('normalizes number that already has +55 prefix', async () => {
    await sendMessage('+5585999990000', 'Hi');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'whatsapp:+5585999990000' }),
    );
  });
});

describe('sendTemplate', () => {
  it('sends with contentSid and contentVariables JSON string', async () => {
    await sendTemplate('5585999990000', 'HXabc123', { nome: 'João', valor: 'R$90' });
    expect(mockCreate).toHaveBeenCalledWith({
      from:             'whatsapp:+5585996032957',
      to:               'whatsapp:+5585999990000',
      contentSid:       'HXabc123',
      contentVariables: JSON.stringify({ nome: 'João', valor: 'R$90' }),
    });
  });
});

describe('sendMediaMessage', () => {
  it('sends with body and mediaUrl array', async () => {
    await sendMediaMessage('5585999990000', 'Seu boleto:', 'https://cdn.example.com/boleto.pdf');
    expect(mockCreate).toHaveBeenCalledWith({
      from:     'whatsapp:+5585996032957',
      to:       'whatsapp:+5585999990000',
      body:     'Seu boleto:',
      mediaUrl: ['https://cdn.example.com/boleto.pdf'],
    });
  });
});
