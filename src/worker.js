import { handleApiRequest } from './app.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/health' || pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    if (env?.ASSETS?.fetch) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
