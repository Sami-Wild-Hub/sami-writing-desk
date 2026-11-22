// Shared v6 outline payload and decoded cloud snapshot.
import type { OutlineSyncState } from './sync.ts';

export type Category = 'past' | 'current' | 'undecided';
export interface Storyline {
  id: string;
  title: string;
  participants: string[];
  time_order: Record<Category, string[]>;
  [field: string]: unknown;
}
export interface PlotUnit {
  unit_id: string;
  storyline_group_id: string;
  category: Category;
  content: string;
  element_title?: string;
  details?: string[];
  source_unit_ids?: string[];
  [field: string]: unknown;
}
export interface OutlineData {
  schema_version: '6.0';
  beats: { beat_id: string; act: number; beat: number; title?: string }[];
  storyline_groups: Storyline[];
  plot_units: PlotUnit[];
  participants: { name: string; type: string }[];
  participant_order: string[];
  [field: string]: unknown;
}
export interface OutlinePlan {
  schema_version: '6.0';
  placements: { unit_id: string; beat_id: string; order: number; [field: string]: unknown }[];
  beat_notes: Record<string, string>;
  [field: string]: unknown;
}
export interface OutlinePayload {
  config: { defaultStorylineId: string };
  plot_data: OutlineData;
  plan: OutlinePlan;
  sync: OutlineSyncState;
  texts?: { plot: string; plan: string };
  starter?: { plot_data: OutlineData; plan: OutlinePlan; texts: { plot: string; plan: string } } | null;
}
