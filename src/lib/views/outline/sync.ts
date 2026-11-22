// Web client for the shared outlineSync book state.
// Reads/Writes: households/<id>/outlineSync/<slug> (RTDB, packed outline files)
import { onValue, update, type DatabaseReference } from 'firebase/database';
import { outlineConfig } from './config.js';
import { jsonText, pack, unpack } from './codec.js';
import type { OutlinePayload, OutlineData, OutlinePlan } from './schema.ts';

export interface OutlineSyncState {
  head?: { synced?: { rev: string; tree?: string; commit?: string }; repo?: { tree?: string; commit?: string; error?: string; configError?: string; at?: number }; config?: string } | null;
  live?: { rev: string; base: string; at: number; by: 'web' | 'repo'; uid?: string; over?: string; plot: string; plan: string } | null;
  incoming?: { tree: string; commit: string; plot: string; plan: string } | null;
  starter?: { commit: string; plot: string; plan: string } | null;
  kept?: { rev: string; at: number; uid: string; plot: string; plan: string } | null;
  _coordinator?: { holder?: string; host?: string; until?: number; at?: number } | null;
}

export interface PackedFiles { plot: string; plan: string; }
export interface DecodedFiles { plot: string; plan: string; plot_data: OutlineData; plan_data: OutlinePlan; }

const bookRef = (householdRef: (path: string) => DatabaseReference, slug: string) => householdRef(`outlineSync/${slug}`);
export const newRevision = () => globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12);

export function subscribe(
  householdRef: (path: string) => DatabaseReference,
  slug: string,
  next: (state: OutlineSyncState | null) => void,
  fail?: (error: Error) => void,
) {
  const ref = bookRef(householdRef, slug);
  const onError = (error: Error) => fail?.(error);
  let state: OutlineSyncState | null = null;
  let coordinator: OutlineSyncState['_coordinator'] = null;
  const emit = () => next(state ? { ...state, _coordinator: coordinator } : null);
  const stopBook = onValue(ref, snapshot => { state = snapshot.val(); emit(); }, onError);
  const stopCoordinator = onValue(householdRef('outlineSync/_coordinator'), snapshot => { coordinator = snapshot.val(); emit(); }, onError);
  return () => { stopBook(); stopCoordinator(); };
}

async function decodePacked(source: PackedFiles | null | undefined): Promise<DecodedFiles | null> {
  if (!source?.plot || !source.plan) return null;
  const [plot, plan] = await Promise.all([unpack(source.plot), unpack(source.plan)]);
  return { plot, plan, plot_data: JSON.parse(plot) as OutlineData, plan_data: JSON.parse(plan) as OutlinePlan };
}

function configObject(raw: string | undefined) {
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

export async function decodeState(state: OutlineSyncState | null | undefined): Promise<OutlinePayload | null> {
  const live = await decodePacked(state?.live);
  if (!state || !live) return null;
  let config;
  // head.config belongs to the repository's plot, which can differ from live during a conflict.
  try { config = outlineConfig(live.plot_data, configObject(state.head?.config)); }
  catch { config = outlineConfig(live.plot_data); }
  const starter = await decodePacked(state.starter);
  return {
    config,
    plot_data: live.plot_data,
    plan: live.plan_data,
    sync: state,
    texts: { plot: live.plot, plan: live.plan },
    starter: starter ? { plot_data: starter.plot_data, plan: starter.plan_data, texts: { plot: starter.plot, plan: starter.plan } } : null,
  };
}

function normalized(text: string) {
  try { return JSON.stringify(JSON.parse(text)); } catch { return text; }
}

export function workspaceFiles(workspace: { plot_data: unknown; plan: unknown }): PackedFiles {
  return { plot: jsonText(workspace.plot_data), plan: jsonText(workspace.plan) };
}

export function filesEqual(left: { plot: string; plan: string }, right: { plot: string; plan: string }) {
  return normalized(left.plot) === normalized(right.plot) && normalized(left.plan) === normalized(right.plan);
}

function keptValue(live: OutlineSyncState['live'], uid: string, at: number) {
  if (!live) return null;
  return { rev: live.rev, at, uid, plot: live.plot, plan: live.plan };
}

export async function save(
  householdRef: (path: string) => DatabaseReference,
  slug: string,
  workspace: { plot_data: unknown; plan: unknown },
  options: { base: string; uid: string; over?: string; previous?: OutlineSyncState['live']; current?: OutlineSyncState['live']; at?: number; revision?: () => string },
) {
  const files = workspaceFiles(workspace);
  const live = {
    rev: (options.revision ?? newRevision)(), base: options.base, at: options.at ?? Date.now(), by: 'web' as const,
    uid: options.uid, over: options.over ?? '', plot: await pack(files.plot), plan: await pack(files.plan),
  };
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(live)) {
    if ((key === 'plot' || key === 'plan') && options.current && normalized(files[key]) === normalized(await unpack(options.current[key]))) continue;
    values[`live/${key}`] = value;
  }
  const kept = keptValue(options.previous, options.uid, live.at);
  if (kept) values.kept = kept;
  await update(bookRef(householdRef, slug), values);
  return live;
}

export async function resolve(
  householdRef: (path: string) => DatabaseReference,
  slug: string,
  action: 'keep-web' | 'use-repo' | 'use-local' | 'fix-repo',
  state: OutlineSyncState,
  workspace: { plot_data: unknown; plan: unknown },
  options: { uid: string; at?: number; revision?: () => string },
) {
  const live = state.live;
  if (!live) throw new Error('云端大纲尚未初始化');
  if (action === 'use-repo') {
    const incoming = await decodePacked(state.incoming);
    if (!incoming || !state.incoming) throw new Error('仓库版本不可用');
    return save(householdRef, slug, { plot_data: incoming.plot_data, plan: incoming.plan_data }, {
      base: live.rev, uid: options.uid, over: state.incoming.tree, previous: live, current: live, at: options.at, revision: options.revision,
    });
  }
  const over = action === 'keep-web' ? state.incoming?.tree : action === 'fix-repo' ? state.head?.repo?.tree : '';
  return save(householdRef, slug, workspace, {
    base: live.rev, uid: options.uid, over: over ?? '', previous: action === 'use-local' ? live : undefined, current: live,
    at: options.at, revision: options.revision,
  });
}
