// Owner attachments read from the book's private images JSON payload.
export interface OwnerImage { caption: string; src: string; }
export type OwnerImages = Record<string, OwnerImage[]>;

export function parseOwnerImages(raw: unknown): OwnerImages | null {
  if (raw == null) return null;
  const value = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('图片数据格式无效');
  for (const images of Object.values(value)) {
    if (!Array.isArray(images) || !images.every(image => image && typeof image.caption === 'string' &&
      typeof image.src === 'string' && image.src.startsWith('data:image/webp;base64,'))) throw new Error('图片数据格式无效');
  }
  return value as OwnerImages;
}
