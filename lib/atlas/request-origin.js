// Next's internal URL can use localhost while the browser uses 127.0.0.1.
// Compare the browser origin with the actual Host header as well.
export function requestOriginAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const destination = new URL(request.url);
    const host = request.headers.get('host');
    return source.origin === destination.origin || (Boolean(host) && source.host === host && source.protocol === destination.protocol);
  } catch { return false; }
}
