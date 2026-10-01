import type { Colors } from '../ui/theme';
export type HubMode = 'trending' | 'popular' | 'browse';
export type HubTask = 'text' | 'vision' | 'all';
export type HubNavigationProps = {
  mode: HubMode;
  task: HubTask;
  onMode: (value: HubMode) => void;
  onTask: (value: HubTask) => void;
  colors: Colors;
};
export const modes: [HubMode, string][] = [
  ['trending', 'Trending'],
  ['popular', 'Most downloaded'],
  ['browse', 'Browse'],
];
export const tasks: [HubTask, string][] = [
  ['text', 'Text'],
  ['vision', 'Vision'],
  ['all', 'All'],
];
