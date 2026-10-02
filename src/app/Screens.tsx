import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AppController } from './AppController';
import { ModelSettingsSheet } from '../settings/ModelSettingsSheet';
import { RenameChatSheet } from '../chat/RenameChatSheet';
import { ChatView } from '../chat/ChatView';
import {
  ModelCatalogView,
  ModelDiscovery,
  ModelPicker,
} from '../models/ModelCatalogView';
import { VisionSetupSheet } from '../models/VisionSetupSheet';
import { isVision } from './useModelController';
import { Button, IconButton, Sheet } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { formatBytes, type Colors } from '../ui/theme';
import { DocumentLibraryView } from '../documents/DocumentLibraryView';
export function ScreenContent({ app }: { app: AppController }) {
  const { colors, models, chat } = app;
  return (
    <View style={styles.fill}>
      {models.notice ? (
        <View style={[styles.banner, { backgroundColor: colors.elevated }]}>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.bannerText, { color: colors.muted }]}
          >
            {models.notice}
          </Text>
          <IconButton
            name="close"
            label="Dismiss notice"
            colors={colors}
            onPress={() => models.setNotice('')}
          />
        </View>
      ) : null}
      {app.route === 'models' ? (
        <ModelCatalogView
          controller={models}
          colors={colors}
          onDiscover={() => app.setDiscoveryVisible(true)}
          onChat={() => app.setRoute('chat')}
        />
      ) : app.route === 'chat' ? (
        <ChatView
          chat={chat}
          colors={colors}
          active={Boolean(models.context) && !app.transfer}
          vision={isVision(models.model)}
          onModels={() => app.setRoute('models')}
          onPicker={() => app.setPickerVisible(true)}
          settingsVisible={app.chatSettingsVisible}
          onCloseSettings={() => app.setChatSettingsVisible(false)}
          onSettings={() => app.setChatSettingsVisible(true)}
          onAttachImage={app.requestImageAttachment}
          onDocuments={() => app.setDocumentsVisible(true)}
        />
      ) : (
        <SettingsScreen app={app} />
      )}
      <Sheet
        visible={app.chatMenuVisible}
        onClose={() => app.setChatMenuVisible(false)}
        title="Chat actions"
        colors={colors}
        scroll={false}
      >
        <Button
          label="Export chat"
          icon="external"
          colors={colors}
          disabled={chat.sending || Boolean(app.transfer)}
          onPress={() => {
            app.setChatMenuVisible(false);
            app.exportChat();
          }}
        />
        <Button
          label="Ask your docs"
          icon="models"
          colors={colors}
          disabled={chat.sending}
          onPress={() => {
            app.setChatMenuVisible(false);
            app.setDocumentsVisible(true);
          }}
        />
        <Text style={[styles.caption, { color: colors.muted }]}>
          Save one JSON file with this conversation and its images.
        </Text>
      </Sheet>
      <VisionSetupSheet app={app} />
      <ModelDiscovery
        visible={app.discoveryVisible}
        onClose={() => app.setDiscoveryVisible(false)}
        controller={models}
        colors={colors}
      />
      <ModelPicker
        visible={app.pickerVisible}
        onClose={() => app.setPickerVisible(false)}
        controller={models}
        colors={colors}
        onSelect={app.switchModel}
      />
      <ModelSettingsSheet
        visible={app.chatSettingsVisible}
        onClose={() => app.setChatSettingsVisible(false)}
        model={models.model}
        settings={app.settings.forModel(models.model)}
        systemPrompt={chat.systemPrompt}
        onApply={app.applyModelSettings}
        colors={colors}
        disabled={chat.sending || !app.settings.loaded}
      />
      <RenameChatSheet
        visible={app.renameVisible}
        title={chat.title}
        onClose={() => app.setRenameVisible(false)}
        onSave={chat.renameConversation}
        colors={colors}
      />
      <Sheet
        visible={app.historyVisible}
        onClose={() => app.setHistoryVisible(false)}
        title="Conversations"
        colors={colors}
      >
        <History app={app} onSelect={() => app.setHistoryVisible(false)} />
      </Sheet>
      <Sheet
        visible={app.documentsVisible}
        onClose={() => app.setDocumentsVisible(false)}
        title={app.route === 'chat' ? 'Ask your docs' : 'Document library'}
        colors={colors}
      >
        <DocumentLibraryView
          controller={app.documents}
          colors={colors}
          selected={app.route === 'chat' ? chat.documentIds : undefined}
          onToggle={app.route === 'chat' ? chat.toggleDocument : undefined}
          disabled={chat.sending || Boolean(app.transfer)}
          onPickerStateChange={models.setExternalUIActive}
        />
      </Sheet>
    </View>
  );
}
export function History({
  app,
  onSelect,
}: {
  app: AppController;
  onSelect: () => void;
}) {
  const { colors, chat } = app;
  return (
    <View style={styles.history}>
      {Platform.OS === 'ios' ? (
        <Button
          label="Import chat"
          icon="download"
          colors={colors}
          disabled={chat.sending || !chat.loaded || Boolean(app.transfer)}
          onPress={app.importChat}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={chat.sending}
        onPress={() => {
          chat.newConversation();
          app.setRoute('chat');
          onSelect();
        }}
        style={[styles.historyRow, { borderColor: colors.border }]}
      >
        <Icon name="edit" color={colors.accent} />
        <Text style={[styles.rowText, { color: colors.accent }]}>
          New conversation
        </Text>
      </Pressable>
      {chat.history.length ? (
        chat.history.map(item => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{
              selected: item.id === chat.currentId,
              disabled: chat.sending,
            }}
            disabled={chat.sending}
            onPress={() => {
              chat.selectConversation(item.id);
              app.setRoute('chat');
              onSelect();
            }}
            style={[
              styles.historyRow,
              {
                backgroundColor:
                  item.id === chat.currentId
                    ? colors.elevated
                    : colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Icon name="chat" color={colors.muted} size={20} />
            <View style={styles.fill}>
              <Text
                numberOfLines={2}
                style={[styles.rowText, { color: colors.text }]}
              >
                {item.title}
              </Text>
              <Text style={[styles.caption, { color: colors.muted }]}>
                {new Date(item.updatedAt).toLocaleDateString()} ·{' '}
                {item.messages.filter(m => m.role === 'user').length} turns
              </Text>
            </View>
          </Pressable>
        ))
      ) : (
        <Text style={[styles.paragraph, { color: colors.muted }]}>
          Your conversations will appear here after your first message.
        </Text>
      )}
    </View>
  );
}
function SettingsScreen({ app }: { app: AppController }) {
  const { colors } = app;
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.section, { color: colors.accent }]}>Appearance</Text>
      <View
        style={[
          styles.group,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {(['dark', 'light', 'system'] as const).map(value => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: app.appearance === value }}
            onPress={() => app.setAppearance(value)}
            style={[styles.row, { borderColor: colors.border }]}
          >
            <Text style={[styles.rowText, { color: colors.text }]}>
              {value === 'system'
                ? 'Follow system'
                : value === 'dark'
                ? 'Dark'
                : 'Light'}
            </Text>
            <View style={styles.fill} />
            {app.appearance === value ? (
              <Icon name="check" color={colors.accent} size={20} />
            ) : null}
          </Pressable>
        ))}
      </View>
      <Text style={[styles.section, { color: colors.accent }]}>Generation</Text>
      <View
        style={[
          styles.group,
          styles.padded,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.paragraph, { color: colors.muted }]}>
          Adjust generation settings for {app.models.model.displayName}.
          Instructions are saved with the current chat.
        </Text>
        <Button
          label="Model settings"
          icon="sliders"
          colors={colors}
          onPress={() => app.setChatSettingsVisible(true)}
        />
      </View>
      <Text style={[styles.section, { color: colors.accent }]}>Knowledge</Text>
      <View
        style={[
          styles.group,
          styles.padded,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.paragraph, { color: colors.muted }]}>
          Import PDFs, Markdown, or text files. Attach documents to each chat to
          search them without leaving this device.
        </Text>
        <Button
          label="Manage local documents"
          icon="models"
          colors={colors}
          onPress={() => app.setDocumentsVisible(true)}
        />
      </View>
      <Text style={[styles.section, { color: colors.accent }]}>Privacy</Text>
      <View
        style={[
          styles.group,
          styles.padded,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.privacyTitle}>
          <Icon name="shield" color={colors.green} />
          <Text style={[styles.rowText, { color: colors.text }]}>
            Private by default
          </Text>
        </View>
        <Text style={[styles.paragraph, { color: colors.muted }]}>
          Models and conversations are stored on this device. No account, cloud
          inference, or chat telemetry. Model downloads need internet.
        </Text>
      </View>
      <Text style={[styles.caption, styles.footnote, { color: colors.muted }]}>
        Leaving the app unloads the model to protect memory. Load it again when
        you return. Vision support is a preview and requires a compatible
        projector.
      </Text>
      <InfoSection app={app} />
    </ScrollView>
  );
}
function InfoSection({ app }: { app: AppController }) {
  const { colors, models } = app;
  const constants = Platform.constants as Record<string, unknown>;
  const rows = [
    ['App version', '0.0.1'],
    ['Device', String(constants.Model || constants.model || 'Unknown device')],
    ['Platform', `${Platform.OS} ${String(Platform.Version)}`],
    ['llama.rn', `0.12.0 · ${models.engineStatus}`],
    ['New Architecture', 'Enabled'],
    ['Model', models.model.displayName],
    ['Model state', models.states[models.model.id] || 'checking'],
    [
      'Storage',
      models.freeSpace === null
        ? 'Unavailable'
        : `${formatBytes(models.freeSpace)} free`,
    ],
    [
      'Last load',
      models.loadDuration === null ? 'Not run' : `${models.loadDuration} ms`,
    ],
    [
      'Smoke completion',
      models.completionDuration === null
        ? 'Not run'
        : `${models.completionDuration} ms`,
    ],
  ];
  return (
    <View>
      <Text style={[styles.section, { color: colors.accent }]}>App Info</Text>
      <View style={styles.brand}>
        <Icon name="chat" color={colors.accent} size={44} />
        <Text style={[styles.brandName, { color: colors.text }]}>LLMHub</Text>
        <Text style={[styles.paragraph, { color: colors.muted }]}>
          A local conversation, kept local.
        </Text>
      </View>
      <Text style={[styles.section, { color: colors.accent }]}>
        Engine diagnostics
      </Text>
      <View
        style={[
          styles.group,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {rows.map(([label, value]) => (
          <View
            key={label}
            style={[styles.diagnostic, { borderColor: colors.border }]}
          >
            <Text style={[styles.caption, { color: colors.muted }]}>
              {label}
            </Text>
            <Text selectable style={[styles.rowText, { color: colors.text }]}>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.caption, styles.footnote, { color: colors.muted }]}>
        Diagnostics stay on device and never include your prompts.
        Physical-device testing is required to validate native inference. iOS is
        preview-only until verified on an iPhone.
      </Text>
    </View>
  );
}
export function Onboarding({
  colors,
  onComplete,
}: {
  colors: Colors;
  onComplete: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.onboarding,
        { backgroundColor: colors.background },
      ]}
    >
      <View
        style={[styles.onboardingIcon, { backgroundColor: colors.elevated }]}
      >
        <Icon name="shield" color={colors.accent} size={48} />
      </View>
      <Text style={[styles.overline, { color: colors.accent }]}>
        WELCOME TO LLMHUB
      </Text>
      <Text style={[styles.onboardingTitle, { color: colors.text }]}>
        {'Your AI.\nYour device.'}
      </Text>
      <Text style={[styles.onboardingText, { color: colors.muted }]}>
        A private space to ask, write, and explore. Your conversations run
        locally and stay with you.
      </Text>
      <View style={styles.onboardingRows}>
        {[
          [
            'download',
            'Download once',
            'Internet is needed to download a supported model.',
          ],
          [
            'shield',
            'Chat offline',
            'No account or cloud inference. Your prompts stay on device.',
          ],
          [
            'models',
            'Choose what fits',
            'Model speed and memory needs depend on your phone.',
          ],
        ].map(([icon, title, text]) => (
          <View key={title} style={styles.onboardingRow}>
            <Icon
              name={icon as 'download' | 'shield' | 'models'}
              color={colors.accent}
            />
            <View style={styles.fill}>
              <Text style={[styles.rowText, { color: colors.text }]}>
                {title}
              </Text>
              <Text style={[styles.caption, { color: colors.muted }]}>
                {text}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Button
        label="Get started"
        icon="arrow"
        colors={colors}
        onPress={onComplete}
      />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 19 },
  page: { padding: 20, paddingBottom: 40 },
  section: { fontSize: 15, fontWeight: '500', marginBottom: 12, marginTop: 16 },
  group: {
    borderRadius: Platform.OS === 'ios' ? 12 : 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 8,
  },
  padded: { padding: 18 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 16, lineHeight: 23 },
  caption: { fontSize: 13, lineHeight: 20, marginTop: 4 },
  paragraph: { fontSize: 14, lineHeight: 23, marginTop: 12 },
  footnote: { marginTop: 16 },
  privacyTitle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  diagnostic: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  brand: { alignItems: 'center', paddingVertical: 24 },
  brandName: { fontSize: 28, fontWeight: '600', marginTop: 12 },
  history: { gap: 6 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 60,
    borderRadius: 12,
    padding: 12,
  },
  onboarding: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingVertical: 40,
    justifyContent: 'center',
  },
  onboardingIcon: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  overline: { fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  onboardingTitle: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '600',
    marginTop: 14,
  },
  onboardingText: { fontSize: 16, lineHeight: 25, marginTop: 16 },
  onboardingRows: { gap: 20, marginVertical: 32 },
  onboardingRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
});
