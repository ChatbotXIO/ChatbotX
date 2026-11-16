import { describe, expect, test } from "vitest"
import {
  filenameFromContentDisposition,
  normalizeAIFileSourceUrl,
} from "../src/ai-file/public-url"

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const PPTX =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"

describe("normalizeAIFileSourceUrl", () => {
  test.each([
    [
      "https://docs.google.com/document/d/abc_DEF-123/edit?usp=sharing",
      "googleDocs",
      "https://docs.google.com/document/d/abc_DEF-123/export?format=txt",
      "text/plain",
    ],
    [
      "https://docs.google.com/document/u/1/d/abc123/edit",
      "googleDocs",
      "https://docs.google.com/document/d/abc123/export?format=txt",
      "text/plain",
    ],
    [
      "https://docs.google.com/spreadsheets/d/sheet1/edit#gid=0",
      "googleSheets",
      "https://docs.google.com/spreadsheets/d/sheet1/export?format=xlsx",
      XLSX,
    ],
    [
      "https://docs.google.com/presentation/d/deck1/view",
      "googleSlides",
      "https://docs.google.com/presentation/d/deck1/export/pptx",
      PPTX,
    ],
  ])("rewrites %s to its export", (input, kind, url, expectedMimeType) => {
    expect(normalizeAIFileSourceUrl(input)).toEqual({
      kind,
      url,
      expectedMimeType,
    })
  })

  test("keeps the resourcekey of a link-shared file", () => {
    expect(
      normalizeAIFileSourceUrl(
        "https://docs.google.com/document/d/abc/edit?resourcekey=0-key&usp=sharing",
      ).url,
    ).toBe(
      "https://docs.google.com/document/d/abc/export?format=txt&resourcekey=0-key",
    )
  })

  test("refuses a publish-to-web link", () => {
    expect(() =>
      normalizeAIFileSourceUrl(
        "https://docs.google.com/document/d/e/2PACX-abc/pub",
      ),
    ).toThrow(
      expect.objectContaining({ reason: "googlePublishedNotSupported" }),
    )
  })

  test("leaves other URLs (including Drive landing pages) direct", () => {
    expect(
      normalizeAIFileSourceUrl("https://drive.google.com/file/d/x/view"),
    ).toEqual({ kind: "direct", url: "https://drive.google.com/file/d/x/view" })
    expect(normalizeAIFileSourceUrl("https://example.com/a.pdf")).toEqual({
      kind: "direct",
      url: "https://example.com/a.pdf",
    })
  })

  test.each([
    "ftp://example.com/a.pdf",
    "not a url",
    "https://user:secret@example.com/a.pdf",
  ])("refuses %s as invalidUrl", (input) => {
    expect(() => normalizeAIFileSourceUrl(input)).toThrow(
      expect.objectContaining({ reason: "invalidUrl" }),
    )
  })
})

describe("filenameFromContentDisposition", () => {
  test.each([
    [null, undefined],
    ["inline", undefined],
    ['attachment; filename="manual.pdf"', "manual.pdf"],
    ["attachment; filename=manual.pdf", "manual.pdf"],
    [
      "attachment; filename=\"Bao gia.xlsx\"; filename*=UTF-8''B%C3%A1o%20gi%C3%A1.xlsx",
      "Báo giá.xlsx",
    ],
    ['attachment; filename="../../etc/passwd.txt"', "passwd.txt"],
  ])("%s → %s", (header, expected) => {
    expect(filenameFromContentDisposition(header)).toBe(expected)
  })
})
