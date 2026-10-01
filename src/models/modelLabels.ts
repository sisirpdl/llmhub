import type { ModelManifest } from './modelCatalog';
import { quantization } from './huggingFace';
export function modelLabel(model: ModelManifest): string {
  const quant = quantization(
    model.fileName.startsWith('import-') && 'originalFileName' in model
      ? String(model.originalFileName)
      : model.fileName,
  );
  return quant === 'GGUF' || model.displayName.toUpperCase().includes(quant)
    ? model.displayName
    : `${model.displayName} · ${quant}`;
}
