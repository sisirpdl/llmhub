import GlyphDocument from 'lucide-react-native/icons/file-text';
import GlyphQr from 'lucide-react-native/icons/qr-code';
import GlyphIssue from 'lucide-react-native/icons/message-square-warning';
import GlyphMenu from 'lucide-react-native/icons/menu';
import GlyphChat from 'lucide-react-native/icons/message-circle';
import GlyphModels from 'lucide-react-native/icons/layers';
import GlyphSettings from 'lucide-react-native/icons/settings-2';
import GlyphSliders from 'lucide-react-native/icons/sliders-horizontal';
import GlyphInfo from 'lucide-react-native/icons/info';
import GlyphPlus from 'lucide-react-native/icons/plus';
import GlyphSwap from 'lucide-react-native/icons/arrow-left-right';
import GlyphConnected from 'lucide-react-native/icons/link';
import GlyphDisconnected from 'lucide-react-native/icons/unlink';
import GlyphClose from 'lucide-react-native/icons/x';
import GlyphDown from 'lucide-react-native/icons/chevron-down';
import GlyphUp from 'lucide-react-native/icons/chevron-up';
import GlyphDownload from 'lucide-react-native/icons/download';
import GlyphOffload from 'lucide-react-native/icons/hard-drive-upload';
import GlyphTrash from 'lucide-react-native/icons/trash';
import GlyphEye from 'lucide-react-native/icons/eye';
import GlyphEyeOff from 'lucide-react-native/icons/eye-off';
import GlyphSearch from 'lucide-react-native/icons/search';
import GlyphSend from 'lucide-react-native/icons/send';
import GlyphEdit from 'lucide-react-native/icons/square-pen';
import GlyphMore from 'lucide-react-native/icons/ellipsis-vertical';
import GlyphShield from 'lucide-react-native/icons/shield-check';
import GlyphCheck from 'lucide-react-native/icons/check';
import GlyphStop from 'lucide-react-native/icons/square';
import GlyphImage from 'lucide-react-native/icons/image';
import GlyphArrow from 'lucide-react-native/icons/arrow-right';
import GlyphBack from 'lucide-react-native/icons/arrow-left';
import GlyphStorage from 'lucide-react-native/icons/hard-drive';
import GlyphSave from 'lucide-react-native/icons/save';
import GlyphExternal from 'lucide-react-native/icons/external-link';
import GlyphClock from 'lucide-react-native/icons/clock';
const icons = {
  document: GlyphDocument,
  qr: GlyphQr,
  issue: GlyphIssue,
  menu: GlyphMenu,
  chat: GlyphChat,
  models: GlyphModels,
  settings: GlyphSettings,
  sliders: GlyphSliders,
  info: GlyphInfo,
  plus: GlyphPlus,
  swap: GlyphSwap,
  connected: GlyphConnected,
  disconnected: GlyphDisconnected,
  close: GlyphClose,
  down: GlyphDown,
  up: GlyphUp,
  download: GlyphDownload,
  offload: GlyphOffload,
  trash: GlyphTrash,
  eye: GlyphEye,
  eyeOff: GlyphEyeOff,
  search: GlyphSearch,
  send: GlyphSend,
  edit: GlyphEdit,
  more: GlyphMore,
  shield: GlyphShield,
  check: GlyphCheck,
  stop: GlyphStop,
  image: GlyphImage,
  arrow: GlyphArrow,
  back: GlyphBack,
  storage: GlyphStorage,
  save: GlyphSave,
  external: GlyphExternal,
  clock: GlyphClock,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  color,
  size = 24,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
  const Glyph = icons[name];
  return (
    <Glyph
      size={size}
      color={color}
      strokeWidth={1.75}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
