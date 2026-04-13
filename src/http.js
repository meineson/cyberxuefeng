const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function buildHeaders(extraHeaders = {}) {
  return {
    ...DEFAULT_HEADERS,
    ...extraHeaders,
  };
}

export function jsonResponse(data, init = {}) {
  const headers = buildHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    ...(init.headers || {}),
  });

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export function textResponse(body, init = {}) {
  const headers = buildHeaders({
    'Content-Type': 'text/plain; charset=utf-8',
    ...(init.headers || {}),
  });

  return new Response(body, {
    ...init,
    headers,
  });
}

export function noContentResponse(init = {}) {
  return new Response(null, {
    status: 204,
    ...init,
    headers: buildHeaders(init.headers || {}),
  });
}

export async function parseJsonBody(request) {
  const rawBody = await request.text();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
}
