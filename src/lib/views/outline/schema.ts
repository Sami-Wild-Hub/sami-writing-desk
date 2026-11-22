// Private outline envelope; the two source documents keep their original v5 fields.
import { createOutlineModel } from './model.js';

export interface OutlinePayload {
  revision: string;
  config: { spineGroupId: string; spineTitle: string };
  plot_data: Record<string, unknown>;
  plan: Record<string, unknown>;
}

export function parseOutline(raw: unknown): OutlinePayload | null {
  if (raw === null) return null;
  const value = typeof raw === 'string' ? JSON.parse(raw) as OutlinePayload : raw as OutlinePayload;
  if (!value || typeof value.revision !== 'string' || !value.config ||
      typeof value.config.spineGroupId !== 'string' || typeof value.config.spineTitle !== 'string') {
    throw Error('大纲数据格式无效');
  }
  const model = createOutlineModel(value.plot_data, value.plan);
  if (!Object.hasOwn(model.storyMap, value.config.spineGroupId)) throw Error('大纲主轴故事线不存在');
  return value;
}
