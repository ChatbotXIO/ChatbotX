import { describe, expect, test } from "vitest"
import { resolveImportFileFormat } from "../src/file-validation"
import { getImportEntry } from "../src/registry"

const config = getImportEntry("products").config

describe("product import file validation", () => {
  test.each([
    ["products.csv", "text/csv", "csv"],
    [
      "products.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "xlsx",
    ],
  ])("resolves %s from its configured MIME and extension", (fileName, mimeType, expected) => {
    expect(resolveImportFileFormat(config, { fileName, mimeType })).toBe(
      expected,
    )
  })

  test.each([
    ["products.xls", "application/vnd.ms-excel"],
    ["products.xlsx", "text/csv"],
    [
      "products.csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    ["products", "text/csv"],
  ])("rejects unsupported or spoofed file %s", (fileName, mimeType) => {
    expect(
      resolveImportFileFormat(config, { fileName, mimeType }),
    ).toBeUndefined()
  })
})
