// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

type CapturedProcedure = {
  route: { method: string; path: string }
  handler?: (...args: any[]) => any
}

const { orpcMock, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const api = {
    route: (config: CapturedProcedure["route"]) => {
      const record: CapturedProcedure = { route: config }
      capturedProcedures.push(record)
      const chain: Record<string, unknown> = {}
      for (const name of ["input", "output", "errors"]) {
        chain[name] = () => chain
      }
      chain.handler = (fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }
      return chain
    },
  }
  return {
    capturedProcedures,
    orpcMock: { workspaceTokenAuthAPIForScope: () => api },
  }
})
vi.mock("@/orpc", () => orpcMock)

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  bulkDelete: vi.fn(),
  findOrFail: vi.fn(),
}))
vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  folderService: mocks,
}))
vi.mock("@chatbotx.io/business/sequence", () => ({ sequenceService: {} }))
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

await import("@/features/sequences/api/public")

const find = (method: string, path: string) =>
  capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )?.handler
const context = { workspace: { id: "ws-1" } }

describe("sequence folder routes", () => {
  beforeEach(() => vi.clearAllMocks())

  test("list and create are pinned to the sequence folder type and workspace", async () => {
    mocks.list.mockResolvedValue([])
    await find("GET", "/v1/sequence-folders")?.({ context, input: {} })
    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      folderType: "sequence",
      parentId: null,
    })

    mocks.create.mockResolvedValue({ id: "5" })
    await find(
      "POST",
      "/v1/sequence-folders",
    )?.({
      context,
      input: { name: "Promo", parentId: "0" },
    })
    expect(mocks.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data: { name: "Promo", folderType: "sequence", parentId: null },
    })
  })

  test("rename and delete refuse a folder of another type as 404", async () => {
    mocks.findOrFail.mockResolvedValue({ id: "9", folderType: "tag" })

    await expect(
      find(
        "PUT",
        "/v1/sequence-folders/{id}",
      )?.({
        context,
        input: { id: "9", name: "x" },
      }),
    ).rejects.toThrow("Folder not found")
    await expect(
      find(
        "DELETE",
        "/v1/sequence-folders/{id}",
      )?.({
        context,
        input: { id: "9" },
      }),
    ).rejects.toThrow("Folder not found")
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.bulkDelete).not.toHaveBeenCalled()
  })

  test("rename and delete work on a sequence folder", async () => {
    mocks.findOrFail.mockResolvedValue({ id: "9", folderType: "sequence" })
    mocks.update.mockResolvedValue({ id: "9" })

    await find(
      "PUT",
      "/v1/sequence-folders/{id}",
    )?.({
      context,
      input: { id: "9", name: "New" },
    })
    expect(mocks.update).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "9",
      data: { name: "New" },
    })

    await find(
      "DELETE",
      "/v1/sequence-folders/{id}",
    )?.({
      context,
      input: { id: "9" },
    })
    expect(mocks.bulkDelete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["9"],
    })
  })
})
