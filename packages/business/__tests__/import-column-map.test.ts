// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { peekImportHeaders } = vi.hoisted(() => ({
  peekImportHeaders: vi.fn(),
}))
vi.mock("../src/import/peek-headers", () => ({ peekImportHeaders }))

const { resolveProductImportColumnMap, suggestContactImportColumnMap } =
  await import("../src/import/column-map")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveProductImportColumnMap", () => {
  test("keeps a caller's column map without reading the file", async () => {
    const columnMap = { name: "Title" }

    await expect(
      resolveProductImportColumnMap({
        workspaceId: "ws-1",
        fileId: "f-1",
        columnMap,
      }),
    ).resolves.toBe(columnMap)
    expect(peekImportHeaders).not.toHaveBeenCalled()
  })

  test("recognises the columns of a products file of the workspace", async () => {
    peekImportHeaders.mockResolvedValue(["Tên sản phẩm", "Giá bán", "SKU"])

    await expect(
      resolveProductImportColumnMap({ workspaceId: "ws-1", fileId: "f-1" }),
    ).resolves.toEqual({ name: "Tên sản phẩm", price: "Giá bán", sku: "SKU" })
    expect(peekImportHeaders).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fileId: "f-1",
      type: "products",
    })
  })

  test("a file without a recognisable name column is a 422 listing its headers", async () => {
    peekImportHeaders.mockResolvedValue(["Foo", "Bar"])

    await expect(
      resolveProductImportColumnMap({ workspaceId: "ws-1", fileId: "f-1" }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "columnMap",
      message: expect.stringContaining("file headers: Foo, Bar"),
    })
  })
})

describe("suggestContactImportColumnMap", () => {
  test("matches the builder's contact headers", () => {
    expect(
      suggestContactImportColumnMap(["Phone", "Email", "First name"]),
    ).toEqual({ phoneNumber: "Phone", email: "Email", firstName: "First name" })
  })
})
