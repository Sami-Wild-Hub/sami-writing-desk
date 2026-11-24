// The three versioned outline documents; foreshadow is optional for each book.
import { pack, unpack } from '../../src/lib/views/outline/codec.js';
import { validateForeshadow } from '../../src/lib/views/foreshadow/model.js';

export const documentNames = ['plot', 'plan', 'foreshadow'];
export const sameDocuments = (a, b) => documentNames.every(name => (a[name] ?? null) === (b[name] ?? null));
export async function packedDocuments(source) {
  return Object.fromEntries(await Promise.all(documentNames.map(async name =>
    [name, source[name] == null ? null : await pack(source[name])])));
}
export async function decodedDocuments(source) {
  if (!source?.plot || !source.plan) return null;
  return Object.fromEntries(await Promise.all(documentNames.map(async name =>
    [name, source[name] == null ? null : await unpack(source[name])])));
}
export function validateOptionalForeshadow(text) {
  if (text != null) validateForeshadow(JSON.parse(text));
}
