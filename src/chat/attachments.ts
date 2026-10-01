import RNFS from 'react-native-fs';
const directory = () => `${RNFS.DocumentDirectoryPath}/chat-images`;
export async function saveChatImage(uri: string): Promise<string> {
  await RNFS.mkdir(directory());
  const extension =
    uri.split(/[?#]/)[0].match(/\.(png|jpe?g|webp|heic)$/i)?.[1] || 'jpg';
  const target = `${directory()}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${extension}`;
  try {
    await RNFS.copyFile(
      uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri,
      target,
    );
    return `file://${target}`;
  } catch (error) {
    if (await RNFS.exists(target)) await RNFS.unlink(target).catch(() => {});
    throw error;
  }
}
export async function removeChatImages(uris: string[]): Promise<void> {
  for (const uri of new Set(uris)) {
    const path = uri.startsWith('file://') ? uri.slice(7) : '';
    if (
      path.startsWith(`${directory()}/`) &&
      !path.slice(directory().length + 1).includes('/') &&
      (await RNFS.exists(path))
    )
      await RNFS.unlink(path).catch(() => {});
  }
}
