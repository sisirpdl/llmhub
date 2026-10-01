import { memo, useRef, useState } from 'react';
import {
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
import { IconButton, Sheet } from '../ui/Controls';
import type { Colors } from '../ui/theme';
import type { ChatController, Message } from './useChatController';
export function GenerationSettings({
  chat,
  colors,
}: {
  chat: ChatController;
  colors: Colors;
}) {
  return (
    <View style={styles.settings}>
      <Text style={[styles.settingsIntro, { color: colors.muted }]}>
        These settings apply to your next response.
      </Text>
      <Text style={[styles.settingLabel, { color: colors.text }]}>
        Temperature
      </Text>
      <Text style={[styles.caption, { color: colors.muted }]}>
        Lower values are more focused. Range: 0–2.
      </Text>
      <TextInput
        accessibilityLabel="Temperature"
        keyboardType="decimal-pad"
        value={chat.temperature}
        onChangeText={chat.setTemperature}
        style={[
          styles.settingInput,
          { backgroundColor: colors.input, color: colors.text },
        ]}
      />
      <Text style={[styles.settingLabel, { color: colors.text }]}>
        Maximum output tokens
      </Text>
      <Text style={[styles.caption, { color: colors.muted }]}>
        Longer responses take more time. Range: 1–4096.
      </Text>
      <TextInput
        accessibilityLabel="Maximum output tokens"
        keyboardType="number-pad"
        value={chat.maxTokens}
        onChangeText={chat.setMaxTokens}
        style={[
          styles.settingInput,
          { backgroundColor: colors.input, color: colors.text },
        ]}
      />
    </View>
  );
}
export function ChatView({
  chat,
  colors,
  active,
  vision,
  onModels,
  onPicker,
  settingsVisible,
  onCloseSettings,
}: {
  chat: ChatController;
  colors: Colors;
  active: boolean;
  vision: boolean;
  onModels: () => void;
  onPicker: () => void;
  settingsVisible: boolean;
  onCloseSettings: () => void;
}) {
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <FlatList
        ref={list}
        data={chat.messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        style={styles.messages}
        contentContainerStyle={styles.messageContent}
        keyboardShouldPersistTaps="handled"
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
      {chat.omittedNotice ? (
        <Text style={[styles.notice, { color: colors.muted }]}>
          Older turns were omitted to fit the model’s context window.
        </Text>
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.status, { color: colors.muted }]}
      >
        {chat.sending
          ? 'Generating on device…'
          : active
          ? 'On device · No cloud'
          : 'No model loaded'}
      </Text>
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
              onPress={() => chat.setImageUri(null)}
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
          {vision ? (
            <IconButton
              name="plus"
              label="Attach image"
              colors={colors}
              disabled={!active || chat.sending}
              onPress={chat.attachImage}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose chat model"
            disabled={chat.sending}
            onPress={onPicker}
            style={[styles.modelPicker, { backgroundColor: colors.elevated }]}
          >
            <Icon name="models" size={16} color={colors.muted} />
            <Text style={[styles.caption, { color: colors.muted }]}>Model</Text>
            <Icon name="down" size={16} color={colors.muted} />
          </Pressable>
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
      <Sheet
        visible={settingsVisible}
        onClose={onCloseSettings}
        title="Chat settings"
        colors={colors}
      >
        <GenerationSettings chat={chat} colors={colors} />
        <Pressable
          accessibilityRole="button"
          disabled={chat.sending}
          onPress={chat.resetConversation}
          style={styles.clear}
        >
          <Icon name="trash" color={colors.danger} size={20} />
          <Text style={{ color: colors.danger }}>Clear this conversation</Text>
        </Pressable>
      </Sheet>
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
          <Text style={[styles.roleText, { color: colors.muted }]}>LLMHub</Text>
        </View>
      ) : null}
      <Text selectable style={[styles.messageText, { color: colors.text }]}>
        {item.content || (sending ? 'Thinking…' : 'No response generated.')}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
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
    fontSize: 17,
    minHeight: 56,
    maxHeight: 144,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  composerTools: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modelPicker: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 22,
  },
  spacer: { flex: 1 },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  status: { fontSize: 11, textAlign: 'center', paddingVertical: 8 },
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
