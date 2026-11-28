import { beforeEach, describe, expect, test, vi } from "vitest"

const listTags = vi.fn()

vi.mock("@/features/tags/queries", () => ({
  listTags: (...a: unknown[]) => listTags(...a),
}))
vi.mock("@/features/folders/with-folder-bar", () => ({
  WithFolderBar: () => null,
}))
vi.mock("@/features/tags/tags-table", () => ({ TagsTable: () => null }))
vi.mock("next/navigation", () => ({ notFound: vi.fn() }))

const { default: TagsPage } = await import(
  "@/app/space/[workspaceId]/(has-folder)/tags/page"
)

beforeEach(() =>
  listTags.mockReset().mockResolvedValue({ data: [], pageCount: 1 }),
)

describe("tags page", () => {
  test("loads one page, not every tag, when the URL has no paging", async () => {
    await TagsPage({
      params: Promise.resolve({ workspaceId: "123" }),
      searchParams: Promise.resolve({}),
    })
    expect(listTags).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, perPage: 10, workspaceId: "123" }),
    )
  })

  test("passes the URL page, size and search to the query", async () => {
    await TagsPage({
      params: Promise.resolve({ workspaceId: "123" }),
      searchParams: Promise.resolve({ page: "2", perPage: "20", name: "vip" }),
    })
    expect(listTags).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, perPage: 20, name: "vip" }),
    )
  })
})
