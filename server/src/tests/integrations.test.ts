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
    const { env } = await import('../config/env');
    const oldPub = env.vapid.publicKey; const oldPriv = env.vapid.privateKey;
    env.vapid.publicKey = ''; env.vapid.privateKey = '';
    const { sendPush, pushConfigured } = await import('../integrations/push');
    expect(pushConfigured()).toBe(false);
    expect(await sendPush({ endpoint: 'https://example.com', keys: {} }, { title: 't', body: 'b', url: '/' })).toBe('DISABLED');
    env.vapid.publicKey = oldPub; env.vapid.privateKey = oldPriv;
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

describe('Media MIME inference and safe storage', () => {
  it('infers video and image mime types from filenames when browser passes octet-stream or empty', async () => {
    const { inferMimeType, isVideoMime, isImageMime } = await import('../services/media');
    expect(inferMimeType('scene.mp4', 'application/octet-stream')).toBe('video/mp4');
    expect(inferMimeType('take1.mov', '')).toBe('video/quicktime');
    expect(inferMimeType('master.mkv', 'binary/octet-stream')).toBe('video/x-matroska');
    expect(inferMimeType('thumb.png', 'application/octet-stream')).toBe('image/png');
    expect(inferMimeType('photo.webp', '')).toBe('image/webp');
    expect(inferMimeType('photo.heic', '')).toBe('image/heic');

    expect(isVideoMime('video/mp4')).toBe(true);
    expect(isVideoMime('video/quicktime')).toBe(true);
    expect(isVideoMime('application/x-matroska')).toBe(true);
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('image/jpeg')).toBe(true);
  });
});

describe('AI Content Studio integration', () => {
  it('generates viral script with 5 hooks and scenes even when no API key is provided (fallback mode)', async () => {
    const { generateScriptAssistance, getAiStatus } = await import('../services/ai');
    
    // Check initial status
    const status = await getAiStatus();
    expect(status).toHaveProperty('configured');
    expect(status.provider).toBe('gemini');

    // When no key is set
    const result = await generateScriptAssistance({
      topic: 'Real Estate Investment Secrets',
      niche: 'Real Estate',
      language: 'Gujarati',
      duration: '30s'
    });

    expect(result).toBeDefined();
    expect(result.hooks).toHaveLength(5);
    expect(result.scenes.length).toBeGreaterThanOrEqual(3);
    expect(result.cta).toBeDefined();
    expect(result.fullScriptText).toContain('SCENE');
    expect(result.caption).toBeDefined();
    expect(result.hashtags.length).toBeGreaterThanOrEqual(10);
    expect(result.poweredBy).toBe('template');
  });

  it('generates trending captions and hashtags for approved scripts', async () => {
    const { generateCaptionAssistance } = await import('../services/ai');

    const result = await generateCaptionAssistance({
      title: 'Top 5 Gold Buying Tips for Dhanteras',
      script: 'Check hallmark 916 and always verify making charges before buying.',
      niche: 'Jewelry'
    });

    expect(result.caption).toBeDefined();
    expect(result.hashtags.length).toBeGreaterThanOrEqual(5);
    expect(result.hashtags.some((h: string) => h.includes('#'))).toBe(true);
  });
});
