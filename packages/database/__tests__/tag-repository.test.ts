import { beforeEach, describe, expect, test, vi } from "vitest"
import { tagRepository } from "../src/repositories/tag/repository"

const WS = "ws-1"

function createTagFindFirstTx(results: unknown[]) {
  const findFirst = vi.fn()
  for (const result of results) {
    findFirst.mockResolvedValueOnce(result)
  }
  return {
    query: {
      tagModel: { findFirst },
    },
  }
}

describe("tagRepository.findByKey", () => {
  test("looks up by id first when key is numeric, falls through to name when not found", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(undefined) // id lookup misses
      .mockResolvedValueOnce({ id: "tag-1", name: "42" }) // name lookup hits

    const tx = { query: { tagModel: { findFirst } } }

    const result = await tagRepository.findByKey(
      { workspaceId: WS, key: "42" },
      tx as never,
    )

    expect(findFirst).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ id: "tag-1", name: "42" })
  })

  test("returns the id match directly without a name fallthrough query", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "42", name: "Numeric Tag" })

    const tx = { query: { tagModel: { findFirst } } }

    const result = await tagRepository.findByKey(
      { workspaceId: WS, key: "42" },
      tx as never,
    )

    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ id: "42", name: "Numeric Tag" })
  })

  test("goes straight to name lookup when key is not numeric", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "tag-2", name: "vip" })

    const tx = { query: { tagModel: { findFirst } } }

    const result = await tagRepository.findByKey(
      { workspaceId: WS, key: "vip" },
      tx as never,
    )

    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ id: "tag-2", name: "vip" })
  })

  test("scopes folderId null to isNull filter and passes through a real id", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "tag-3", name: "vip" })
    const tx = { query: { tagModel: { findFirst } } }

    await tagRepository.findByKey(
      { workspaceId: WS, key: "vip", folderId: null },
      tx as never,
    )
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ folderId: { isNull: true } }),
      }),
    )

    findFirst.mockClear()
    findFirst.mockResolvedValueOnce({ id: "tag-4", name: "vip2" })
    await tagRepository.findByKey(
      { workspaceId: WS, key: "vip2", folderId: "folder-1" },
      tx as never,
    )
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ folderId: "folder-1" }),
      }),
    )
  })
})

describe("tagRepository.existsByName", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns true when a matching tag is found", async () => {
    const tx = createTagFindFirstTx([{ id: "tag-1" }])

    const result = await tagRepository.existsByName(
      { workspaceId: WS, name: "VIP" },
      tx as never,
    )

    expect(result).toBe(true)
  })

  test("returns false when no matching tag is found", async () => {
    const tx = createTagFindFirstTx([undefined])

    const result = await tagRepository.existsByName(
      { workspaceId: WS, name: "VIP" },
      tx as never,
    )

    expect(result).toBe(false)
  })

  test("adds an id.ne filter when excludeId is provided", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(undefined)
    const tx = { query: { tagModel: { findFirst } } }

    await tagRepository.existsByName(
      { workspaceId: WS, name: "VIP", excludeId: "tag-1" },
      tx as never,
    )

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { ne: "tag-1" } }),
      }),
    )
  })

  test("omits the id filter when excludeId is absent", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(undefined)
    const tx = { query: { tagModel: { findFirst } } }

    await tagRepository.existsByName(
      { workspaceId: WS, name: "VIP" },
      tx as never,
    )

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: undefined }),
      }),
    )
  })
})

describe("tagRepository.ensureByNames", () => {
  test("short-circuits to [] without querying when names is empty", async () => {
    const insert = vi.fn()
    const findMany = vi.fn()
    const tx = { insert, query: { tagModel: { findMany } } }

    const result = await tagRepository.ensureByNames(
      { workspaceId: WS, names: [] },
      tx as never,
    )

    expect(result).toEqual([])
    expect(insert).not.toHaveBeenCalled()
    expect(findMany).not.toHaveBeenCalled()
  })

  test("inserts with onConflictDoNothing then re-selects the resolved rows", async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn().mockReturnValue({ onConflictDoNothing })
    const insert = vi.fn().mockReturnValue({ values })
    const findMany = vi.fn().mockResolvedValueOnce([
      { id: "tag-1", name: "alpha" },
      { id: "tag-2", name: "beta" },
    ])
    const tx = { insert, query: { tagModel: { findMany } } }

    const result = await tagRepository.ensureByNames(
      { workspaceId: WS, names: ["alpha", "beta"] },
      tx as never,
    )

    expect(insert).toHaveBeenCalledTimes(1)
    expect(onConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.any(Array) }),
    )
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: { in: ["alpha", "beta"] } }),
      }),
    )
    expect(result).toEqual([
      { id: "tag-1", name: "alpha" },
      { id: "tag-2", name: "beta" },
    ])
  })
})

describe("tagRepository.linkContacts", () => {
  test("returns [] without querying when pairs is empty", async () => {
    const insert = vi.fn()
    const tx = { insert }

    const result = await tagRepository.linkContacts([], tx as never)

    expect(result).toEqual([])
    expect(insert).not.toHaveBeenCalled()
  })

  test("inserts with onConflictDoNothing target on (contactId, tagId) and returns only new pairs", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ contactId: "c-1", tagId: "tag-1" }])
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning })
    const values = vi.fn().mockReturnValue({ onConflictDoNothing })
    const insert = vi.fn().mockReturnValue({ values })
    const tx = { insert }

    const result = await tagRepository.linkContacts(
      [
        { contactId: "c-1", tagId: "tag-1" },
        { contactId: "c-1", tagId: "tag-2" },
      ],
      tx as never,
    )

    expect(values).toHaveBeenCalledWith([
      { contactId: "c-1", tagId: "tag-1" },
      { contactId: "c-1", tagId: "tag-2" },
    ])
    expect(onConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.any(Array) }),
    )
    expect(result).toEqual([{ contactId: "c-1", tagId: "tag-1" }])
  })
})

