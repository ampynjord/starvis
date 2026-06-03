/**
 * POST /auth/register         — create an account (sends verification email)
 * POST /auth/login            — sign in
 * POST /auth/verify-email     — verify email with token
 * POST /auth/forgot-password  — request password reset email
 * POST /auth/reset-password   — reset password with token
 * GET  /auth/me               — current profile (Bearer)
 * PUT  /auth/me               — update own profile (Bearer)
 * POST /auth/api-token        — generate a long-lived token (Bearer, developer+ only)
 * POST /auth/2fa/setup        — generate TOTP secret + QR code (Bearer)
 * POST /auth/2fa/enable       — enable 2FA with TOTP code (Bearer)
 * POST /auth/2fa/disable      — disable 2FA with TOTP code (Bearer)
 * POST /auth/2fa/verify       — verify TOTP during login (pendingToken + code)
 *
 * Admin (Bearer role=admin or X-Api-Key):
 * GET  /admin/users           — list users
 * PUT  /admin/users/:id/role  — update a user's role
 */
import type { Router } from 'express';
import { requireJwt, requireJwtAdmin, requireJwtBetaOrAdmin } from '../middleware/index.js';
import { AuthService } from '../services/auth-service.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/email-service.js';
import { USER_ROLE, USER_ROLES } from '../utils/config.js';
import type { RouteDependencies } from './types.js';

const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}$/;

