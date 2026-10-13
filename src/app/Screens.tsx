import { PopupHost } from '../ui/Popups';
import { useState } from 'react';
import { DeleteChatDialog } from '../ui/DeleteChatDialog';
import { version } from '../../package.json';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AppController, SettingsSection } from './AppController';
import { ModelSettingsSheet } from '../settings/ModelSettingsSheet';
import { IssueReportSheet } from '../support/IssueReportSheet';
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
import { HuggingFaceTokenSettings } from '../settings/HuggingFaceTokenSettings';
import { NearbyTransferSheet } from '../nearby/NearbyTransferSheet';
import { LanSettings } from '../lan/LanSettings';
import { DocumentLibraryView } from '../documents/DocumentLibraryView';
export function ScreenContent({ app }: { app: AppController }) {
  const { colors, models, chat } = app;
  const [historyPresented, setHistoryPresented] = useState(false);
  const openLanSettings = () => {
    app.setSettingsSection('Host & Connect');
    app.setRoute('settings');
  };
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
          onShare={app.nearby.send}
          onReceive={app.nearby.openReceive}
        />
      ) : app.route === 'documents' ? (
        <ScrollView contentContainerStyle={styles.page}>
          <DocumentLibraryView
            controller={app.documents}
            colors={colors}
            disabled={chat.sending || Boolean(app.transfer)}
            onPickerStateChange={models.setExternalUIActive}
          />
        </ScrollView>
      ) : app.route === 'nearby' ? (
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={[styles.paragraph, { color: colors.muted }]}>
            Send or receive model files over local Wi-Fi. To send, choose an
            installed model and tap Share model.
          </Text>
          <Button
            label="Send model"
            icon="external"
            colors={colors}
            onPress={() => app.setRoute('models')}
          />
          <Button
            label="Receive model"
            icon="download"
            colors={colors}
            onPress={app.nearby.openReceive}
            disabled={app.nearby.busy || app.nearby.working}
          />
        </ScrollView>
      ) : app.route === 'chat' ? (
        <ChatView
          lanStatus={
            app.lan.remote ? 'remote' : app.lan.host ? 'hosting' : undefined
          }
          lanConnectionIssue={Boolean(
            app.lan.remote && app.lan.remoteStatus === 'unreachable',
          )}
          chat={chat}
          colors={colors}
          active={
            Boolean(app.lan.remote || models.context) &&
            !app.lan.host &&
            !app.lan.pending &&
            !app.transfer
          }
          vision={!app.lan.remote && isVision(models.model)}
          onModels={() => app.setRoute('models')}
          onPicker={() =>
            app.lan.remote || app.lan.host
              ? openLanSettings()
              : app.setPickerVisible(true)
          }
          settingsVisible={app.chatSettingsVisible}
          onCloseSettings={() => app.setChatSettingsVisible(false)}
          onSettings={() =>
            app.lan.remote || app.lan.host
              ? openLanSettings()
              : app.setChatSettingsVisible(true)
          }
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
          label="Ask your documents"
          icon="document"
          colors={colors}
          disabled={chat.sending || chat.deleting || Boolean(app.transfer)}
          onPress={() => {
            app.setChatMenuVisible(false);
            app.setDocumentsVisible(true);
          }}
        />
        <Button
          label="Delete chat"
          destructive
          icon="trash"
          colors={colors}
          disabled={chat.sending || chat.deleting || Boolean(app.transfer)}
          onPress={() => {
            app.setChatMenuVisible(false);
            chat.deleteConversation();
          }}
        />
        <Text style={[styles.caption, { color: colors.muted }]}>
          Save one JSON file with this conversation and its images.
        </Text>
      </Sheet>
      <PopupHost colors={colors} />
      <DeleteChatDialog
        title={
          Platform.OS === 'ios' && historyPresented
            ? null
            : chat.pendingDelete?.title ?? null
        }
        colors={colors}
        busy={chat.deleting}
        error={chat.deleteError}
        onCancel={chat.cancelDeleteConversation}
        onDelete={chat.confirmDeleteConversation}
      />
      <IssueReportSheet
        visible={app.issueReportVisible}
        onClose={() => app.setIssueReportVisible(false)}
        colors={colors}
      />
      <NearbyTransferSheet
        transfer={app.nearby}
        colors={colors}
        models={models}
      />
      <VisionSetupSheet app={app} />
      <ModelDiscovery
        visible={app.discoveryVisible}
        onClose={() => app.setDiscoveryVisible(false)}
        controller={models}
        colors={colors}
        onTokenSettings={() => {
          app.setDiscoveryVisible(false);
          app.setSettingsSection('General');
          app.setRoute('settings');
        }}
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
        disabled={
          chat.sending ||
          !app.settings.loaded ||
          Boolean(app.lan.host || app.lan.remote)
        }
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
        onShow={() => {
          if (Platform.OS === 'ios') setHistoryPresented(true);
        }}
        onDismiss={() => setHistoryPresented(false)}
        colors={colors}
      >
        <History app={app} onSelect={() => app.setHistoryVisible(false)} />
      </Sheet>
      <Sheet
        visible={app.documentsVisible}
        onClose={() => app.setDocumentsVisible(false)}
        title={app.route === 'chat' ? 'Ask your documents' : 'Document library'}
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
      <Pressable
        accessibilityRole="button"
        disabled={chat.sending || chat.deleting || Boolean(app.transfer)}
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
          <View key={item.id} style={styles.historyEntry}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                selected: item.id === chat.currentId,
                disabled:
                  chat.sending || chat.deleting || Boolean(app.transfer),
              }}
              disabled={chat.sending || chat.deleting || Boolean(app.transfer)}
              onPress={() => {
                chat.selectConversation(item.id);
                app.setRoute('chat');
                onSelect();
              }}
              style={[
                styles.historyRow,
                styles.fill,
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
            <IconButton
              name="trash"
              label={`Delete chat: ${item.title}`}
              colors={colors}
              disabled={
                chat.sending ||
                chat.deleting ||
                !chat.loaded ||
                Boolean(app.transfer)
              }
              onPress={() => {
                onSelect();
                chat.deleteConversation(item.id);
              }}
            />
          </View>
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
  const section = app.settingsSection;
  return (
    <View style={styles.fill}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.settingsSelector}
        contentContainerStyle={styles.settingsTabs}
      >
        {(
          [
            'General',
            'Host & Connect',
            'Model defaults',
            'About app',
          ] as SettingsSection[]
        ).map(label => (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: section === label }}
            onPress={() => app.setSettingsSection(label)}
            style={[
              styles.settingsTab,
              {
                backgroundColor:
                  section === label ? colors.elevated : colors.background,
                borderColor: section === label ? colors.accent : colors.border,
              },
            ]}
          >
            <Text
              style={{
                color: section === label ? colors.accent : colors.muted,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        key={section}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        {section === 'General' ? (
          <>
            <Text style={[styles.section, { color: colors.accent }]}>
              Hugging Face
            </Text>
            <HuggingFaceTokenSettings
              token={app.models.hfToken}
              onApply={app.models.setHfToken}
              colors={colors}
            />
            <Text style={[styles.caption, { color: colors.muted }]}>
              Appearance
            </Text>
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
            <Button
              label="Import chat"
              icon="download"
              colors={colors}
              disabled={
                app.chat.sending || !app.chat.loaded || Boolean(app.transfer)
              }
              onPress={app.importChat}
            />
          </>
        ) : section === 'Host & Connect' ? (
          <>
            <LanSettings app={app} />
          </>
        ) : section === 'Model defaults' ? (
          <>
            <View
              style={[
                styles.group,
                styles.padded,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.paragraph, { color: colors.muted }]}>
                {app.lan.remote
                  ? 'Your connected host controls response settings. Disconnect to change settings for this phone’s model.'
                  : app.lan.host
                  ? 'Stop hosting before changing model settings.'
                  : `Set response preferences for ${app.models.model.displayName}. The system prompt applies to the current chat.`}
              </Text>
              <Button
                label="Model settings"
                disabled={Boolean(
                  app.lan.remote || app.lan.host || app.lan.pending,
                )}
                icon="sliders"
                colors={colors}
                onPress={() => app.setChatSettingsVisible(true)}
              />
            </View>
          </>
        ) : (
          <InfoSection app={app} />
        )}
      </ScrollView>
    </View>
  );
}
function InfoSection({ app }: { app: AppController }) {
  const { colors, models } = app;
  const constants = Platform.constants as Record<string, unknown>;
  const rows = [
    ['App version', version],
    ['Device', String(constants.Model || constants.model || 'Unknown device')],
    ['Platform', `${Platform.OS} ${String(Platform.Version)}`],
    ['Inference engine', `llama.rn 0.12.0 · ${models.engineStatus}`],
    ['Model', models.model.displayName],
    ['Model state', models.states[models.model.id] || 'checking'],
    [
      'Storage',
      models.freeSpace === null
        ? 'Unavailable'
        : `${formatBytes(models.freeSpace)} free`,
    ],
    [
      'Model load time',
      models.loadDuration === null
        ? 'Not available'
        : `${models.loadDuration} ms`,
    ],
    [
      'Last inference check',
      models.completionDuration === null
        ? 'Not available'
        : `${models.completionDuration} ms`,
    ],
  ];
  return (
    <View>
      <View style={styles.brand}>
        <Icon name="chat" color={colors.accent} size={44} />
        <Text style={[styles.brandName, { color: colors.text }]}>LLMHub</Text>
        <Text style={[styles.paragraph, { color: colors.muted }]}>
          Local models, offline intelligence.
        </Text>
      </View>
      <Text style={[styles.section, { color: colors.accent }]}>
        Device details
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
        These device details stay on your phone. When reporting an issue, you
        can choose to include basic app and OS information.
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
  settingsSelector: { flexGrow: 0, flexShrink: 0 },
  settingsTabs: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  settingsTab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
  },
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
  diagnostic: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  brand: { alignItems: 'center', paddingVertical: 24 },
  brandName: { fontSize: 28, fontWeight: '600', marginTop: 12 },
  history: { gap: 6 },
  historyEntry: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
