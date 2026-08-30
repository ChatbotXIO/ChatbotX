import { afterEach, describe, expect, test, vi } from "vitest"
import { customFieldRepository } from "../src/repositories/custom-field/repository"

function createTx(props: {
  findMany: ReturnType<typeof vi.fn>
  insertReturning?: unknown[]
}) {
  const insertValues = vi.fn(() => ({
    onConflictDoNothing: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue(props.insertReturning ?? []),
    })),
  }))
  const insert = vi.fn(() => ({ values: insertValues }))

  return {
    tx: {
      query: { customFieldModel: { findMany: props.findMany } },
      insert,
    } as never,
    insert,
    insertValues,
  }
}

describe("customFieldRepository.resolveByNameAndType", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("disambiguates the same name across different types", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "1", workspaceId: "ws-1", name: "Birthday", type: "date" },
      { id: "2", workspaceId: "ws-1", name: "Birthday", type: "shortText" },
    ])
    const { tx, insert } = createTx({ findMany })

    const { idMap, createdIds } =
      await customFieldRepository.resolveByNameAndType(
        {
          workspaceId: "ws-1",
          fields: [
            { name: "Birthday", type: "date" },
            { name: "Birthday", type: "shortText" },
          ],
        },
        tx,
      )

    expect(idMap.get("date:birthday")).toBe("1")
    expect(idMap.get("shortText:birthday")).toBe("2")
    expect(createdIds).toEqual([])
    expect(insert).not.toHaveBeenCalled()
  })

  test("matches case-insensitively without creating a duplicate", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        { id: "1", workspaceId: "ws-1", name: "Birthday", type: "date" },
      ])
    const { tx, insert } = createTx({ findMany })

    const { idMap, createdIds } =
      await customFieldRepository.resolveByNameAndType(
        {
          workspaceId: "ws-1",
          fields: [{ name: "birthday", type: "date" }],
        },
        tx,
      )

    expect(idMap.get("date:birthday")).toBe("1")
    expect(createdIds).toEqual([])
    expect(insert).not.toHaveBeenCalled()
  })

  test("creates a field with the manifest's type when no match exists", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const { tx, insert, insertValues } = createTx({
      findMany,
      insertReturning: [
        {
          id: "new-id-1",
          workspaceId: "ws-1",
          name: "Favorite Color",
          type: "shortText",
        },
      ],
    })

    const { idMap, createdIds } =
      await customFieldRepository.resolveByNameAndType(
        {
          workspaceId: "ws-1",
          fields: [{ name: "Favorite Color", type: "shortText" }],
        },
        tx,
      )

    expect(idMap.get("shortText:favorite color")).toBe("new-id-1")
    expect(createdIds).toEqual(["new-id-1"])
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        workspaceId: "ws-1",
        name: "Favorite Color",
        type: "shortText",
      }),
    ])
  })

  test("creates a second field when the same name exists under a different type", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        { id: "1", workspaceId: "ws-1", name: "Birthday", type: "date" },
      ])
    const { tx } = createTx({
      findMany,
      insertReturning: [
        {
          id: "new-id-2",
          workspaceId: "ws-1",
          name: "Birthday",
          type: "shortText",
        },
      ],
    })

    const { idMap, createdIds } =
      await customFieldRepository.resolveByNameAndType(
        {
          workspaceId: "ws-1",
          fields: [{ name: "Birthday", type: "shortText" }],
        },
        tx,
      )

    expect(idMap.get("shortText:birthday")).toBe("new-id-2")
    expect(createdIds).toEqual(["new-id-2"])
  })

  test("batches all missing fields into a single insert call", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const { tx, insert, insertValues } = createTx({
      findMany,
      insertReturning: [
        { id: "new-1", workspaceId: "ws-1", name: "Alpha", type: "shortText" },
        { id: "new-2", workspaceId: "ws-1", name: "Beta", type: "shortText" },
        { id: "new-3", workspaceId: "ws-1", name: "Gamma", type: "shortText" },
      ],
    })

    const { idMap, createdIds } =
      await customFieldRepository.resolveByNameAndType(
        {
          workspaceId: "ws-1",
          fields: [
            { name: "Alpha", type: "shortText" },
            { name: "Beta", type: "shortText" },
            { name: "Gamma", type: "shortText" },
          ],
        },
        tx,
      )

    expect(insert).toHaveBeenCalledTimes(1)
    expect(insertValues).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Alpha" }),
      expect.objectContaining({ name: "Beta" }),
      expect.objectContaining({ name: "Gamma" }),
    ])
    expect(createdIds.sort()).toEqual(["new-1", "new-2", "new-3"])
    expect(idMap.get("shortText:alpha")).toBe("new-1")
    expect(idMap.get("shortText:beta")).toBe("new-2")
    expect(idMap.get("shortText:gamma")).toBe("new-3")
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  test("partial conflict within a batch: landed rows resolve directly, the lost one re-selects", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "winner-id",
          workspaceId: "ws-1",
          name: "Beta",
          type: "shortText",
        },
      ])
    const { tx, insert } = createTx({
      findMany,
      // Beta's insert lost the onConflictDoNothing race, so only 2 of the 3
      // attempted rows come back from returning().
      insertReturning: [
        { id: "new-1", workspaceId: "ws-1", name: "Alpha", type: "shortText" },
        { id: "new-3", workspaceId: "ws-1", name: "Gamma", type: "shortText" },
      ],
    })

    const { idMap, createdIds } =
      await customFieldRepository.resolveByNameAndType(
        {
          workspaceId: "ws-1",
          fields: [
            { name: "Alpha", type: "shortText" },
            { name: "Beta", type: "shortText" },
            { name: "Gamma", type: "shortText" },
          ],
        },
        tx,
      )

    expect(insert).toHaveBeenCalledTimes(1)
    expect(createdIds.sort()).toEqual(["new-1", "new-3"])
    expect(createdIds).not.toContain("winner-id")
    expect(idMap.get("shortText:alpha")).toBe("new-1")
    expect(idMap.get("shortText:beta")).toBe("winner-id")
    expect(idMap.get("shortText:gamma")).toBe("new-3")
    expect(findMany).toHaveBeenCalledTimes(2)
  })

  test("concurrent resolve: a lost onConflictDoNothing race re-selects the winner's row", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "winner-id",
          workspaceId: "ws-1",
          name: "Birthday",
          type: "date",
        },
      ])
    // onConflictDoNothing + returning() resolves to an empty array when a
    // concurrent insert won the race first.
    const { tx } = createTx({ findMany, insertReturning: [] })

    const { idMap, createdIds } =
      await customFieldRepository.resolveByNameAndType(
        {
          workspaceId: "ws-1",
          fields: [{ name: "Birthday", type: "date" }],
        },
        tx,
      )

    expect(idMap.get("date:birthday")).toBe("winner-id")
    expect(createdIds).toEqual([])
    expect(findMany).toHaveBeenCalledTimes(2)
  })

  test("returns an empty result for an empty fields list without querying", async () => {
    const findMany = vi.fn()
    const { tx } = createTx({ findMany })

    const { idMap, createdIds } =
      await customFieldRepository.resolveByNameAndType(
        {
          workspaceId: "ws-1",
          fields: [],
        },
        tx,
      )

    expect(idMap.size).toBe(0)
    expect(createdIds).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })
})

