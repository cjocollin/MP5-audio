/** Random-access byte source for lazy MP5 indexing (File/Blob or ArrayBuffer). */
export interface Mp5ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function byteSourceFromArrayBuffer(buffer: ArrayBuffer): Mp5ByteSource {
  const data = new Uint8Array(buffer);
  return {
    size: data.length,
    async read(offset: number, length: number): Promise<Uint8Array> {
      return data.slice(offset, offset + length);
    },
  };
}

export function byteSourceFromBlob(blob: Blob): Mp5ByteSource {
  return {
    size: blob.size,
    async read(offset: number, length: number): Promise<Uint8Array> {
      const buf = await blob.slice(offset, offset + length).arrayBuffer();
      return new Uint8Array(buf);
    },
  };
}
