import { describe, expect, test } from "vitest"
import {
  AI_FILE_EXTENSION_MIME_TYPES,
  AI_FILE_MIME_TYPES,
  isGenericMimeType,
  isKnowledgeMimeType,
  knowledgeMimeTypeFromFilename,
  normalizeBaseMimeType,
} from "../src/lib/shared/mime-types"

describe("knowledge MIME types", () => {
  test("normalizeBaseMimeType lowercases and drops parameters", () => {
    expect(normalizeBaseMimeType(" Text/Plain; charset=UTF-8")).toBe(
      "text/plain",
    )
  })

  test.each([
    ["text/plain; charset=utf-8", true],
    ["application/json", true],
    ["APPLICATION/PDF", true],
    ["application/octet-stream", false],
    ["image/png", false],
    ["", false],
  ])("isKnowledgeMimeType(%s) is %s", (mimeType, expected) => {
    expect(isKnowledgeMimeType(mimeType)).toBe(expected)
  })

  test.each([
    ["", true],
    [undefined, true],
    ["application/octet-stream", true],
    ["Binary/Octet-Stream; charset=binary", true],
    ["text/plain", false],
    ["image/png", false],
  ])("isGenericMimeType(%s) is %s", (mimeType, expected) => {
    expect(isGenericMimeType(mimeType)).toBe(expected)
  })

  test("every extension maps to a knowledge MIME type", () => {
    for (const mimeType of Object.values(AI_FILE_EXTENSION_MIME_TYPES)) {
      expect(AI_FILE_MIME_TYPES).toContain(mimeType)
    }
  })

  test.each(
    Object.entries(AI_FILE_EXTENSION_MIME_TYPES),
  )("knowledgeMimeTypeFromFilename(.%s) ignores case", (extension, mimeType) => {
    expect(knowledgeMimeTypeFromFilename(`Report.${extension}`)).toBe(mimeType)
    expect(
      knowledgeMimeTypeFromFilename(`REPORT.${extension.toUpperCase()}`),
    ).toBe(mimeType)
  })

  test.each([
    "README",
    "archive.zip",
    "trailing.",
    "photo.png",
    "constructor",
    "x.constructor",
  ])("knowledgeMimeTypeFromFilename(%s) is undefined", (name) => {
    expect(knowledgeMimeTypeFromFilename(name)).toBeUndefined()
  })

  test("uses only the last extension", () => {
    expect(knowledgeMimeTypeFromFilename("notes.pdf.txt")).toBe("text/plain")
  })
})
