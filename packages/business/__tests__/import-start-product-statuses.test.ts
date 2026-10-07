import { afterEach, describe, expect, test, vi } from "vitest"
import { importService } from "../src/import/service"

// The public API declares these errors with HTTP statuses (404/422/409); a
// ChatbotXException without a status is a 400 and would not match the
// declaration, so the statuses are pinned here.
const input = {
  workspaceId: "ws-1",
  userId: null,
  fileId: "f1",
  format: "csv" as const,
  meta: { columnMap: { name: "Name" }, createMissingCategories: true },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("importService.startProductImport error statuses", () => {
  test("an unknown file is a 404", async () => {
    vi.spyOn(importService, "findFile").mockResolvedValue(undefined)

    await expect(importService.startProductImport(input)).rejects.toMatchObject(
      { code: "productImportFileNotFound", httpStatusCode: 404 },
    )
  })

  test("a file uploaded for another import type is a 422", async () => {
    vi.spyOn(importService, "findFile").mockResolvedValue({
      id: "f1",
      subType: "contacts",
      fileName: "people.csv",
      mimeType: "text/csv",
    } as never)

    await expect(importService.startProductImport(input)).rejects.toMatchObject(
      { code: "productImportFileTypeInvalid", httpStatusCode: 422 },
    )
  })

  test("a format that does not match the file is a 422", async () => {
    vi.spyOn(importService, "findFile").mockResolvedValue({
      id: "f1",
      subType: "products",
      fileName: "items.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    } as never)

    await expect(importService.startProductImport(input)).rejects.toMatchObject(
      { code: "productImportFormatMismatch", httpStatusCode: 422 },
    )
  })
})
