import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { memo, useRef, useState } from 'react';
import { messageText, imageUrls } from './chatDocument';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/Controls';
import type { Colors } from '../ui/theme';
import type { ChatController, Message } from './useChatController';
export function ChatView({
  chat,
  colors,
  active,
  vision,
  onModels,
  onPicker,
  onSettings,
  onAttachImage,
  onDocuments,
}: {
  chat: ChatController;
  colors: Colors;
  active: boolean;
  vision: boolean;
  onModels: () => void;
  onPicker: () => void;
  settingsVisible?: boolean;
  onCloseSettings?: () => void;
  onSettings?: () => void;
  onAttachImage?: () => void;
  onDocuments?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<Message>>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const disabled =
    !active ||
    !chat.loaded ||
    (!chat.sending && !chat.draft.trim() && !chat.imageUri);
  const renderMessage = ({ item }: { item: Message }) => (
    <MessageBubble
      item={item}
      colors={colors}
      sending={item.content ? false : chat.sending}
    />
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top + (Platform.OS === 'ios' ? 52 : 64)}
    >
      <FlatList
        ref={list}
        data={chat.messageItems}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        style={styles.messages}
        contentContainerStyle={styles.messageContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onLayout={() => {
          if (atBottom.current) list.current?.scrollToEnd({ animated: false });
        }}
        onScroll={event => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          atBottom.current =
            contentSize.height - layoutMeasurement.height - contentOffset.y <
            100;
          setShowJump(!atBottom.current);
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (atBottom.current) list.current?.scrollToEnd({ animated: false });
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View
              style={[styles.emptyIcon, { backgroundColor: colors.elevated }]}
            >
              <Icon
                name={active ? 'chat' : 'models'}
                size={32}
                color={colors.accent}
              />
            </View>
            <Text
              accessibilityRole="header"
              style={[styles.emptyTitle, { color: colors.text }]}
            >
              {active ? 'Your space to think.' : 'Load a model to chat'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {active
                ? 'Ask a question, explore an idea, or start writing. This conversation stays on your device.'
                : 'Download a supported model and load it to start a private, offline conversation.'}
            </Text>
            {!active ? (
              <Pressable
                accessibilityRole="button"
                onPress={onModels}
                style={[styles.emptyAction, { borderColor: colors.border }]}
              >
                <Text style={[styles.link, { color: colors.accent }]}>
                  Choose a model
                </Text>
                <Icon name="arrow" color={colors.accent} size={18} />
              </Pressable>
            ) : (
              <View style={styles.suggestions}>
                {[
                  'Explain something simply',
                  'Help me write',
                  'Brainstorm an idea',
                ].map(label => (
                  <Pressable
                    accessibilityRole="button"
                    key={label}
                    onPress={() => chat.setDraft(label)}
                    style={[styles.suggestion, { borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.muted }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        }
      />
      {showJump ? (
        <View style={styles.jump}>
          <IconButton
            name="down"
            label="Scroll to latest message"
            colors={colors}
            onPress={() => {
              atBottom.current = true;
              setShowJump(false);
              list.current?.scrollToEnd({ animated: true });
            }}
          />
        </View>
      ) : null}
      {chat.error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.notice, { color: colors.danger }]}
        >
          {chat.error}
        </Text>
      ) : null}
      {chat.imageContextUnavailable ? (
        <Text style={[styles.notice, { color: colors.muted }]}>
          This text model cannot see earlier images. Their accompanying text is
          included.
        </Text>
      ) : null}
      {chat.omittedNotice ? (
        <Text style={[styles.notice, { color: colors.muted }]}>
          Older turns were omitted to fit the model’s context window.
        </Text>
      ) : null}
      {chat.retrievedSources.length ? (
        <View>
          <Text style={[styles.notice, { color: colors.muted }]}>
            Reference passages:
          </Text>
          {chat.retrievedSources.map((source, index) => (
            <Pressable
              key={source.id}
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  `${source.documentName}${
                    source.page ? ` · page ${source.page}` : ''
                  }`,
                  source.text,
                )
              }
            >
              <Text style={[styles.notice, { color: colors.accent }]}>
                [{index + 1}] {source.documentName}
                {source.page ? ` · page ${source.page}` : ''} · View passage
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.statusRow}>
        {onDocuments ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ask your docs"
            accessibilityState={{ disabled: chat.sending || !chat.loaded }}
            disabled={chat.sending || !chat.loaded}
            onPress={onDocuments}
            style={styles.docsControl}
          >
            <Icon
              name={chat.documentIds.length ? 'connected' : 'disconnected'}
              size={16}
              color={chat.documentIds.length ? colors.green : colors.muted}
            />
            <Text
              style={{
                color: chat.documentIds.length ? colors.green : colors.muted,
              }}
            >
              Ask your docs · {chat.documentIds.length} connected
            </Text>
          </Pressable>
        ) : null}
        {chat.sending || !active ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.status, { color: colors.muted }]}
          >
            {chat.sending ? 'Generating…' : 'No model loaded'}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.composer,
          { backgroundColor: colors.input, borderColor: colors.border },
          Platform.OS === 'ios' && styles.iosComposer,
        ]}
      >
        {chat.imageUri ? (
          <View style={styles.attachment}>
            <Image source={{ uri: chat.imageUri }} style={styles.thumbnail} />
            <Text style={{ color: colors.text }}>Image attached</Text>
            <IconButton
              name="close"
              label="Remove selected image"
              colors={colors}
              onPress={chat.removeAttachment}
            />
          </View>
        ) : null}
        <TextInput
          accessibilityLabel="Message"
          value={chat.draft}
          onChangeText={chat.setDraft}
          editable={active && chat.loaded && !chat.sending}
          multiline
          placeholder={
            chat.imageUri ? 'Ask about this image' : 'Type your message here'
          }
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.text }]}
        />
        <View style={styles.composerTools}>
          {vision || onAttachImage ? (
            <IconButton
              name="image"
              label="Attach image"
              colors={colors}
              disabled={chat.sending || (!onAttachImage && !active)}
              onPress={onAttachImage || (() => chat.attachImage('gallery'))}
            />
          ) : null}
          <IconButton
            name="swap"
            label="Choose chat model"
            colors={colors}
            disabled={chat.sending}
            onPress={onPicker}
          />
          <IconButton
            name="sliders"
            label="Open model settings"
            colors={colors}
            disabled={chat.sending}
            onPress={onSettings || (() => {})}
          />
          <View style={styles.spacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              chat.sending ? 'Stop generation' : 'Send message'
            }
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={chat.sending ? chat.stopGeneration : chat.sendMessage}
            style={[
              styles.send,
              { backgroundColor: disabled ? colors.elevated : colors.primary },
              disabled && styles.disabled,
            ]}
          >
            <Icon
              name={chat.sending ? 'stop' : 'send'}
              color={disabled ? colors.muted : colors.onPrimary}
              size={23}
            />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
const MessageBubble = memo(function MessageBubbleContent({
  item,
  colors,
  sending,
}: {
  item: Message;
  colors: Colors;
  sending: boolean;
}) {
  if (item.event === 'model-switch')
    return (
      <View style={styles.divider}>
        <Text style={[styles.caption, { color: colors.muted }]}>
          {messageText(item)}
        </Text>
      </View>
    );
  return (
    <View
      style={[
        styles.message,
        item.role === 'user'
          ? [styles.userMessage, { backgroundColor: colors.elevated }]
          : styles.assistantMessage,
      ]}
    >
      {item.role !== 'user' ? (
        <View style={styles.role}>
          <Icon name="chat" size={17} color={colors.accent} />
          <Text style={[styles.roleText, { color: colors.muted }]}>
            {item.role === 'tool'
              ? `Tool: ${item.name || item.tool_call_id}`
              : item.modelName || 'LLMHub'}
          </Text>
        </View>
      ) : null}
      {imageUrls(item)
        .filter(
          uri => uri.startsWith('file://') || uri.startsWith('data:image/'),
        )
        .map((uri, index) => (
          <Image
            key={`${index}-${uri}`}
            source={{ uri }}
            style={styles.messageImage}
            accessibilityLabel="Saved image attachment"
          />
        ))}
      {imageUrls(item).some(url => url.startsWith('https://')) ? (
        <Text style={{ color: colors.muted }}>
          External image reference · not fetched
        </Text>
      ) : null}
      <Text selectable style={[styles.messageText, { color: colors.text }]}>
        {messageText(item) ||
          (item.tool_calls
            ? `Tool call: ${item.tool_calls
                .map(call => call.function.name)
                .join(', ')}`
            : item.role === 'tool'
            ? 'Tool result'
            : sending
            ? 'Thinking…'
            : 'No text content.')}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  divider: { alignItems: 'center', paddingVertical: 8 },
  messageImage: { width: 220, height: 180, borderRadius: 12, marginBottom: 10 },
  container: { flex: 1 },
  messages: { flex: 1 },
  messageContent: { flexGrow: 1, padding: 20, gap: 24, paddingBottom: 24 },
  message: { maxWidth: '94%' },
  userMessage: { alignSelf: 'flex-end', borderRadius: 20, padding: 16 },
  assistantMessage: { alignSelf: 'stretch' },
  messageText: { fontSize: 16, lineHeight: 25 },
  role: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  roleText: { fontSize: 12, fontWeight: '500' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 44,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: { fontSize: 24, fontWeight: '500', textAlign: 'center' },
  emptyText: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 310,
    marginTop: 12,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 24,
  },
  link: { fontSize: 15, fontWeight: '500' },
  suggestions: { marginTop: 24, gap: 10 },
  suggestion: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  composer: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 8,
  },
  iosComposer: { borderRadius: 20, marginHorizontal: 16 },
  input: {
    textAlignVertical: 'top',
    fontSize: 17,
    minHeight: 56,
    maxHeight: 144,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  composerTools: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spacer: { flex: 1 },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  status: { fontSize: 11, flexShrink: 1 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 44,
    gap: 12,
    flexWrap: 'wrap',
  },
  docsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
  },
  notice: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  jump: { alignSelf: 'center' },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
  },
  thumbnail: { height: 44, width: 44, borderRadius: 8 },
  settings: { gap: 8 },
  settingsIntro: { fontSize: 14, lineHeight: 21, marginBottom: 8 },
  settingLabel: { fontSize: 17, marginTop: 8 },
  caption: { fontSize: 13, lineHeight: 19 },
  settingInput: { fontSize: 17, borderRadius: 12, padding: 14 },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    marginTop: 16,
  },
});
