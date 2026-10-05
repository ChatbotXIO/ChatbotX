// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures, scopeByPath } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const scopeByPath = new Map<string, string>()
  const orpcMock = {
    workspaceTokenAuthAPIForScope: vi.fn((scope: string) => ({
      route: (config: CapturedProcedure["route"]) => {
        const record: CapturedProcedure = { route: config }
        capturedProcedures.push(record)
        scopeByPath.set(config.path, scope)
        const chain: Record<string, unknown> = {}
        for (const name of ["input", "output", "errors"]) {
          chain[name] = vi.fn(() => chain)
        }
        chain.handler = vi.fn((fn: (...args: any[]) => any) => {
          record.handler = fn
          return { handler: fn }
        })
        return chain
      },
    })),
  }
  return { orpcMock, capturedProcedures, scopeByPath }
})
vi.mock("@/orpc", () => orpcMock)

const createImportUpload = vi.hoisted(() => vi.fn())
const peekImportHeaders = vi.hoisted(() => vi.fn())
const importServiceList = vi.hoisted(() => vi.fn())
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
}))
vi.mock("@chatbotx.io/business/import", () => ({
  createImportUpload,
  peekImportHeaders,
  importService: { list: importServiceList },
}))
vi.mock("@/features/products/lib/product-import-template", () => ({
  buildProductImportTemplate: vi.fn(async (locale: string) =>
    Buffer.from(`xlsx-${locale}`),
  ),
  PRODUCT_IMPORT_TEMPLATE_MIME_TYPE: "application/xlsx",
  productImportTemplateFileName: (locale: string) => `tpl-${locale}.xlsx`,
  resolveProductImportTemplateLocale: (locale: string) =>
    locale === "vi" ? "vi" : "en",
}))
vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})
vi.mock("@chatbotx.io/database/repositories", () => {
  const nested: unknown = new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  )
  return new Proxy(
    {},
    { get: (_o, prop) => (prop === "then" ? undefined : nested) },
  ) as Record<string, unknown>
})

await import("@/features/import/api/public")
await import("@/features/products/api/public")

const body = { fileName: "x.csv", mimeType: "text/csv", fileSize: 10 }
const find = (path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === "POST" && p.route.path === path,
  )

beforeEach(() => {
  createImportUpload.mockReset()
  peekImportHeaders.mockReset()
})

describe.each([
  ["/v1/contacts/imports/upload-url", "contacts", "contacts"],
  ["/v1/products/imports/upload-url", "products", "ecommerce"],
])("POST %s", (path, type, scope) => {
  test(`mints an upload for the token's workspace as a ${type} import`, async () => {
    createImportUpload.mockResolvedValueOnce({ fileId: "1" })

    const result = await find(path)?.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: body,
    })

    expect(createImportUpload).toHaveBeenCalledWith({
      ...body,
      workspaceId: "ws-1",
      userId: null,
      type,
    })
    expect(result).toEqual({ fileId: "1" })
  })

  test(`is gated by the ${scope} scope and returns 201`, () => {
    expect(scopeByPath.get(path)).toBe(scope)
    expect(find(path)?.route).toEqual(
      expect.objectContaining({ successStatus: 201 }),
    )
  })
})

describe.each([
  "/v1/contacts/imports/files/{fileId}/headers",
  "/v1/products/imports/files/{fileId}/headers",
])("GET %s", (path) => {
  test("reads the headers of a file in the token's workspace", async () => {
    peekImportHeaders.mockResolvedValueOnce(["Phone", "Name"])
    const procedure = capturedProcedures.find(
      (p) => p.route.method === "GET" && p.route.path === path,
    )

    const result = await procedure?.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { fileId: "9" },
    })

    expect(peekImportHeaders).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      fileId: "9",
      type: path.includes("/contacts/") ? "contacts" : "products",
    })
    expect(result).toEqual({ headers: ["Phone", "Name"] })
  })
})

const findGet = (path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === "GET" && p.route.path === path,
  )

describe("GET /v1/contacts/import-template", () => {
  const procedure = findGet("/v1/contacts/import-template")

  test("returns the CSV in the workspace language by default", async () => {
    const result = await procedure?.handler?.({
      context: { workspace: { id: "ws-1", language: "vi" } },
      input: {},
    })

    expect(result).toMatchObject({
      fileName: "contacts-import-template.csv",
      mimeType: "text/csv",
    })
    expect(result.content).toContain("Số điện thoại")
  })

  test("an explicit language wins over the workspace language", async () => {
    const result = await procedure?.handler?.({
      context: { workspace: { id: "ws-1", language: "vi" } },
      input: { language: "en" },
    })

    expect(result.content).toContain("Phone number")
  })
})

describe("GET /v1/products/import-template", () => {
  const procedure = findGet("/v1/products/import-template")

  test("returns the XLSX as base64 in the requested language", async () => {
    const result = await procedure?.handler?.({
      context: { workspace: { id: "ws-1", language: "en" } },
      input: { language: "vi" },
    })

    expect(result).toEqual({
      fileName: "tpl-vi.xlsx",
      mimeType: "application/xlsx",
      contentBase64: Buffer.from("xlsx-vi").toString("base64"),
    })
  })

  test("falls back to the workspace language", async () => {
    const result = await procedure?.handler?.({
      context: { workspace: { id: "ws-1", language: "en" } },
      input: {},
    })

    expect(result.fileName).toBe("tpl-en.xlsx")
  })
})

describe("GET /v1/contacts/imports", () => {
  test("forwards sort to the service and scopes to contact imports", async () => {
    importServiceList.mockResolvedValueOnce({ data: [], pageCount: 0 })
    const procedure = findGet("/v1/contacts/imports")
    const sort = [{ id: "status", desc: false }]

    await procedure?.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { page: 1, perPage: 10, sort },
    })

    expect(importServiceList).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        type: "contacts",
        sort,
      }),
    )
  })
})
