import { Text } from 'react-native';
import type { AppController } from '../app/AppController';
import { isVision } from '../app/useModelController';
import { Button, Sheet } from '../ui/Controls';
import { SUPPORTED_VISION_MODELS } from './visionCatalog';
import { ModelSuggestion } from './ModelSuggestion';

export function VisionSetupSheet({ app }: { app: AppController }) {
  const { models, colors } = app;
  const visions = models.catalog.filter(isVision);
  const ready = visions.filter(model =>
    ['ready', 'active', 'load-failed'].includes(models.states[model.id]),
  );
  const pending = visions.some(model =>
    ['downloading', 'validating', 'loading'].includes(models.states[model.id]),
  );
  const suggestion = visions.find(
    model => model.id === SUPPORTED_VISION_MODELS[0]?.id,
  );
  const close = () => app.setVisionSetupVisible(false);
  const browse = () => {
    close();
    app.setDiscoveryVisible(true);
  };
  const showModels = () => {
    close();
    app.setRoute('models');
  };
  return (
    <Sheet
      visible={app.visionSetupVisible}
      onClose={close}
      title={
        ready.length ? 'Choose a vision model' : 'Images need a vision model'
      }
      colors={colors}
    >
      {ready.map(model =>
        models.errors[model.id] ? (
          <Text key={`error-${model.id}`} style={{ color: colors.danger }}>
            {models.errors[model.id]}
          </Text>
        ) : null,
      )}
      {ready.length ? (
        ready.map(model => (
          <Button
            key={model.id}
            label={`Use ${model.displayName}`}
            colors={colors}
            disabled={models.generationActive || pending || models.importing}
            onPress={async () => {
              if (await app.switchModel(model)) close();
            }}
          />
        ))
      ) : pending ? (
        <>
          <Text style={{ color: colors.muted }}>
            Your vision model is being prepared. Check its progress in Your
            models.
          </Text>
          <Button label="View progress" colors={colors} onPress={showModels} />
        </>
      ) : suggestion ? (
        <ModelSuggestion
          model={suggestion}
          controller={models}
          colors={colors}
          onBrowse={browse}
          onStarted={showModels}
        />
      ) : (
        <Button label="Find a vision model" colors={colors} onPress={browse} />
      )}
      {ready.length ? (
        <Text style={{ color: colors.muted }}>
          After loading, tap the gallery icon again to choose Camera or Gallery.
          Your conversation stays here.
        </Text>
      ) : null}
    </Sheet>
  );
}
