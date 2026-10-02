import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, IconButton } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import type { Colors } from '../ui/theme';
import { pickTextDocument } from './documentStore';
import { DocumentImportCancelled } from './pdfText';
import type { DocumentController } from './useDocumentIndex';

export function DocumentLibraryView({
  controller,
  colors,
  selected,
  onToggle,
  disabled = false,
  onPickerStateChange,
}: {
  controller: DocumentController;
  colors: Colors;
  selected?: string[];
  onToggle?: (id: string) => void;
  disabled?: boolean;
  onPickerStateChange?: (active: boolean) => void;
}) {
  const [pickerError, setPickerError] = useState('');
  const [picking, setPicking] = useState(false);
  async function addDocument() {
    setPickerError('');
    setPicking(true);
    onPickerStateChange?.(true);
    try {
      const picked = await pickTextDocument();
      // The external picker has closed; extraction can continue without holding the model in the background.
      onPickerStateChange?.(false);
      if (picked) {
        const document = await controller.importDocument(picked);
        if (onToggle) onToggle(document.id);
      }
    } catch (cause) {
      if (!(cause instanceof DocumentImportCancelled))
        setPickerError(
          cause instanceof Error ? cause.message : 'Document import failed.',
        );
    } finally {
      setPicking(false);
      onPickerStateChange?.(false);
    }
  }
  function confirmDelete(document: (typeof controller.documents)[number]) {
    Alert.alert(
      'Delete from library?',
      `${document.name} and its index will be deleted. Chats using it will need to detach or replace it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => controller.removeDocument(document).catch(() => {}),
        },
      ],
    );
  }
  return (
    <View style={styles.container}>
      <Text style={[styles.description, { color: colors.muted }]}>
        {onToggle
          ? 'Select files for this chat. Other chats search only their own attachments. '
          : 'Import files here, then attach them from a chat. '}
        PDF, Markdown, and text files stay on this device. Scanned PDFs require
        OCR and are not supported yet.
      </Text>
      <Button
        label={
          controller.working
            ? controller.progress || 'Working…'
            : 'Add document'
        }
        icon="plus"
        colors={colors}
        disabled={
          disabled || picking || controller.working || !controller.loaded
        }
        onPress={addDocument}
      />
      {controller.working && controller.progress ? (
        <Button
          label="Cancel import"
          colors={colors}
          onPress={controller.cancelImport}
        />
      ) : null}
      {pickerError || controller.error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
          {pickerError || controller.error}
        </Text>
      ) : null}
      {controller.documents.map(document => (
        <View
          key={document.id}
          style={[styles.row, { borderColor: colors.border }]}
        >
          <Icon name="models" color={colors.accent} size={20} />
          <Pressable
            accessibilityRole={onToggle ? 'checkbox' : 'text'}
            accessibilityLabel={`${document.name}${
              onToggle ? ', use in this chat' : ''
            }`}
            accessibilityState={{
              checked: selected?.includes(document.id),
              disabled: disabled || controller.working,
            }}
            disabled={!onToggle || disabled || controller.working}
            onPress={() => onToggle?.(document.id)}
            style={styles.name}
          >
            <Text numberOfLines={1} style={{ color: colors.text }}>
              {document.name}
            </Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              {Math.ceil(document.size / 1024)} KB
              {document.pageCount ? ` · ${document.pageCount} pages` : ''}
              {onToggle
                ? selected?.includes(document.id)
                  ? ' · Attached'
                  : ' · Tap to attach'
                : ' · indexed locally'}
            </Text>
            {document.emptyPages ? (
              <Text style={[styles.meta, { color: colors.muted }]}>
                {document.emptyPages} pages have no extractable text and are not
                searchable.
              </Text>
            ) : null}
          </Pressable>
          <IconButton
            name="trash"
            label={`Remove ${document.name}`}
            colors={colors}
            disabled={disabled || controller.working}
            onPress={() => confirmDelete(document)}
          />
        </View>
      ))}
      {selected
        ?.filter(
          id => !controller.documents.some(document => document.id === id),
        )
        .map(id => (
          <Button
            key={id}
            label="Detach missing document"
            colors={colors}
            disabled={disabled}
            onPress={() => onToggle?.(id)}
          />
        ))}
      {!controller.documents.length && controller.loaded ? (
        <Text style={[styles.empty, { color: colors.muted }]}>
          No local documents yet.
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 16 },
  description: { fontSize: 14, lineHeight: 21 },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  name: { flex: 1, gap: 3 },
  meta: { fontSize: 12 },
  empty: { paddingVertical: 8 },
});
