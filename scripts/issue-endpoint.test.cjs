const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(
  fs.readFileSync(
    path.join(
      __dirname,
      '../supabase/functions/submit-issue-report/handler.ts',
    ),
    'utf8',
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const mod = { exports: {} };
new Function('exports', 'module', code)(mod.exports, mod);
const { handleSubmission } = mod.exports;
const env = {
  url: 'https://test.supabase.co',
  publicKey: 'public-key',
  serviceKey: 'server-only-secret',
};
const report = {
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  version: 1,
  title: 'Bug',
  description: 'Unexpected',
  steps: '',
};
const request = (body, headers = {}) =>
  new Request('https://test.example/submit', {
    method: 'POST',
    headers: {
      apikey: env.publicKey,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
test('valid report calls private RPC using only server credentials and returns a receipt', async () => {
  let calls = 0;
  const response = await handleSubmission(
    request(report),
    env,
    async (url, options) => {
      calls++;
      assert.equal(url, env.url + '/rest/v1/rpc/submit_issue_report');
      assert.equal(options.headers.Authorization, 'Bearer server-only-secret');
      assert.equal(JSON.parse(options.body).p_diagnostics, null);
      return Response.json(report.id);
    },
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: report.id });
  assert.equal(calls, 1);
});
test('invalid payloads, unapproved diagnostics and oversized bodies never reach storage', async () => {
  const send = () => {
    throw new Error('must not reach storage');
  };
  for (const body of [
    { ...report, steps: 'x'.repeat(2001) },
    { ...report, description: '' },
    { ...report, token: 'private' },
    {
      ...report,
      diagnostics: {
        appVersion: '1',
        platform: 'ios',
        osVersion: '18',
        token: 'secret',
      },
    },
    { ...report, id: 'bad' },
    { ...report, title: 'x'.repeat(40000) },
  ])
    assert.equal(
      (await handleSubmission(request(body), env, send)).status,
      400,
    );
});
test('wrong public key, missing config and unsupported methods fail before storage', async () => {
  const send = () => {
    throw new Error('must not reach storage');
  };
  assert.equal(
    (await handleSubmission(request(report, { apikey: 'wrong' }), env, send))
      .status,
    401,
  );
  assert.equal(
    (await handleSubmission(request(report), { ...env, serviceKey: '' }, send))
      .status,
    503,
  );
  assert.equal(
    (await handleSubmission(new Request('https://test.example'), env, send))
      .status,
    405,
  );
});
test('rate-limit and duplicate-content conflicts are surfaced without exposing database details', async () => {
  for (const [message, status] of [
    ['REPORT_RATE_LIMIT', 429],
    ['REPORT_ID_CONFLICT', 409],
    ['database credentials leaked', 503],
  ]) {
    const response = await handleSubmission(request(report), env, async () =>
      Response.json({ message }, { status: 400 }),
    );
    assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes('credentials'));
  }
});
