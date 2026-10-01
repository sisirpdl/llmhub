import {
  getHubDetails,
  hubDownloadUrl,
  hubSearchUrl,
  parseHubDetails,
  quantization,
  searchHub,
  type HubFilters,
} from './huggingFace';
const filters: HubFilters = {
  search: 'Qwen 3',
  author: 'bartowski',
  sort: 'downloads',
  task: 'vision',
  hideGated: true,
};
const revision = 'a'.repeat(40);
const digest = 'b'.repeat(64);
afterEach(() => jest.restoreAllMocks());
test('builds encoded GGUF queries with author, task and ordering', () => {
  const url = hubSearchUrl(filters);
  expect(url).toContain('filter=gguf');
  expect(url).toContain('author=bartowski');
  expect(url).toContain('search=Qwen%203');
  expect(url).toContain('pipeline_tag=image-text-to-text');
  expect(url).toContain('sort=downloads');
});
test('separates GGUF variants, projectors and unsupported split shards', () => {
  const details = parseHubDetails({
    id: 'org/model',
    sha: revision,
    siblings: [
      { rfilename: 'README.md' },
      { rfilename: 'model-Q4_K_M.gguf', lfs: { size: 1000, sha256: digest } },
      { rfilename: 'mmproj-F16.gguf', size: 500 },
      { rfilename: 'model-Q8_0-00001-of-00002.gguf', size: 3000 },
    ],
    cardData: { license: 'apache-2.0' },
  });
  expect(details.files).toHaveLength(3);
  expect(details.files[0].projector).toBe(true);
  expect(details.files[1]).toMatchObject({
    sha256: digest,
    quantization: 'Q4_K_M',
    size: 1000,
  });
  expect(details.files[2].split).toBe(true);
  expect(hubDownloadUrl('org/model', revision, 'folder/model Q4.gguf')).toBe(
    `https://huggingface.co/org/model/resolve/${revision}/folder/model%20Q4.gguf`,
  );
  expect(quantization('model-IQ4_XS.gguf')).toBe('IQ4_XS');
});
test('rejects repositories without an immutable revision', () =>
  expect(() => parseHubDetails({ sha: 'main', siblings: [] })).toThrow(
    'revision',
  ));
test('uses auth and refuses pagination to a different host', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => [
      { id: 'org/public' },
      { id: 'org/gated', gated: 'auto' },
    ],
    headers: {
      get: () => '<https://evil.example/api/models?x=1>; rel="next"',
    },
  } as unknown as Response);
  const result = await searchHub(filters, 'hf_secret');
  expect(result.models.map(m => m.id)).toEqual(['org/public']);
  expect(result.next).toBeNull();
  expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
    Authorization: 'Bearer hf_secret',
  });
  await expect(
    searchHub(
      filters,
      'hf_secret',
      undefined,
      'https://evil.example/api/models?x=1',
    ),
  ).rejects.toThrow('pagination');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
test('reports gated access and requests file checksums', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ ok: false, status: 403 } as Response);
  await expect(
    getHubDetails(
      {
        id: 'org/model',
        author: 'org',
        name: 'model',
        downloads: 0,
        likes: 0,
        gated: true,
        vision: false,
      },
      '',
    ),
  ).rejects.toThrow('read token');
  expect(fetchMock.mock.calls[0][0]).toContain('?blobs=true');
});
