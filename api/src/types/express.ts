declare global {
  namespace Express {
    interface Request {
      authMethod?: 'admin_key' | 'api_token' | 'anonymous';
      internalClient?: string;
      apiToken?: {
        id: number;
        jti: string;
        name: string;
        owner: string;
      };
    }
  }
}

export {};
