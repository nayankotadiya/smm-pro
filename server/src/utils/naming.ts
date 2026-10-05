import { STAGES, Stage } from '../config/constants';
export function progressFor(stage: Stage) {
  const i = STAGES.indexOf(stage);
  return Math.round((i / (STAGES.length - 1)) * 100);
}
export function stageIndex(stage: Stage) { return STAGES.indexOf(stage) + 1; }
export function slug(s: string) {
  return s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
export function extOf(name: string, mime?: string) {
  const m = /\.([a-zA-Z0-9]{1,6})$/.exec(name);
  if (m) return m[1].toLowerCase();
  if (mime?.startsWith('video/')) return 'mp4';
  if (mime?.startsWith('image/')) return 'jpg';
  return 'bin';
}
/** REEL-2026-001_EDIT_V2.mp4 */
export function mediaFileName(contentCode: string, category: string, version: number, originalName: string, mime?: string) {
  return `${contentCode}_${category}_V${version}.${extOf(originalName, mime)}`;
}
export const VERSIONED = ['RAW', 'EDIT', 'FINAL', 'THUMBNAIL'];