describe("tagRepository.unlinkContactExcept", () => {
  test("deletes everything for the contact when keepTagIds is empty (no notInArray) and returns removed tagIds", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ tagId: "tag-1" }, { tagId: "tag-2" }])
    const where = vi.fn().mockReturnValue({ returning })
    const del = vi.fn().mockReturnValue({ where })
    const tx = { delete: del }

    const result = await tagRepository.unlinkContactExcept(
      { contactId: "c-1", keepTagIds: [] },
      tx as never,
    )

    expect(where).toHaveBeenCalledTimes(1)
    const clause = where.mock.calls[0]?.[0]
    expect(clause).toBeDefined()
    expect(result).toEqual([{ tagId: "tag-1" }, { tagId: "tag-2" }])
  })

  test("deletes only tags outside keepTagIds when keepTagIds is non-empty", async () => {
    const returning = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ returning })
    const del = vi.fn().mockReturnValue({ where })
    const tx = { delete: del }

    await tagRepository.unlinkContactExcept(
      { contactId: "c-1", keepTagIds: ["tag-1", "tag-2"] },
      tx as never,
    )

    expect(where).toHaveBeenCalledTimes(1)
  })
})

describe("tagRepository.unlinkContacts", () => {
  test("returns [] without querying when contactIds is empty", async () => {
    const del = vi.fn()
    const tx = { delete: del }

    const result = await tagRepository.unlinkContacts(
      { contactIds: [], tagIds: ["tag-1"] },
      tx as never,
    )

    expect(result).toEqual([])
    expect(del).not.toHaveBeenCalled()
  })

  test("returns [] without querying when tagIds is empty", async () => {
    const del = vi.fn()
    const tx = { delete: del }

    const result = await tagRepository.unlinkContacts(
      { contactIds: ["c-1"], tagIds: [] },
      tx as never,
    )

    expect(result).toEqual([])
    expect(del).not.toHaveBeenCalled()
  })

  test("deletes across all given contactIds/tagIds in one call and returns removed pairs", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ contactId: "c-1", tagId: "tag-1" }])
    const where = vi.fn().mockReturnValue({ returning })
    const del = vi.fn().mockReturnValue({ where })
    const tx = { delete: del }

    const result = await tagRepository.unlinkContacts(
      { contactIds: ["c-1", "c-2"], tagIds: ["tag-1"] },
      tx as never,
    )

    expect(del).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ contactId: "c-1", tagId: "tag-1" }])
  })
})

describe("tagRepository.softDeleteMany", () => {
  test("returns [] without querying when ids is empty", async () => {
    const update = vi.fn()
    const tx = { update }

    const result = await tagRepository.softDeleteMany(
      { workspaceId: WS, ids: [] },
      tx as never,
    )

    expect(result).toEqual([])
    expect(update).not.toHaveBeenCalled()
  })

  test("sets deletedAt and returns matched ids", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: "tag-1" }, { id: "tag-2" }])
    const where = vi.fn().mockReturnValue({ returning })
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const tx = { update }

    const result = await tagRepository.softDeleteMany(
      { workspaceId: WS, ids: ["tag-1", "tag-2"] },
      tx as never,
    )

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    )
    expect(result).toEqual([{ id: "tag-1" }, { id: "tag-2" }])
  })
})

describe("tagRepository.findUnsyncedPairs", () => {
  test("returns [] without querying when contactIds is empty", async () => {
    const select = vi.fn()
    const tx = { select }

    const result = await tagRepository.findUnsyncedPairs(
      { contactIds: [], tagIds: ["tag-1"] },
      tx as never,
    )

    expect(result).toEqual([])
    expect(select).not.toHaveBeenCalled()
  })

  test("returns [] without querying when tagIds is empty", async () => {
    const select = vi.fn()
    const tx = { select }

    const result = await tagRepository.findUnsyncedPairs(
      { contactIds: ["c-1"], tagIds: [] },
      tx as never,
    )

    expect(result).toEqual([])
    expect(select).not.toHaveBeenCalled()
  })

  test("runs the outer/inner select against the provided tx and returns unsynced pairs", async () => {
    const innerChain = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn(),
    }
    innerChain.from.mockReturnValue(innerChain)
    innerChain.innerJoin.mockReturnValue(innerChain)
    innerChain.where.mockReturnValue(innerChain)

    const outerWhere = vi
      .fn()
      .mockResolvedValue([{ contactId: "c-1", tagId: "tag-1" }])
    const outerFrom = vi.fn().mockReturnValue({ where: outerWhere })
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: outerFrom })
      .mockReturnValueOnce(innerChain)

    const tx = { select }

    const result = await tagRepository.findUnsyncedPairs(
      { contactIds: ["c-1"], tagIds: ["tag-1"] },
      tx as never,
    )

    expect(select).toHaveBeenCalledTimes(2)
    expect(result).toEqual([{ contactId: "c-1", tagId: "tag-1" }])
  })
})
