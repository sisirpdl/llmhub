import Svg, { Path } from 'react-native-svg';
const paths = {
  menu: 'M4 6h16M4 12h12M4 18h16',
  chat: 'M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-5 3v-3H3V5a2 2 0 0 1 2-2zM8 8h8M8 12h5',
  models: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  settings:
    'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  sliders: 'M6 3v5m0 4v9M12 3v10m0 4v4M18 3v2m0 4v12M3 8h6M9 17h6M15 5h6',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 11v6M12 7h.01',
  plus: 'M12 5v14M5 12h14',
  swap: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',
  connected:
    'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  disconnected:
    'M8 10l-4 4a5 5 0 0 0 7 7l2-2M16 14l4-4a5 5 0 0 0-7-7l-2 2M3 3l18 18',
  close: 'M6 6l12 12M18 6 6 18',
  down: 'm6 9 6 6 6-6',
  up: 'm6 15 6-6 6 6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  offload: 'm7 11 5-6 5 6M5 15h14M5 19h14',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0zm-2 5 6 6',
  send: 'm3 11 18-8-8 18-2-8-8-2zm8 2L21 3',
  edit: 'M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7M16 3l5 5-9 9-5 1 1-5 8-10z',
  more: 'M12 4h.01M12 12h.01M12 20h.01',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4zm-5 10 3 3 7-7',
  check: 'm5 12 4 4L19 6',
  stop: 'M6 6h12v12H6z',
  image: 'M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M16 7h.01',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  storage: 'M4 4h16v16H4zM7 4v6h10V4M7 20v-7h10v7',
  external: 'M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 2',
};
export type IconName = keyof typeof paths;
export function Icon({
  name,
  color,
  size = 24,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
    >
      <Path
        d={paths[name]}
        fill="none"
        stroke={color}
        strokeWidth={name === 'more' ? 3.5 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
