import { type Readable, Transform } from "node:stream"

const getChunkByteLength = (chunk: string | Buffer | Uint8Array): number => {
  if (typeof chunk === "string") {
    return Buffer.byteLength(chunk)
  }
  return chunk.byteLength
}

export const createByteLimitedStream = (
  stream: Readable,
  input: { maxBytes: number; errorMessage: string },
): Readable => {
  let bytesRead = 0
  const guard = new Transform({
    transform(chunk: string | Buffer | Uint8Array, _encoding, callback) {
      bytesRead += getChunkByteLength(chunk)
      if (bytesRead > input.maxBytes) {
        callback(new Error(input.errorMessage))
        return
      }
      callback(null, chunk)
    },
  })
  return stream.pipe(guard)
}
