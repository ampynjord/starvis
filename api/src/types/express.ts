import type { JwtPayload } from '../services/auth-service.js';

declare global {
  namespace Express {
    interface Request {
      jwtPayload: JwtPayload;
      authMethod?: 'admin_key' | 'api_token' | 'session' | 'unknown';
      internalClient?: string;
      apiToken?: {
        id: number;
        jti: string;
        name: string;
        userId: number;
      };
    }
  }
}
