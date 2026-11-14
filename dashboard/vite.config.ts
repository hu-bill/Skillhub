import { randomBytes } from 'node:crypto';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// The dashboard is one local process: Vite serves the UI and this plugin serves the local API.
// Collectors are loaded through Vite so `import.meta.glob` auto-discovery works on the server too.
function apiPlugin(mode: string): Plugin {
  const env = { ...process.env, ...loadEnv(mode, import.meta.dirname, '') };
  // Lives here, not in server/api.ts, so it survives that module being hot-reloaded.
  const writeToken = randomBytes(24).toString('hex');
  return {
    name: 'wayfinder-dashboard-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          const api = (await server.ssrLoadModule('/server/api.ts')) as typeof import('./server/api.ts');
          await api.handle(req, res, {
            demo: mode === 'demo',
            dashboardDir: import.meta.dirname,
            projectRoot: path.resolve(env.WAYFINDER_PROJECT ?? path.join(import.meta.dirname, '..')),
            geminiApiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || undefined,
            geminiModel: env.GEMINI_MODEL || undefined,
            writeToken,
          });
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), apiPlugin(mode)],
  // Localhost only: the API describes this machine's setup and must not be reachable from the network.
  server: { host: '127.0.0.1', port: 5177, strictPort: false },
  test: { include: ['tests/**/test_*.ts', 'src/**/__tests__/**/*.test.ts'], environment: 'node' },
}));