export function mountAuthRoutes(router: Router, deps: RouteDependencies): void {
  if (!process.env.JWT_SECRET) return;

  const authService = new AuthService(deps.prisma);

  // ── Authentication ────────────────────────────────────────────────────────

  // POST /auth/register
  router.post('/auth/register', async (req, res) => {
    const { email, username, password } = req.body ?? {};
    if (!email || !username || !password) {
      return void res.status(400).json({ success: false, error: 'email, username and password are required' });
    }
    if (typeof password !== 'string' || !STRONG_PASSWORD.test(password)) {
      return void res
        .status(400)
        .json({ success: false, error: 'Password must be 8+ chars with uppercase, lowercase, digit and special character' });
    }
    if (typeof username !== 'string' || username.length < 3 || username.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
      return void res.status(400).json({ success: false, error: 'Username must be 3-50 chars, letters/numbers/_ only' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return void res.status(400).json({ success: false, error: 'Invalid email address' });
    }
    try {
      const result = await authService.register(email, username, password);
      // Fire-and-forget verification email
      const vtInfo = await authService.getVerificationToken(result.email);
      if (vtInfo) {
        sendVerificationEmail(result.email, vtInfo.username, vtInfo.token).catch(() => {});
      }
      res.status(201).json({ success: true, requiresVerification: true });
    } catch (e: any) {
      if (e.message === 'EMAIL_TAKEN') return void res.status(409).json({ success: false, error: 'Email already in use' });
      if (e.message === 'USERNAME_TAKEN') return void res.status(409).json({ success: false, error: 'Username already taken' });
      res.status(500).json({ success: false, error: 'Registration failed' });
    }
  });

  // POST /auth/login
  router.post('/auth/login', async (req, res) => {
    const { emailOrUsername, password } = req.body ?? {};
    if (!emailOrUsername || !password) {
      return void res.status(400).json({ success: false, error: 'emailOrUsername and password are required' });
    }
    try {
      const result = await authService.login(emailOrUsername, password);
      if ('requires2FA' in result) {
        return void res.json({ success: true, requires2FA: true, pendingToken: result.pendingToken });
      }
      res.json({ success: true, token: result.token, user: result.user });
    } catch (e: any) {
      if (e.message === 'INVALID_CREDENTIALS') return void res.status(401).json({ success: false, error: 'Invalid credentials' });
      if (e.message === 'EMAIL_NOT_VERIFIED') {
        return void res.status(403).json({ success: false, error: 'EMAIL_NOT_VERIFIED', emailNotVerified: true });
      }
      res.status(500).json({ success: false, error: 'Login failed' });
    }
  });

  // POST /auth/verify-email
  router.post('/auth/verify-email', async (req, res) => {
    const { token } = req.body ?? {};
    if (!token || typeof token !== 'string') {
      return void res.status(400).json({ success: false, error: 'token is required' });
    }
    try {
      const result = await authService.verifyEmail(token);
      res.json({ success: true, token: result.token, user: result.user });
    } catch (e: any) {
      if (e.message === 'INVALID_TOKEN')
        return void res.status(400).json({ success: false, error: 'Invalid or expired verification token' });
      res.status(500).json({ success: false, error: 'Email verification failed' });
    }
  });

  // POST /auth/forgot-password
  router.post('/auth/forgot-password', async (req, res) => {
    const { email } = req.body ?? {};
    if (!email || typeof email !== 'string') {
      return void res.status(400).json({ success: false, error: 'email is required' });
    }
    try {
      const info = await authService.requestPasswordReset(email);
      // Always return success to avoid email enumeration
      if (info) {
        sendPasswordResetEmail(email.toLowerCase().trim(), info.username, info.token).catch(() => {});
      }
      res.json({ success: true, message: 'If your email exists, a reset link has been sent.' });
    } catch {
      res.json({ success: true, message: 'If your email exists, a reset link has been sent.' });
    }
  });

  // POST /auth/reset-password
  router.post('/auth/reset-password', async (req, res) => {
    const { token, password } = req.body ?? {};
    if (!token || typeof token !== 'string') {
      return void res.status(400).json({ success: false, error: 'token is required' });
    }
    if (typeof password !== 'string' || !STRONG_PASSWORD.test(password)) {
      return void res
        .status(400)
        .json({ success: false, error: 'Password must be 8+ chars with uppercase, lowercase, digit and special character' });
    }
    try {
      await authService.resetPassword(token, password);
      res.json({ success: true });
    } catch (e: any) {
      if (e.message === 'INVALID_TOKEN') return void res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
      if (e.message === 'TOKEN_EXPIRED') return void res.status(400).json({ success: false, error: 'Reset token has expired' });
      res.status(500).json({ success: false, error: 'Password reset failed' });
    }
  });

  // GET /auth/me
  router.get('/auth/me', requireJwt, async (req, res) => {
    const payload = (req as any).jwtPayload;
    const user = await authService.me(payload.sub);
    if (!user) return void res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user });
  });

  // PUT /auth/me
  router.put('/auth/me', requireJwt, async (req, res) => {
    const payload = (req as any).jwtPayload;
    const { username, avatarUrl } = req.body ?? {};
    try {
      const user = await authService.updateProfile(payload.sub, {
        username: typeof username === 'string' ? username : undefined,
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined,
      });
      res.json({ success: true, user });
    } catch {
      res.status(500).json({ success: false, error: 'Profile update failed' });
    }
  });

  // DELETE /auth/me — delete own account
  router.delete('/auth/me', requireJwt, async (req, res) => {
    const payload = (req as any).jwtPayload;
    try {
      await authService.deleteUser(payload.sub);
      res.json({ success: true });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'User not found' });
      res.status(500).json({ success: false, error: 'Account deletion failed' });
    }
  });

  // ── API Token (external project access) ──────────────────────────────────
  router.post('/auth/api-token', requireJwtBetaOrAdmin, async (req, res) => {
    const payload = (req as any).jwtPayload;
    const user = await authService.me(payload.sub);
    if (!user) return void res.status(404).json({ success: false, error: 'User not found' });
    const token = authService.generateApiToken(user);
    res.json({ success: true, token, expiresIn: '1y', note: 'Store this token securely — it will not be shown again.' });
  });

  // ── 2FA endpoints ─────────────────────────────────────────────────────────

  // POST /auth/2fa/setup
  router.post('/auth/2fa/setup', requireJwt, async (req, res) => {
    const payload = (req as any).jwtPayload;
    try {
      const result = await authService.setup2FA(payload.sub);
      res.json({ success: true, ...result });
    } catch {
      res.status(500).json({ success: false, error: '2FA setup failed' });
    }
  });

  // POST /auth/2fa/enable
  router.post('/auth/2fa/enable', requireJwt, async (req, res) => {
    const payload = (req as any).jwtPayload;
    const { code } = req.body ?? {};
    if (typeof code !== 'string' || code.length !== 6) {
      return void res.status(400).json({ success: false, error: '6-digit code required' });
    }
    try {
      await authService.enable2FA(payload.sub, code);
      res.json({ success: true });
    } catch (e: any) {
      if (e.message === 'INVALID_2FA_CODE') return void res.status(400).json({ success: false, error: 'Invalid authentication code' });
      if (e.message === '2FA_NOT_SETUP')
        return void res.status(400).json({ success: false, error: '2FA not configured — call /auth/2fa/setup first' });
      res.status(500).json({ success: false, error: '2FA activation failed' });
    }
  });

  // POST /auth/2fa/disable
  router.post('/auth/2fa/disable', requireJwt, async (req, res) => {
    const payload = (req as any).jwtPayload;
    const { code } = req.body ?? {};
    if (typeof code !== 'string' || code.length !== 6) {
      return void res.status(400).json({ success: false, error: '6-digit code required' });
    }
    try {
      await authService.disable2FA(payload.sub, code);
      res.json({ success: true });
    } catch (e: any) {
      if (e.message === 'INVALID_2FA_CODE') return void res.status(400).json({ success: false, error: 'Invalid authentication code' });
      if (e.message === '2FA_NOT_ENABLED') return void res.status(400).json({ success: false, error: '2FA is not currently enabled' });
      res.status(500).json({ success: false, error: '2FA deactivation failed' });
    }
  });

  // POST /auth/2fa/verify
  router.post('/auth/2fa/verify', async (req, res) => {
    const { pendingToken, code } = req.body ?? {};
    if (!pendingToken || typeof pendingToken !== 'string') {
      return void res.status(400).json({ success: false, error: 'pendingToken is required' });
    }
    if (typeof code !== 'string' || code.length !== 6) {
      return void res.status(400).json({ success: false, error: '6-digit code required' });
    }
    try {
      const result = await authService.verify2FA(pendingToken, code);
      res.json({ success: true, token: result.token, user: result.user });
    } catch (e: any) {
      if (e.message === 'INVALID_2FA_CODE') return void res.status(400).json({ success: false, error: 'Invalid authentication code' });
      if (e.message === 'INVALID_TOKEN')
        return void res.status(400).json({ success: false, error: 'Session expired — please log in again' });
      res.status(500).json({ success: false, error: '2FA verification failed' });
    }
  });

  // ── Admin: user management ───────────────────────────────────────────────

  router.get('/admin/users', requireJwtAdmin, async (_req, res) => {
    try {
      const users = await authService.listUsers();
      res.json({ success: true, data: users });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
  });

  router.put('/admin/users/:id/role', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return void res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    const { role } = req.body ?? {};
    if (!USER_ROLES.includes(role)) {
      return void res.status(400).json({ success: false, error: 'role must be "user", "developer" or "admin"' });
    }
    try {
      const user = await authService.setRole(id, role);
      res.json({ success: true, user });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'User not found' });
      res.status(500).json({ success: false, error: 'Failed to update role' });
    }
  });

  router.put('/admin/users/:id', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { username, email, avatarUrl } = req.body ?? {};
    if (
      username !== undefined &&
      (typeof username !== 'string' || username.length < 3 || username.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(username))
    ) {
      return void res.status(400).json({ success: false, error: 'Invalid username' });
    }
    if (email !== undefined && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return void res.status(400).json({ success: false, error: 'Invalid email' });
    }
    try {
      const user = await authService.adminUpdateUser(id, {
        username: typeof username === 'string' ? username : undefined,
        email: typeof email === 'string' ? email : undefined,
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined,
      });
      res.json({ success: true, user });
    } catch (e: any) {
      if (e.code === 'P2002') return void res.status(409).json({ success: false, error: 'Email or username already taken' });
      res.status(500).json({ success: false, error: 'Update failed' });
    }
  });

  router.post('/admin/users/:id/reset-password', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { password } = req.body ?? {};
    if (typeof password !== 'string' || !STRONG_PASSWORD.test(password)) {
      return void res
        .status(400)
        .json({ success: false, error: 'Password must be 8+ chars with uppercase, lowercase, digit and special character' });
    }
    try {
      await authService.adminResetPassword(id, password);
      res.json({ success: true });
    } catch {
      res.status(500).json({ success: false, error: 'Password reset failed' });
    }
  });

  router.delete('/admin/users/:id', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const requesterId = (req as any).jwtPayload?.sub;
    if (requesterId === id) {
      return void res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }
    try {
      await authService.deleteUser(id);
      res.json({ success: true });
    } catch (e: any) {
      if (e.code === 'P2025') return void res.status(404).json({ success: false, error: 'User not found' });
      res.status(500).json({ success: false, error: 'Deletion failed' });
    }
  });

  router.post('/admin/users', requireJwtAdmin, async (req, res) => {
    const { email, username, password, role } = req.body ?? {};
    if (!email || !username || !password) {
      return void res.status(400).json({ success: false, error: 'email, username and password are required' });
    }
    if (typeof password !== 'string' || !STRONG_PASSWORD.test(password)) {
      return void res
        .status(400)
        .json({ success: false, error: 'Password must be 8+ chars with uppercase, lowercase, digit and special character' });
    }
    if (typeof username !== 'string' || username.length < 3 || username.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
      return void res.status(400).json({ success: false, error: 'Invalid username' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return void res.status(400).json({ success: false, error: 'Invalid email address' });
    }
    const assignedRole = USER_ROLES.includes(role) ? role : USER_ROLE;
    try {
      const user = await authService.adminCreateUser(email, username, password, assignedRole);
      res.status(201).json({ success: true, user });
    } catch (e: any) {
      if (e.message === 'EMAIL_TAKEN') return void res.status(409).json({ success: false, error: 'Email already in use' });
      if (e.message === 'USERNAME_TAKEN') return void res.status(409).json({ success: false, error: 'Username already taken' });
      res.status(500).json({ success: false, error: 'Creation failed' });
    }
  });
}
