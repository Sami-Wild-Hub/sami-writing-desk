// Shared outline payload; the two source documents keep their original v5 fields.
import type { OutlineSyncState } from './sync.ts';

export interface OutlinePayload {
  config: { spineGroupId: string; spineTitle: string };
  plot_data: Record<string, unknown>;
  plan: Record<string, unknown>;
  sync: OutlineSyncState;
  texts?: { plot: string; plan: string };
  starter?: { plot_data: Record<string, unknown>; plan: Record<string, unknown>; texts: { plot: string; plan: string } } | null;
}
