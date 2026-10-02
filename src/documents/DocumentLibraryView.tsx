import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, IconButton } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import type { Colors } from '../ui/theme';
import { pickTextDocument } from './documentStore';
import type { DocumentController } from './useDocumentIndex';

export function DocumentLibraryView({
  controller,
  colors,
}: {
  controller: DocumentController;
  colors: Colors;
}) {
  async function addDocument() {
    try {
      const picked = await pickTextDocument();
      if (picked) await controller.importDocument(picked);
    } catch {
      // The controller owns the user-visible import error.
    }
  }

  function confirmDelete(document: (typeof controller.documents)[number]) {
    Alert.alert('Remove document?', `${document.name} and its local index will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => controller.removeDocument(document).catch(() => {}),
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.description, { color: colors.muted }]}>
        Add Markdown or text files for local retrieval. Files and indexes stay on this device.
      </Text>
      <Button
        label={controller.working ? 'Indexing…' : 'Add document'}
        icon="plus"
        colors={colors}
        disabled={controller.working}
        onPress={addDocument}
      />
      {controller.error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
          {controller.error}
        </Text>
      ) : null}
      {controller.documents.map(document => (
        <View key={document.id} style={[styles.row, { borderColor: colors.border }]}>
          <Icon name="models" color={colors.accent} size={20} />
          <View style={styles.name}>
            <Text numberOfLines={1} style={{ color: colors.text }}>{document.name}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              {Math.ceil(document.size / 1024)} KB · indexed locally
            </Text>
          </View>
          <IconButton
            name="trash"
            label={`Remove ${document.name}`}
            colors={colors}
            onPress={() => confirmDelete(document)}
          />
        </View>
      ))}
      {!controller.documents.length && controller.loaded ? (
        <Text style={[styles.empty, { color: colors.muted }]}>No local documents yet.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  description: { fontSize: 14, lineHeight: 21 },
  row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, paddingVertical: 8 },
  name: { flex: 1, gap: 3 },
  meta: { fontSize: 12 },
  empty: { paddingVertical: 8 },
});
