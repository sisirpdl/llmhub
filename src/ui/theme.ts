export type Appearance = 'dark' | 'light' | 'system';
export const darkColors = {
  background: '#0d0d0d',
  surface: '#000000',
  elevated: '#191919',
  border: '#383838',
  text: '#e3e2e7',
  muted: '#a5a4ac',
  accent: '#aebcf4',
  primary: '#b9c6ff',
  onPrimary: '#182244',
  active: '#22c66c',
  green: '#70d7ab',
  greenSurface: '#052e1b',
  danger: '#ff7767',
  scrim: 'rgba(0,0,0,0.65)',
  input: '#171717',
};
export const lightColors: typeof darkColors = {
  background: '#f2f2f7',
  surface: '#ffffff',
  elevated: '#ffffff',
  border: '#d8d9e0',
  text: '#1c1c1e',
  muted: '#62636d',
  accent: '#415db3',
  primary: '#415db3',
  onPrimary: '#ffffff',
  active: '#167b50',
  green: '#167b50',
  greenSurface: '#e2f5eb',
  danger: '#c5382b',
  scrim: 'rgba(0,0,0,0.35)',
  input: '#e9e9ef',
};
export type Colors = typeof darkColors;
export const formatBytes = (bytes: number) =>
  `${(bytes / 1024 ** 3).toFixed(2)} GB`;
