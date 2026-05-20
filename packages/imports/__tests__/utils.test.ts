import { describe, expect, it } from "vitest"
import { inferImportFormat, replaceTemplate } from "../src/utils"

describe("inferImportFormat", () => {
  it("maps known mime types to a format", () => {
    expect(inferImportFormat({ mimeType: "text/csv" })).toBe("csv")
    expect(inferImportFormat({ mimeType: "application/csv" })).toBe("csv")
    expect(inferImportFormat({ mimeType: "application/vnd.ms-excel" })).toBe(
      "xls",
    )
    expect(
      inferImportFormat({
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).toBe("xlsx")
  })

  it("matches mime types case-insensitively", () => {
    expect(inferImportFormat({ mimeType: "TEXT/CSV" })).toBe("csv")
  })

  it("falls back to the file extension when the mime type is unknown", () => {
    expect(
      inferImportFormat({
        mimeType: "application/octet-stream",
        fileName: "contacts.xlsx",
      }),
    ).toBe("xlsx")
  })

  it("matches the file extension case-insensitively", () => {
    expect(inferImportFormat({ fileName: "CONTACTS.CSV" })).toBe("csv")
  })

  it("prefers a known mime type over a conflicting extension", () => {
    expect(
      inferImportFormat({ mimeType: "text/csv", fileName: "contacts.xlsx" }),
    ).toBe("csv")
  })

  it("returns null when both mime type and extension are unknown", () => {
    expect(
      inferImportFormat({
        mimeType: "application/octet-stream",
        fileName: "contacts.bin",
      }),
    ).toBeNull()
  })

  it("returns null for a file name with no extension", () => {
    expect(inferImportFormat({ fileName: "contacts" })).toBeNull()
  })

  it("returns null when no mime type or file name is supplied", () => {
    expect(inferImportFormat({})).toBeNull()
    expect(inferImportFormat({ mimeType: null, fileName: null })).toBeNull()
  })
})

describe("replaceTemplate", () => {
  it("substitutes a single placeholder", () => {
    expect(replaceTemplate("ws/:workspaceId", { workspaceId: "ws-1" })).toBe(
      "ws/ws-1",
    )
  })

  it("substitutes multiple placeholders", () => {
    expect(
      replaceTemplate("imports/:workspaceId/:fileName", {
        workspaceId: "ws-1",
        fileName: "data.csv",
      }),
    ).toBe("imports/ws-1/data.csv")
  })

  it("leaves a placeholder untouched when no matching param is given", () => {
    expect(
      replaceTemplate("ws/:workspaceId/:fileName", { workspaceId: "ws-1" }),
    ).toBe("ws/ws-1/:fileName")
  })

  it("returns the template unchanged when it has no placeholders", () => {
    expect(replaceTemplate("static/path", { workspaceId: "ws-1" })).toBe(
      "static/path",
    )
  })
})
