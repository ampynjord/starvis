/**
 * POST /auth/register  — créer un compte
 * POST /auth/login     — se connecter
 * GET  /auth/me        — récupérer l'utilisateur courant (via Bearer token)
 * PUT  /auth/me        — modifier son profil
 */
import type { NextFunction, Request, Response, Router } from 'express';
import { AuthService } from '../services/auth-service.js';
import type { RouteDependencies } from './types.js';

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function requireAuth(authService: AuthService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) return void res.status(401).json({ success: false, error: 'Authentication required' });
    try {
      (req as any).jwtPayload = authService.verifyToken(token);
      next();
    } catch {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
  };
}

export function mountAuthRoutes(router: Router, deps: RouteDependencies): void {
  if (!process.env.JWT_SECRET) return;

  const authService = new AuthService(deps.prisma);

  // POST /auth/register
  router.post('/auth/register', async (req, res) => {
    const { email, username, password } = req.body ?? {};
    if (!email || !username || !password) {
      return void res.status(400).json({ success: false, error: 'email, username and password are required' });
    }
    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}$/;
    if (typeof password !== 'string' || !strongPassword.test(password)) {
      return void res.status(400).json({ success: false, error: 'Password must be 8+ chars with uppercase, lowercase, digit and special character' });
    }
    if (typeof username !== 'string' || username.length < 3 || username.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
      return void res.status(400).json({ success: false, error: 'Username must be 3-50 chars, letters/numbers/_ only' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
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
  router.get('/auth/me', requireAuth(authService), async (req, res) => {
    const payload = (req as any).jwtPayload;
    const user = await authService.me(payload.sub);
    if (!user) return void res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user });
  });

  // PUT /auth/me
  router.put('/auth/me', requireAuth(authService), async (req, res) => {
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
}
