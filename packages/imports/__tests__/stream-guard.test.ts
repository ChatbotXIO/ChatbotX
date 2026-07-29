import { Readable } from "node:stream"
import { describe, expect, test } from "vitest"
import { createByteLimitedStream } from "../src/stream-guard"

const collectStream = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

describe("byte-limited import stream", () => {
  test("passes content at the configured byte limit", async () => {
    const stream = createByteLimitedStream(Readable.from(["12345"]), {
      maxBytes: 5,
      errorMessage: "too large",
    })

    await expect(collectStream(stream)).resolves.toEqual(Buffer.from("12345"))
  })

  test("rejects content that exceeds the configured byte limit", async () => {
    const stream = createByteLimitedStream(Readable.from(["123", "456"]), {
      maxBytes: 5,
      errorMessage: "too large",
    })

    await expect(collectStream(stream)).rejects.toThrow("too large")
  })
})
