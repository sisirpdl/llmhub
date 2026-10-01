export type PromptTemplateId = 'qwen2' | 'native';

export type ModelManifest = {
  manifestVersion: number;
  id: string;
  displayName: string;
  fileName: string;
  url: string;
  byteSize: number;
  sha256: string;
  license: string;
  sourceUrl: string;
  promptTemplateId: PromptTemplateId;
  recommendedContextLength: number;
  testedDeviceProfile: string;
};

import manifest from './manifest.json';

export const SUPPORTED_MODELS: ModelManifest[] = [manifest as ModelManifest];

export function isValidManifest(model: ModelManifest): boolean {
  return Boolean(
    model.manifestVersion > 0 &&
      model.id &&
      model.displayName &&
      model.fileName.endsWith('.gguf') &&
      model.url.startsWith('https://') &&
      model.byteSize > 0 &&
      /^[a-f0-9]{64}$/i.test(model.sha256) &&
      model.license &&
      model.sourceUrl.startsWith('https://') &&
      model.promptTemplateId &&
      model.recommendedContextLength > 0 &&
      model.testedDeviceProfile,
  );
}
