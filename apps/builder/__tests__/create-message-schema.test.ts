import { describe, expect, test } from "vitest"
import { createMessageRequest } from "@/features/messages/schema/mutation"

describe("createMessageRequest", () => {
  test("parses {text, mediaFileId} and retains mediaFileId — proves the union matches the mediaFileId branch before the text-only branch, which would otherwise silently strip it", () => {
    const result = createMessageRequest.safeParse({
      text: "hello",
      mediaFileId: "123",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        text: "hello",
        mediaFileId: "123",
      })
    }
  })

  test("parses {mediaFileId} alone", () => {
    const result = createMessageRequest.safeParse({
      mediaFileId: "123",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({ mediaFileId: "123" })
    }
  })

  test("parses {text, mediaFileIds} and retains all ids — same silent-strip risk as mediaFileId above", () => {
    const result = createMessageRequest.safeParse({
      text: "hello",
      mediaFileIds: ["123", "456"],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        text: "hello",
        mediaFileIds: ["123", "456"],
      })
    }
  })

  test("parses {mediaFileIds} alone", () => {
    const result = createMessageRequest.safeParse({
      mediaFileIds: ["123", "456", "789"],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        mediaFileIds: ["123", "456", "789"],
      })
    }
  })

  test("rejects an empty {mediaFileIds: []}", () => {
    const result = createMessageRequest.safeParse({
      mediaFileIds: [],
    })

    expect(result.success).toBe(false)
  })

  test("rejects more than 10 mediaFileIds", () => {
    const result = createMessageRequest.safeParse({
      mediaFileIds: Array.from({ length: 11 }, (_, i) => String(i)),
    })

    expect(result.success).toBe(false)
  })

  test("still parses the legacy {text, mediaFile} path-based shape", () => {
    const result = createMessageRequest.safeParse({
      text: "hello",
      mediaFile: {
        path: "ws/1/a.png",
        url: "https://cdn.example.test/ws/1/a.png",
        mimeType: "image/png",
        name: "a.png",
        size: 1024,
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        text: "hello",
        mediaFile: { path: "ws/1/a.png" },
      })
    }
  })

  test("still parses the legacy {mediaFile} path-based shape alone", () => {
    const result = createMessageRequest.safeParse({
      mediaFile: {
        path: "ws/1/a.png",
        mimeType: "image/png",
        size: 1024,
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        mediaFile: { path: "ws/1/a.png" },
      })
    }
  })

  test("still parses plain {text}", () => {
    const result = createMessageRequest.safeParse({
      text: "hello",
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({ text: "hello" })
    }
  })
})
