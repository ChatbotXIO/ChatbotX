// @vitest-environment node

/**
 * Template picker lists against a real Postgres: `settings` is one SQL
 * `UNION ALL` with `ilike` search and (name, id) keyset paging, so Vietnamese
 * names search and order by the database, and pages never repeat or skip.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  automatedResponseModel,
  botFieldModel,
  savedReplyModel,
  tagModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test, vi } from "vitest"

const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

vi.mock("../../src/template/permissions", () => ({
  assertCanListTemplateCategory: vi.fn(),
}))

const { listSelectableResources } = await import(
  "../../src/template/selectable-resources"
)

const databaseUrl = realDatabaseUrl()
const actor = {} as never

const NUMERIC_CURSOR = /^\d+$/

describe.skipIf(!databaseUrl)("selectable resources on a real database", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seed = async (
    replies: string[],
    fields: string[],
    tags: string[] = [],
  ) => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `sel-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `sel-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    for (const shortcut of replies) {
      await db
        .insert(savedReplyModel)
        .values({ workspaceId: workspace.id, shortcut, text: "t" })
    }
    for (const name of fields) {
      await db
        .insert(botFieldModel)
        .values({ workspaceId: workspace.id, name, type: "number" as never })
    }
    for (const name of tags) {
      await db.insert(tagModel).values({ workspaceId: workspace.id, name })
    }
    return workspace.id
  }

  const list = (
    workspaceId: string,
    category: "settings" | "tags",
    extra: { keyword?: string; cursor?: string | null; limit?: number } = {},
  ) => listSelectableResources({ workspaceId, category, actor, ...extra })

  test("settings search matches Vietnamese letters case-insensitively in SQL", async () => {
    const workspaceId = await seed(
      ["/Đặt hàng", "/xin chào"],
      ["địa chỉ", "Số điện thoại", "Phố"],
    )

    const lower = await list(workspaceId, "settings", { keyword: "đ" })
    expect(lower.items.map((i) => i.name).sort()).toEqual(
      ["/Đặt hàng", "Số điện thoại", "địa chỉ"].sort(),
    )
    const upper = await list(workspaceId, "settings", { keyword: "Đ" })
    expect(upper.total).toBe(lower.total)

    const tone = await list(workspaceId, "settings", { keyword: "ố" })
    expect(tone.items.map((i) => i.name).sort()).toEqual(
      ["Phố", "Số điện thoại"].sort(),
    )
  })

  test("settings keyset pages are stable, complete and non-overlapping", async () => {
    const names = ["Ánh", "Ba", "Đào", "Em", "Ốc", "Phố", "Quế", "Sen", "Tố"]
    const workspaceId = await seed(
      names.slice(0, 4).map((n) => `/${n}`),
      names.slice(4),
    )

    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const page = await list(workspaceId, "settings", { cursor, limit: 4 })
      expect(page.total).toBe(names.length)
      seen.push(...page.items.map((i) => i.id))
      cursor = page.nextCursor
      pages += 1
    } while (cursor && pages < 10)

    expect(pages).toBe(3)
    expect(new Set(seen).size).toBe(names.length)

    const again: string[] = []
    cursor = null
    do {
      const page = await list(workspaceId, "settings", { cursor, limit: 4 })
      again.push(...page.items.map((i) => i.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(again).toEqual(seen)
  })

  test("a keyset cursor survives a row inserted before it (no offset drift)", async () => {
    const workspaceId = await seed([], ["b1", "b2", "b3", "b4"])
    const first = await list(workspaceId, "settings", { limit: 2 })
    await db.insert(botFieldModel).values({
      workspaceId,
      name: "a0",
      type: "number" as never,
    })
    const second = await list(workspaceId, "settings", {
      cursor: first.nextCursor,
      limit: 2,
    })
    expect(second.items.map((i) => i.name)).toEqual(["b3", "b4"])
  })

  test("other categories page by keyset and accept legacy numeric cursors", async () => {
    const workspaceId = await seed([], [], ["T1", "T2", "T3", "T4", "T5"])
    const first = await list(workspaceId, "tags", { limit: 2 })
    expect(first.items.map((i) => i.name)).toEqual(["T1", "T2"])
    expect(first.nextCursor).not.toMatch(NUMERIC_CURSOR)
    const second = await list(workspaceId, "tags", {
      cursor: first.nextCursor,
      limit: 2,
    })
    expect(second.items.map((i) => i.name)).toEqual(["T3", "T4"])
    const legacy = await list(workspaceId, "tags", { cursor: "4", limit: 2 })
    expect(legacy.items.map((i) => i.name)).toEqual(["T5"])
    expect(legacy.nextCursor).toBeNull()
  })

  test("keywords page newest-first by a microsecond keyset with no repeats", async () => {
    const workspaceId = await seed([], [])
    for (const text of ["k1", "k2", "k3", "k4", "k5"]) {
      await db
        .insert(automatedResponseModel)
        .values({ workspaceId, text, keywords: [text], status: true })
    }
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page = await listSelectableResources({
        workspaceId,
        category: "keywords",
        actor,
        cursor,
        limit: 2,
      })
      seen.push(...page.items.map((i) => i.name))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toEqual(["k5", "k4", "k3", "k2", "k1"])
  })

  test("rejects a forged cursor", async () => {
    const workspaceId = await seed([], [], ["T1"])
    await expect(
      list(workspaceId, "tags", { cursor: "not-a-cursor!!" }),
    ).rejects.toThrow()
  })

  test("a well-formed but tampered cursor is a 400, never a database error", async () => {
    const workspaceId = await seed([], [], ["T1"])
    const forge = (key: string, id: string) =>
      btoa(encodeURIComponent(JSON.stringify([key, id])))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "")
    const invalid = { code: "invalidCursor", httpStatusCode: 400 }

    await expect(
      list(workspaceId, "keywords", { cursor: forge("yesterday", "5") }),
    ).rejects.toMatchObject(invalid)
    await expect(
      list(workspaceId, "keywords", {
        cursor: forge("2026-10-30 10:00:00+00", "9".repeat(25)),
      }),
    ).rejects.toMatchObject(invalid)
    await expect(
      list(workspaceId, "tags", {
        cursor: forge("T1", "9223372036854775808"),
      }),
    ).rejects.toMatchObject(invalid)
  })
})
