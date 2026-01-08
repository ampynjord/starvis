import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ShipService } from './services/shipService';
import { createShipRouter } from './routes/shipRoutes';

// Charger les variables d'environnement
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;
const cacheDuration = parseInt(process.env.CACHE_DURATION || '3600000');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger middleware
app.use((req: Request, res: Response, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Service d'initialisation
const shipService = new ShipService(cacheDuration);

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Star Citizen Ships API',
    version: '1.0.0',
    description: 'API pour scraper les données des vaisseaux Star Citizen',
    endpoints: {
      ships: {
        getAll: 'GET /api/ships',
        getOne: 'GET /api/ships/:manufacturer/:slug',
        scrape: 'POST /api/ships/scrape',
        deleteCache: 'DELETE /api/ships/:manufacturer/:slug/cache',
        clearAllCache: 'DELETE /api/ships/cache',
      },
      health: 'GET /health',
    },
    documentation: '/api/docs',
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Routes API
app.use('/api/ships', createShipRouter(shipService));

// Route de documentation
app.get('/api/docs', (req: Request, res: Response) => {
  res.json({
    title: 'Star Citizen Ships API Documentation',
    version: '1.0.0',
    baseUrl: `http://localhost:${port}`,
    endpoints: [
      {
        method: 'GET',
        path: '/api/ships',
        description: 'Récupère tous les vaisseaux en cache',
        response: {
          success: 'boolean',
          count: 'number',
          data: 'ShipData[]',
        },
      },
      {
        method: 'GET',
        path: '/api/ships/:manufacturer/:slug',
        description: 'Récupère un vaisseau spécifique',
        parameters: {
          manufacturer: 'string - Le fabricant du vaisseau (ex: anvil-arrow)',
          slug: 'string - Le slug du vaisseau (ex: Arrow)',
        },
        queryParams: {
          refresh: 'boolean - Force le re-scraping',
        },
        examples: [
          '/api/ships/anvil-arrow/Arrow',
          '/api/ships/origin-100/100i?refresh=true',
        ],
      },
      {
        method: 'POST',
        path: '/api/ships/scrape',
        description: 'Scrappe un vaisseau à partir d\'une URL',
        body: {
          url: 'string - URL complète du vaisseau sur RSI',
          forceRefresh: 'boolean (optional) - Force le re-scraping',
        },
        example: {
          url: 'https://robertsspaceindustries.com/en/pledge/ships/anvil-arrow/Arrow',
          forceRefresh: false,
        },
      },
      {
        method: 'DELETE',
        path: '/api/ships/:manufacturer/:slug/cache',
        description: 'Supprime le cache d\'un vaisseau spécifique',
      },
      {
        method: 'DELETE',
        path: '/api/ships/cache',
        description: 'Supprime tout le cache',
      },
    ],
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Démarrage du serveur
async function startServer() {
  try {
    console.log('Initializing services...');
    await shipService.init();

    app.listen(port, () => {
      console.log(`✓ Server is running on http://localhost:${port}`);
      console.log(`✓ API Documentation: http://localhost:${port}/api/docs`);
      console.log(`✓ Health check: http://localhost:${port}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await shipService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await shipService.close();
  process.exit(0);
});

startServer();
