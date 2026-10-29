import { PassThrough } from "node:stream"
import { describe, expect, test, vi } from "vitest"
import { toUploadWriter } from "../src/lib/upload-writer"

/** A streaming upload whose outcome the test decides. */
const createFakeUpload = (options?: { reading?: boolean }) => {
  const stream = new PassThrough({ highWaterMark: 1 })
  const chunks: string[] = []
  if (options?.reading !== false) {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk.toString()))
  }
  let settle: { resolve: () => void; reject: (error: Error) => void } = {
    resolve: () => undefined,
    reject: () => undefined,
  }
  const done = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject }
  })
  return { upload: { stream, done }, chunks, settle }
}

describe("toUploadWriter", () => {
  test("writes chunks in order and finishes once the upload completes", async () => {
    const { upload, chunks, settle } = createFakeUpload()
    const writer = toUploadWriter(upload)

    await writer.write("a,b\n")
    await writer.write("1,2\n")
    const finished = writer.finish()
    settle.resolve()
    await finished

    expect(chunks.join("")).toBe("a,b\n1,2\n")
    expect(upload.stream.writableEnded).toBe(true)
  })

  test("rejects a write stuck on backpressure as soon as the upload fails", async () => {
    // Nothing reads the stream, as when every lib-storage part upload failed.
    const { upload, settle } = createFakeUpload({ reading: false })
    const writer = toUploadWriter(upload)

    const pending = writer.write("a large chunk")
    await vi.waitFor(() => expect(upload.stream.writableNeedDrain).toBe(true))
    settle.reject(new Error("part upload failed"))

    await expect(pending).rejects.toThrow("part upload failed")
  })

  test("rejects every later write at once, without touching the stream", async () => {
    const { upload, settle } = createFakeUpload()
    const writer = toUploadWriter(upload)
    settle.reject(new Error("part upload failed"))
    await upload.done.catch(() => undefined)
    const write = vi.spyOn(upload.stream, "write")

    await expect(writer.write("x")).rejects.toThrow("part upload failed")
    expect(write).not.toHaveBeenCalled()
  })

  test("finish surfaces the upload failure", async () => {
    const { upload, settle } = createFakeUpload()
    const writer = toUploadWriter(upload)
    settle.reject(new Error("complete failed"))

    await expect(writer.finish()).rejects.toThrow("complete failed")
  })

  test("abort stops the stream and waits for the upload to settle, failed or not", async () => {
    const { upload, settle } = createFakeUpload()
    const writer = toUploadWriter(upload)
    settle.reject(new Error("aborted"))

    await expect(writer.abort()).resolves.toBeUndefined()
    expect(upload.stream.destroyed).toBe(true)
  })
})
