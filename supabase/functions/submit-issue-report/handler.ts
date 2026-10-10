export type Environment = {
  url: string;
  serviceKey: string;
  publicKey: string;
};
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
export function validReport(value: unknown) {
  const b = value as Record<string, unknown>;
  if (
    !b ||
    typeof b !== 'object' ||
    b.version !== 1 ||
    typeof b.id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      b.id,
    )
  )
    throw new Error('Invalid report');
  for (const [key, limit, required] of [
    ['title', 120, true],
    ['description', 4000, true],
    ['steps', 2000, false],
  ] as const) {
    if (
      typeof b[key] !== 'string' ||
      (b[key] as string).length > limit ||
      (required && !(b[key] as string).trim())
    )
      throw new Error('Invalid report');
  }
  let diagnostics: Record<string, string> | null = null;
  if (b.diagnostics !== undefined) {
    const d = b.diagnostics as Record<string, unknown>;
    if (
      !d ||
      typeof d !== 'object' ||
      Array.isArray(d) ||
      Object.keys(d).length !== 3
    )
      throw new Error('Invalid diagnostics');
    diagnostics = {};
    for (const key of ['appVersion', 'platform', 'osVersion']) {
      if (typeof d[key] !== 'string' || (d[key] as string).length > 80)
        throw new Error('Invalid diagnostics');
      diagnostics[key] = d[key] as string;
    }
    if (!['ios', 'android'].includes(diagnostics.platform))
      throw new Error('Invalid platform');
  }
  if (
    Object.keys(b).some(
      key =>
        ![
          'id',
          'version',
          'title',
          'description',
          'steps',
          'diagnostics',
        ].includes(key),
    )
  )
    throw new Error('Unexpected report fields');
  return {
    p_id: b.id,
    p_title: (b.title as string).trim(),
    p_description: (b.description as string).trim(),
    p_steps: (b.steps as string).trim(),
    p_diagnostics: diagnostics,
  };
}
async function readBounded(request: Request) {
  if (!request.body) throw new Error('Missing body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32768) {
        await reader.cancel();
        throw new Error('Body too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export async function handleSubmission(
  request: Request,
  env: Environment,
  send: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST')
    return json({ error: 'Method not allowed' }, 405);
  if (!env.url || !env.serviceKey || !env.publicKey)
    return json({ error: 'Report service not configured' }, 503);
  // A publishable key identifies this project; it is public, not an anti-spam secret.
  if (request.headers.get('apikey') !== env.publicKey)
    return json({ error: 'Invalid project key' }, 401);
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    return json({ error: 'Expected JSON' }, 415);
  let report: ReturnType<typeof validReport>;
  try {
    report = validReport(await readBounded(request));
  } catch {
    return json({ error: 'Invalid report' }, 400);
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await send(`${env.url}/rest/v1/rpc/submit_issue_report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
      },
      body: JSON.stringify(report),
      signal: abort.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      if (data?.message === 'REPORT_RATE_LIMIT')
        return json({ error: 'Too many reports' }, 429);
      if (data?.message === 'REPORT_ID_CONFLICT')
        return json({ error: 'Report ID conflict' }, 409);
      return json({ error: 'Unable to submit report' }, 503);
    }
    if (data !== report.p_id)
      return json({ error: 'Unable to confirm report' }, 503);
    return json({ id: data }, 201);
  } catch {
    return json({ error: 'Report service unavailable' }, 503);
  } finally {
    clearTimeout(timer);
  }
}