describe("customFieldRepository.findManyByIds", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("scopes the lookup by workspaceId alongside the id list", async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        { id: "1", workspaceId: "ws-1", name: "Birthday", type: "date" },
      ])
    const tx = { query: { customFieldModel: { findMany } } } as never

    const rows = await customFieldRepository.findManyByIds(
      {
        workspaceId: "ws-1",
        ids: ["1", "2"],
      },
      tx,
    )

    expect(rows).toEqual([
      { id: "1", workspaceId: "ws-1", name: "Birthday", type: "date" },
    ])
    expect(findMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", id: { in: ["1", "2"] } },
    })
  })

  test("returns an empty array for an empty id list without querying", async () => {
    const findMany = vi.fn()
    const tx = { query: { customFieldModel: { findMany } } } as never

    const rows = await customFieldRepository.findManyByIds(
      {
        workspaceId: "ws-1",
        ids: [],
      },
      tx,
    )

    expect(rows).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })
})

describe("customFieldRepository.resolveByNameAndType case collisions", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  // `CustomField_workspaceId_type_name_key` is a plain case-sensitive btree
  // index, so "Email" and "email" can both exist in one workspace and fold to
  // the same resolution key. `findMany` has no ORDER BY, so resolution must
  // not depend on which row comes back last.
  const collidingRows = [
    { id: "20", workspaceId: "ws-1", name: "Email", type: "shortText" },
    { id: "10", workspaceId: "ws-1", name: "email", type: "shortText" },
  ]

  test("prefers the exact-case row over a case-only match", async () => {
    const findMany = vi.fn().mockResolvedValue(collidingRows)
    const { tx, insert } = createTx({ findMany })

    const { idMap, createdIds } =
      await customFieldRepository.resolveByNameAndType(
        {
          workspaceId: "ws-1",
          fields: [{ name: "Email", type: "shortText" }],
        },
        tx,
      )

    expect(idMap.get("shortText:email")).toBe("20")
    expect(createdIds).toEqual([])
    expect(insert).not.toHaveBeenCalled()
  })

  test("resolves the same regardless of row order", async () => {
    const findMany = vi.fn().mockResolvedValue([...collidingRows].reverse())
    const { tx } = createTx({ findMany })

    const { idMap } = await customFieldRepository.resolveByNameAndType(
      {
        workspaceId: "ws-1",
        fields: [{ name: "Email", type: "shortText" }],
      },
      tx,
    )

    expect(idMap.get("shortText:email")).toBe("20")
  })

  test("falls back to the oldest row when no casing matches exactly", async () => {
    const findMany = vi.fn().mockResolvedValue(collidingRows)
    const { tx } = createTx({ findMany })

    const { idMap } = await customFieldRepository.resolveByNameAndType(
      {
        workspaceId: "ws-1",
        fields: [{ name: "EMAIL", type: "shortText" }],
      },
      tx,
    )

    expect(idMap.get("shortText:email")).toBe("10")
  })
})
