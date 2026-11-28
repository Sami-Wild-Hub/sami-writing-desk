// The proofdesk model registry shared by the browser and the watcher CLI.
export const MODELS = [
  { id: 'open', label: 'GPT chat', transport: 'gpt' },
  { id: 'opus', label: 'Opus 5.5 high', transport: 'cli', agent: 'claude-opus-high' },
  { id: 'terra', label: 'Terra 6.1 max', transport: 'cli', agent: 'terra-max' },
] as const;

export type ModelConfig = (typeof MODELS)[number];
export type ModelId = ModelConfig['id'];
export const MODEL_IDS = MODELS.map((model) => model.id);

export function isModelId(value: string): value is ModelId {
  return MODEL_IDS.includes(value as ModelId);
}

export function modelConfig(id: string) {
  return MODELS.find((model) => model.id === id);
}
