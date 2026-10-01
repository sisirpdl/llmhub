export type HubModel = {
  id: string;
  author: string;
  name: string;
  downloads: number;
  likes: number;
  updatedAt?: string;
  gated: boolean;
  vision: boolean;
};
export type HubFile = {
  path: string;
  size: number;
  sha256?: string;
  quantization: string;
  projector: boolean;
  split: boolean;
};
export type HubDetails = {
  model: HubModel;
  revision: string;
  license: string;
  files: HubFile[];
};
export type HubSort = 'trendingScore' | 'downloads' | 'likes' | 'lastModified';
export type HubFilters = {
  search: string;
  author: string;
  sort: HubSort;
  task: 'all' | 'text' | 'vision';
  hideGated: boolean;
};
const HUB = 'https://huggingface.co';
const encodeRepo = (id: string) =>
  id.split('/').map(encodeURIComponent).join('/');
export function hubSearchUrl(filters: HubFilters): string {
  const params = [
    `filter=gguf`,
    `sort=${filters.sort}`,
    'direction=-1',
    'limit=30',
    'full=true',
  ];
  if (filters.search.trim())
    params.push(`search=${encodeURIComponent(filters.search.trim())}`);
  if (filters.author.trim())
    params.push(`author=${encodeURIComponent(filters.author.trim())}`);
  if (filters.task !== 'all')
    params.push(
      `pipeline_tag=${
        filters.task === 'vision' ? 'image-text-to-text' : 'text-generation'
      }`,
    );
  if (filters.hideGated) params.push('gated=false');
  return `${HUB}/api/models?${params.join('&')}`;
}
export function parseHubModel(data: Record<string, unknown>): HubModel {
  const id = String(data.id || data.modelId || '');
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return {
    id,
    author: String(data.author || id.split('/')[0] || 'Unknown author'),
    name: id.includes('/') ? id.slice(id.indexOf('/') + 1) : id,
    downloads: Number(data.downloads) || 0,
    likes: Number(data.likes) || 0,
    updatedAt:
      typeof data.lastModified === 'string' ? data.lastModified : undefined,
    gated: Boolean(data.gated),
    vision:
      data.pipeline_tag === 'image-text-to-text' ||
      tags.some(tag =>
        ['vision', 'multimodal', 'image-text-to-text'].includes(String(tag)),
      ),
  };
}
export function quantization(path: string): string {
  return (
    path
      .match(
        /(?:^|[-_.])(IQ\d[_A-Z0-9]*|Q\d[_A-Z0-9]*|BF16|F16|F32|FP16)(?=[-.]|$)/i,
      )?.[1]
      .toUpperCase() || 'GGUF'
  );
}
export function parseHubDetails(data: Record<string, unknown>): HubDetails {
  if (
    !Array.isArray(data.siblings) ||
    typeof data.sha !== 'string' ||
    !/^[a-f0-9]{40}$/i.test(data.sha)
  )
    throw new Error(
      'The repository did not return a valid file revision. Please retry.',
    );
  const files: HubFile[] = data.siblings
    .flatMap(
      (entry: {
        rfilename?: string;
        size?: number;
        lfs?: { size?: number; sha256?: string; oid?: string };
      }) => {
        if (!entry.rfilename?.toLowerCase().endsWith('.gguf')) return [];
        const digest = entry.lfs?.sha256 || entry.lfs?.oid;
        return [
          {
            path: entry.rfilename,
            size: Number(entry.size || entry.lfs?.size) || 0,
            sha256:
              digest && /^[a-f0-9]{64}$/i.test(digest)
                ? digest.toLowerCase()
                : undefined,
            quantization: quantization(entry.rfilename),
            projector: /(?:mmproj|projector)/i.test(entry.rfilename),
            split: /-\d{5}-of-\d{5}\.gguf$/i.test(entry.rfilename),
          },
        ];
      },
    )
    .sort((a, b) => a.size - b.size || a.path.localeCompare(b.path));
  const card = data.cardData as { license?: string } | undefined;
  return {
    model: parseHubModel(data),
    revision: data.sha,
    license: String(card?.license || 'See repository license'),
    files,
  };
}
export function hubDownloadUrl(
  repo: string,
  revision: string,
  path: string,
): string {
  return `${HUB}/${encodeRepo(repo)}/resolve/${encodeURIComponent(
    revision,
  )}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
function nextPage(link: string | null): string | null {
  const match = link?.match(/<([^>]+)>;\s*rel="next"/);
  if (!match) return null;
  // Only follow pagination on the Hub itself; never send the access token elsewhere.
  return match[1].startsWith(`${HUB}/api/models?`) ? match[1] : null;
}
async function hubRequest(
  url: string,
  token: string,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(url, {
    signal,
    headers: token.trim() ? { Authorization: `Bearer ${token.trim()}` } : {},
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error(
        'Access denied. Accept the model license on Hugging Face and enter a read token in Filters.',
      );
    if (response.status === 429)
      throw new Error('Hugging Face is busy. Wait a moment, then retry.');
    throw new Error(
      `Hugging Face returned HTTP ${response.status}. Please retry.`,
    );
  }
  return response;
}
export async function searchHub(
  filters: HubFilters,
  token: string,
  signal?: AbortSignal,
  page?: string,
): Promise<{ models: HubModel[]; next: string | null }> {
  if (page && !page.startsWith(`${HUB}/api/models?`))
    throw new Error('Invalid pagination URL.');
  const response = await hubRequest(
    page || hubSearchUrl(filters),
    token,
    signal,
  );
  const data = await response.json();
  if (!Array.isArray(data))
    throw new Error('Hugging Face returned an unexpected response.');
  return {
    models: data
      .map(parseHubModel)
      .filter(model => model.id && (!filters.hideGated || !model.gated)),
    next: nextPage(response.headers.get('link')),
  };
}
export async function getHubDetails(
  model: HubModel,
  token: string,
  signal?: AbortSignal,
): Promise<HubDetails> {
  const response = await hubRequest(
    `${HUB}/api/models/${encodeRepo(model.id)}?blobs=true`,
    token,
    signal,
  );
  return parseHubDetails(await response.json());
}
export const compactNumber = (value: number) =>
  value >= 1e6
    ? `${(value / 1e6).toFixed(1).replace(/\.0$/, '')}m`
    : value >= 1000
    ? `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
    : String(value);
export function timeAgo(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Updated recently';
  const days = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(value)) / 86400000),
  );
  return days === 0
    ? 'Today'
    : days === 1
    ? '1 day ago'
    : days < 30
    ? `${days} days ago`
    : `${Math.floor(days / 30)} months ago`;
}
