// Encode outline file text for the RTDB string fields.
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function streamBytes(stream, input) {
  const chunks = [];
  const reader = stream.readable.getReader();
  const read = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  })();
  const writer = stream.writable.getWriter();
  await writer.write(input);
  await writer.close();
  await read;
  const bytes = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function jsonText(value) {
  return typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
}

export async function pack(value) {
  const compressed = await streamBytes(new CompressionStream('gzip'), textEncoder.encode(jsonText(value)));
  let binary = '';
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function unpack(encoded) {
  if (typeof encoded !== 'string') throw new TypeError('Packed outline value must be text');
  let binary;
  try { binary = atob(encoded); } catch (error) { throw new Error('Invalid packed outline value', { cause: error }); }
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const plain = await streamBytes(new DecompressionStream('gzip'), bytes);
  return textDecoder.decode(plain);
}

