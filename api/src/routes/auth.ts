/**
 * POST /auth/register         — créer un compte
 * POST /auth/login            — se connecter
 * GET  /auth/me               — profil courant (Bearer)
 * PUT  /auth/me               — modifier son profil (Bearer)
 * POST /auth/api-token        — générer un token longue durée (Bearer, pour projets externes)
 *
 * Admin (Bearer role=admin ou X-Api-Key) :
 * GET  /admin/users           — liste des utilisateurs
 * PUT  /admin/users/:id/role  — modifier le rôle d'un utilisateur
 */
import type { Router } from 'express';
import { requireJwt, requireJwtAdmin } from '../middleware/index.js';
import { AuthService } from '../services/auth-service.js';
import type { RouteDependencies } from './types.js';

export function mountAuthRoutes(router: Router, deps: RouteDependencies): void {
  if (!process.env.JWT_SECRET) return;

  const authService = new AuthService(deps.prisma);

  // ── Authentification ───────────────────────────────────────────────────────

  // POST /auth/register
  router.post('/auth/register', async (req, res) => {
    const { email, username, password } = req.body ?? {};
    if (!email || !username || !password) {
      return void res.status(400).json({ success: false, error: 'email, username and password are required' });
    }
    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}$/;
    if (typeof password !== 'string' || !strongPassword.test(password)) {
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
      res.status(201).json({ success: true, ...result });
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
      res.json({ success: true, ...result });
    } catch (e: any) {
      if (e.message === 'INVALID_CREDENTIALS') return void res.status(401).json({ success: false, error: 'Invalid credentials' });
      res.status(500).json({ success: false, error: 'Login failed' });
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

  // ── API Token (accès projets externes) ────────────────────────────────────
  // POST /auth/api-token — génère un JWT longue durée (1 an)
  router.post('/auth/api-token', requireJwt, async (req, res) => {
    const payload = (req as any).jwtPayload;
    const user = await authService.me(payload.sub);
    if (!user) return void res.status(404).json({ success: false, error: 'User not found' });
    const token = authService.generateApiToken(user);
    res.json({ success: true, token, expiresIn: '1y', note: 'Store this token securely — it will not be shown again.' });
  });

  // ── Admin : gestion des utilisateurs ─────────────────────────────────────

  // GET /admin/users
  router.get('/admin/users', requireJwtAdmin, async (_req, res) => {
    try {
      const users = await authService.listUsers();
      res.json({ success: true, data: users });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
  });

  // PUT /admin/users/:id/role
  router.put('/admin/users/:id/role', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return void res.status(400).json({ success: false, error: 'Invalid user id' });
    }
    const { role } = req.body ?? {};
    if (!['user', 'beta_tester', 'admin'].includes(role)) {
      return void res.status(400).json({ success: false, error: 'role must be "user", "beta_tester" or "admin"' });
    }
    try {
      const user = await authService.setRole(id, role);
      res.json({ success: true, user });
    } catch (e: any) {
      if (e?.code === 'P2025') return void res.status(404).json({ success: false, error: 'User not found' });
      res.status(500).json({ success: false, error: 'Failed to update role' });
    }
  });

  // PUT /admin/users/:id — modifier email / username / avatarUrl
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

  // POST /admin/users/:id/reset-password
  router.post('/admin/users/:id/reset-password', requireJwtAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { password } = req.body ?? {};
    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}$/;
    if (typeof password !== 'string' || !strongPassword.test(password)) {
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

  // DELETE /admin/users/:id
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

  // POST /admin/users — créer un utilisateur (admin bypass)
  router.post('/admin/users', requireJwtAdmin, async (req, res) => {
    const { email, username, password, role } = req.body ?? {};
    if (!email || !username || !password) {
      return void res.status(400).json({ success: false, error: 'email, username and password are required' });
    }
    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}$/;
    if (typeof password !== 'string' || !strongPassword.test(password)) {
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
    const assignedRole = ['user', 'beta_tester', 'admin'].includes(role) ? role : 'user';
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
