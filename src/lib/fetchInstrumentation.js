import { addBreadcrumb } from './breadcrumbs';

const originalFetch = window.fetch;

window.fetch = async (...args) => {
  const [resource, options = {}] = args;
  const url = typeof resource === 'string' ? resource : resource.url;
  const method = options.method || 'GET';
  const shouldLog = url.includes('supabase.co') || url.includes('anthropic.com');

  const start = performance.now();
  try {
    const response = await originalFetch(...args);
    if (shouldLog) {
      addBreadcrumb({
        category: 'api',
        message: `${method} ${new URL(url).pathname} → ${response.status}`,
        data: {
          url: new URL(url).pathname,
          method,
          status: response.status,
          duration_ms: Math.round(performance.now() - start),
        },
      });
    }
    return response;
  } catch (err) {
    if (shouldLog) {
      addBreadcrumb({
        category: 'api',
        message: `${method} ${new URL(url).pathname} → FAILED`,
        data: { url: new URL(url).pathname, method, error: err.message },
      });
    }
    throw err;
  }
};
