import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { boot, shutdown, app, as, users } from './setup';
import { calculateTotpCode } from '../utils/totp';
import { User } from '../models';

describe('Production Readiness & Security Hardening', () => {
  beforeAll(async () => {
    await boot();
  });

  afterAll(async () => {
    await shutdown();
  });

  describe('Health and Readiness Probes', () => {
    it('/api/health reports process liveness', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UP');
      expect(typeof res.body.uptime).toBe('number');
    });

    it('/api/ready confirms database readiness', async () => {
      const res = await request(app).get('/api/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READY');
      expect(res.body.db).toBe('CONNECTED');
    });
  });

  describe('Account Lockout & Brute Force Protection', () => {
    it('locks account after 5 consecutive failed login attempts', async () => {
      // Create a test user for brute force testing
      const testEmail = 'victim@t.local';
      await User.create({
        name: 'Victim User',
        email: testEmail,
        role: 'EDITOR',
        passwordHash: await import('bcryptjs').then((b) => b.hash('RealSecret123', 4)),
      });

      // 4 failed attempts should return 401 INVALID_CREDENTIALS
      for (let i = 1; i <= 4; i++) {
        const fail = await request(app).post('/api/auth/login').send({
          email: testEmail,
          password: 'WrongPassword',
        });
        expect(fail.status).toBe(401);
        expect(fail.body.error.code).toBe('INVALID_CREDENTIALS');
      }

      // 5th failed attempt should trigger lockout
      const fifth = await request(app).post('/api/auth/login').send({
        email: testEmail,
        password: 'WrongPassword',
      });
      expect(fifth.status).toBe(401);

      // Check DB - lockUntil should now be set in the future
      const u = await User.findOne({ email: testEmail });
      expect(u?.failedLoginAttempts).toBe(5);
      expect(u?.lockUntil).toBeDefined();
      expect(u!.lockUntil!.getTime()).toBeGreaterThan(Date.now());

      // 6th attempt (even with the correct password!) must now be rejected with 429 ACCOUNT_LOCKED
      const blocked = await request(app).post('/api/auth/login').send({
        email: testEmail,
        password: 'RealSecret123',
      });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('ACCOUNT_LOCKED');

      // Clear lockout manually to simulate expiry
      await User.updateOne({ email: testEmail }, { $unset: { lockUntil: 1 }, failedLoginAttempts: 0 });

      // Correct password now succeeds and resets attempts
      const ok = await request(app).post('/api/auth/login').send({
        email: testEmail,
        password: 'RealSecret123',
      });
      expect(ok.status).toBe(200);
      expect(ok.body.accessToken).toBeDefined();

      const freshUser = await User.findOne({ email: testEmail });
      expect(freshUser?.failedLoginAttempts).toBe(0);
    });
  });

  describe('Active Sessions & Device Management', () => {
    it('lists active sessions and allows revoking individual or other sessions', async () => {
      // Login as rahul
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestBrowser/1.0')
        .send({ email: 'rahul@t.local', password: 'Password@1' });

      expect(loginRes.status).toBe(200);
      const cookie = loginRes.headers['set-cookie'];
      expect(cookie).toBeDefined();

      // List active sessions
      const sessionsRes = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .set('Cookie', cookie);

      expect(sessionsRes.status).toBe(200);
      expect(Array.isArray(sessionsRes.body)).toBe(true);
      expect(sessionsRes.body.length).toBeGreaterThan(0);

      const currentSession = sessionsRes.body.find((s: any) => s.current);
      expect(currentSession).toBeDefined();
      expect(currentSession.userAgent).toContain('TestBrowser');

      // Revoke all other sessions
      const revokeOthers = await request(app)
        .post('/api/auth/sessions/revoke-others')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .set('Cookie', cookie);

      expect(revokeOthers.status).toBe(200);
      expect(revokeOthers.body.ok).toBe(true);
    });
  });

  describe('Two-Factor Authentication (TOTP MFA)', () => {
    let totpSecret = '';
    let backupCodes: string[] = [];

    it('sets up, enables, and challenges MFA on login', async () => {
      // 1. Setup MFA
      const setup = await as('pooja').post('/api/auth/mfa/setup');
      expect(setup.status).toBe(200);
      expect(setup.body.secret).toBeDefined();
      expect(setup.body.otpAuthUri).toContain('otpauth://totp/');
      totpSecret = setup.body.secret;

      // 2. Attempt enable with invalid code -> should fail
      const badEnable = await as('pooja').post('/api/auth/mfa/enable', {
        secret: totpSecret,
        code: '000000',
      });
      expect(badEnable.status).toBe(400);

      // 3. Enable with valid code
      const validCode = calculateTotpCode(totpSecret);
      const enable = await as('pooja').post('/api/auth/mfa/enable', {
        secret: totpSecret,
        code: validCode,
      });
      expect(enable.status).toBe(200);
      expect(enable.body.ok).toBe(true);
      expect(enable.body.backupCodes).toHaveLength(8);
      backupCodes = enable.body.backupCodes;

      // 4. Try logging in as pooja now: should receive MFA challenge
      const loginAttempt = await request(app).post('/api/auth/login').send({
        email: 'pooja@t.local',
        password: 'Password@1',
      });
      expect(loginAttempt.status).toBe(200);
      expect(loginAttempt.body.mfaRequired).toBe(true);
      expect(loginAttempt.body.mfaToken).toBeDefined();
      const mfaToken = loginAttempt.body.mfaToken;

      // 5. Verify MFA challenge with current TOTP code
      const currentCode = calculateTotpCode(totpSecret);
      const verifyMfa = await request(app).post('/api/auth/mfa/verify-login').send({
        mfaToken,
        code: currentCode,
      });
      expect(verifyMfa.status).toBe(200);
      expect(verifyMfa.body.accessToken).toBeDefined();
      expect(verifyMfa.body.user.mfaEnabled).toBe(true);

      // 6. Test backup code single-use recovery
      const loginAttempt2 = await request(app).post('/api/auth/login').send({
        email: 'pooja@t.local',
        password: 'Password@1',
      });
      const usedBackupCode = backupCodes[0];
      const backupVerify = await request(app).post('/api/auth/mfa/verify-login').send({
        mfaToken: loginAttempt2.body.mfaToken,
        code: usedBackupCode,
      });
      expect(backupVerify.status).toBe(200);
      expect(backupVerify.body.accessToken).toBeDefined();

      // Attempting to reuse the same backup code must now fail
      const loginAttempt3 = await request(app).post('/api/auth/login').send({
        email: 'pooja@t.local',
        password: 'Password@1',
      });
      const reuseFail = await request(app).post('/api/auth/mfa/verify-login').send({
        mfaToken: loginAttempt3.body.mfaToken,
        code: usedBackupCode,
      });
      expect(reuseFail.status).toBe(401);
    });
  });

  describe('Super Admin System Health Monitoring', () => {
    it('allows Super Admin to view system health and blocks regular members', async () => {
      // Super admin can access
      const adminRes = await as('nayan').get('/api/system-health');
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.status).toBe('HEALTHY');
      expect(adminRes.body.database.connected).toBe(true);
      expect(adminRes.body.counts.users).toBeGreaterThan(0);
      expect(adminRes.body.memory.rssMb).toBeGreaterThan(0);

      // Regular editor cannot access
      const editorRes = await as('rahul').get('/api/system-health');
      expect(editorRes.status).toBe(403);
    });
  });
});
