const sendTextMock = jest.fn();
jest.mock('../../services/whatsapp-service', () => ({ whatsappService: { sendText: (...a: unknown[]) => sendTextMock(...a) } }));

const markJobProcessing = jest.fn();
const markJobSent = jest.fn();
const markJobFailed = jest.fn();
jest.mock('../../lib/billing-dispatch-jobs', () => ({ markJobProcessing, markJobSent, markJobFailed }));

import { sendDispatchJob } from '../../services/billing-sender';

beforeEach(() => jest.clearAllMocks());

describe('sendDispatchJob', () => {
  it('marks processing, sends, marks sent on first-try success', async () => {
    sendTextMock.mockResolvedValue({ messageId: 'wamid-1', timestamp: new Date(), status: 'sent' });

    const result = await sendDispatchJob('j1', 'tenant-1', '+5585999990000', 'olá');

    expect(result).toEqual({ status: 'sent', providerMessageId: 'wamid-1' });
    expect(markJobProcessing).toHaveBeenCalledWith('j1');
    expect(markJobSent).toHaveBeenCalledWith('j1', 'olá', 'wamid-1');
    expect(sendTextMock).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds on the 2nd attempt', async () => {
    sendTextMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ messageId: 'wamid-2', timestamp: new Date(), status: 'sent' });

    const result = await sendDispatchJob('j2', 'tenant-1', '+5585999990000', 'olá');

    expect(result).toEqual({ status: 'sent', providerMessageId: 'wamid-2' });
    expect(sendTextMock).toHaveBeenCalledTimes(2);
    expect(markJobFailed).not.toHaveBeenCalled();
  });

  it('marks failed (never leaves job stuck in processing) when every retry fails', async () => {
    sendTextMock.mockRejectedValue(new Error('provider down'));

    const result = await sendDispatchJob('j3', 'tenant-1', '+5585999990000', 'olá');

    expect(result).toEqual({ status: 'failed', error: 'provider down' });
    expect(markJobFailed).toHaveBeenCalledWith('j3', 'provider down');
    expect(markJobSent).not.toHaveBeenCalled();
  });
});
