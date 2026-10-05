import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
import axios from 'axios';

describe('AiSensy integration', () => {
  beforeEach(() => { vi.resetModules(); (axios.post as any).mockReset(); });
  it('normalises Indian numbers and never sends without configuration', async () => {
    const { normalisePhone, sendTemplate, aisensyConfigured } = await import('../integrations/aisensy');
    expect(normalisePhone('98765 43210')).toBe('919876543210');
    expect(normalisePhone('+91 98765-43210')).toBe('919876543210');
    expect(aisensyConfigured()).toBe(false);
    await expect(sendTemplate({ phone: '9876543210', userName: 'A', params: [] })).rejects.toThrow(/not configured/);
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('sends the template through the API campaign and returns the message id', async () => {
    process.env.AISENSY_API_KEY = 'k'; process.env.AISENSY_CAMPAIGN_NAME = 'client_review';
    const { sendTemplate } = await import('../integrations/aisensy');
    (axios.post as any).mockResolvedValue({ data: { submitted_message_id: 'abc123' } });
    const r = await sendTemplate({ phone: '9876543210', userName: 'Meera', params: ['Meera', 'Diwali Reel', 'Final V1', 'https://x/approval/t'] });
    expect(r.messageId).toBe('abc123');
    const [url, body] = (axios.post as any).mock.calls[0];
    expect(url).toMatch(/aisensy/); expect(body.destination).toBe('919876543210'); expect(body.campaignName).toBe('client_review'); expect(body.templateParams).toHaveLength(4); expect(body.buttons).toBeUndefined();
    delete process.env.AISENSY_API_KEY; delete process.env.AISENSY_CAMPAIGN_NAME;
  });
});

describe('Push and Drive are honest about configuration', () => {
  it('push reports DISABLED rather than pretending to deliver', async () => {
    const { sendPush, pushConfigured } = await import('../integrations/push');
    expect(pushConfigured()).toBe(false);
    expect(await sendPush({ endpoint: 'https://example.com', keys: {} }, { title: 't', body: 'b', url: '/' })).toBe('DISABLED');
  });
  it('drive is off without credentials and storage falls back to local', async () => {
    const { driveConfigured } = await import('../integrations/drive');
    const { storageMode } = await import('../services/storage');
    expect(driveConfigured()).toBe(false); expect(storageMode()).toBe('LOCAL');
  });
});

describe('Crypto helpers', () => {
  it('encrypts approval links reversibly only with the right secret', async () => {
    const { encrypt, decrypt, sha256, randomToken } = await import('../utils/crypto');
    const t = randomToken(32); expect(t.length).toBeGreaterThanOrEqual(43);
    const e = encrypt(t, 's1'); expect(e).not.toContain(t); expect(decrypt(e, 's1')).toBe(t);
    expect(() => decrypt(e, 's2')).toThrow(); expect(sha256(t)).toHaveLength(64);
  });
});
