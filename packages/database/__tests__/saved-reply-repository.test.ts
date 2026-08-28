import { describe, expect, test, vi } from "vitest"
import { savedReplyRepository } from "../src/repositories/saved-reply/repository"

const WS = "ws-1"

describe("savedReplyRepository.listByWorkspace", () => {
  test("queries by workspaceId ordered by createdAt asc", async () => {
    const rows = [{ id: "reply-1" }, { id: "reply-2" }]
    const findMany = vi.fn().mockResolvedValueOnce(rows)
    const tx = { query: { savedReplyModel: { findMany } } }

    const result = await savedReplyRepository.listByWorkspace(
      { workspaceId: WS },
      tx as never,
    )

    expect(findMany).toHaveBeenCalledWith({
      where: { workspaceId: WS },
      orderBy: { createdAt: "asc" },
    })
    expect(result).toEqual(rows)
  })
})

describe("savedReplyRepository.findById", () => {
  test("queries by id and workspaceId", async () => {
    const row = { id: "reply-1", workspaceId: WS }
    const findFirst = vi.fn().mockResolvedValueOnce(row)
    const tx = { query: { savedReplyModel: { findFirst } } }

    const result = await savedReplyRepository.findById(
      { id: "reply-1", workspaceId: WS },
      tx as never,
    )

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "reply-1", workspaceId: WS },
    })
    expect(result).toEqual(row)
  })
})

describe("savedReplyRepository.create", () => {
  test("inserts with a generated id and spreads the data", async () => {
    const created = {
      id: "generated-id",
      shortcut: "/hi",
      text: "Hello",
      workspaceId: WS,
    }
    const returning = vi.fn().mockResolvedValueOnce([created])
    const values = vi.fn().mockReturnValue({ returning })
    const insert = vi.fn().mockReturnValue({ values })
    const tx = { insert }

    const result = await savedReplyRepository.create(
      { workspaceId: WS, data: { shortcut: "/hi", text: "Hello" } },
      tx as never,
    )

    expect(insert).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        shortcut: "/hi",
        text: "Hello",
      }),
    )
    expect(result).toEqual(created)
  })
})

describe("savedReplyRepository.update", () => {
  test("scopes the where clause by id and workspaceId", async () => {
    const updated = {
      id: "reply-1",
      shortcut: "/new",
      text: "Updated",
      workspaceId: WS,
    }
    const returning = vi.fn().mockResolvedValueOnce([updated])
    const where = vi.fn().mockReturnValue({ returning })
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const tx = { update }

    const result = await savedReplyRepository.update(
      {
        id: "reply-1",
        workspaceId: WS,
        data: { shortcut: "/new", text: "Updated" },
      },
      tx as never,
    )

    expect(set).toHaveBeenCalledWith({ shortcut: "/new", text: "Updated" })
    expect(where).toHaveBeenCalledTimes(1)
    expect(result).toEqual(updated)
  })

  test("returns undefined when no row matches", async () => {
    const returning = vi.fn().mockResolvedValueOnce([])
    const where = vi.fn().mockReturnValue({ returning })
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const tx = { update }

    const result = await savedReplyRepository.update(
      { id: "missing", workspaceId: WS, data: { shortcut: "/x", text: "y" } },
      tx as never,
    )

    expect(result).toBeUndefined()
  })
})

describe("savedReplyRepository.delete", () => {
  test("scopes the where clause by id and workspaceId", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const del = vi.fn().mockReturnValue({ where })
    const tx = { delete: del }

    await savedReplyRepository.delete(
      { id: "reply-1", workspaceId: WS },
      tx as never,
    )

    expect(del).toHaveBeenCalledTimes(1)
    expect(where).toHaveBeenCalledTimes(1)
  })
})
