// @vitest-environment node

/**
 * A `mode:"all"` snapshot stays O(1) queries per category: collecting 150 rows
 * of a category runs the same number of row queries as collecting 3.
 * Commits for real, so the test deletes its workspace afterwards.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  discountCodeModel,
  ecommerceOpenHoursModel,
  magicLinkModel,
  userModel,
  vendorModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test, vi } from "vitest"

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
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

const { magicLinksAdapter } = await import(
  "../../src/template/adapters/magic-links"
)
const { vendorsAdapter } = await import("../../src/template/adapters/vendors")
const { openHoursAdapter } = await import(
  "../../src/template/adapters/open-hours"
)
const { discountCodesAdapter } = await import(
  "../../src/template/adapters/discount-codes"
)

const databaseUrl = realDatabaseUrl()
const MANY = 150
const FEW = 3

type Collectable = {
  collector: {
    collect: (
      workspaceId: string,
      ids: string[],
    ) => Promise<{ entries: readonly unknown[] }>
  }
}

describe.skipIf(!databaseUrl)("snapshot query count", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  const seedWorkspace = async () => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `qc-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `qc-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    return workspace.id
  }

  const seedRows = async (workspaceId: string, count: number) => {
    const numbered = Array.from({ length: count }, (_, index) => index)
    await db.insert(magicLinkModel).values(
      numbered.map((index) => ({
        id: createId(),
        workspaceId,
        name: `link-${index}`,
        url: "https://example.test",
      })) as never,
    )
    await db.insert(vendorModel).values(
      numbered.map((index) => ({
        id: createId(),
        workspaceId,
        name: `vendor-${index}`,
      })) as never,
    )
    await db.insert(ecommerceOpenHoursModel).values(
      numbered.map((index) => ({
        id: createId(),
        workspaceId,
        name: `hours-${index}`,
        ranges: [{ day: 1, from: "09:00", to: "17:00" }],
      })) as never,
    )
    await db.insert(discountCodeModel).values(
      numbered.map((index) => ({
        id: createId(),
        workspaceId,
        code: `CODE${index}`,
        discountType: "percentage",
        discountValue: 10,
        appliesTo: "entireOrder",
        productIds: [],
        startsAt: new Date("2020-01-01T00:00:00.000Z"),
        isActive: true,
      })) as never,
    )
  }

  /** Row queries a collect of every id of the category runs, and what it returned. */
  const collectAll = async (
    workspaceId: string,
    adapter: Collectable,
    queryModels: readonly (keyof typeof db.query)[],
  ) => {
    const spies = queryModels.map((model) =>
      vi.spyOn(db.query[model] as { findMany: () => unknown }, "findMany"),
    )
    const ids = (
      await db.query[queryModels[0]].findMany({
        where: { workspaceId },
        columns: { id: true },
      } as never)
    ).map((row) => (row as { id: string }).id)
    for (const spy of spies) {
      spy.mockClear()
    }
    const { entries } = await adapter.collector.collect(workspaceId, ids)
    const calls = spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0)
    for (const spy of spies) {
      spy.mockRestore()
    }
    return { calls, count: entries.length }
  }

  const categories = [
    ["magicLinks", magicLinksAdapter, ["magicLinkModel"]],
    ["vendors", vendorsAdapter, ["vendorModel"]],
    ["openHours", openHoursAdapter, ["ecommerceOpenHoursModel"]],
    ["discountCodes", discountCodesAdapter, ["discountCodeModel"]],
  ] as const

  test("collecting 150 rows of a category runs as many row queries as collecting 3", async () => {
    const few = await seedWorkspace()
    const many = await seedWorkspace()
    await seedRows(few, FEW)
    await seedRows(many, MANY)

    for (const [name, adapter, models] of categories) {
      const small = await collectAll(few, adapter as Collectable, models)
      const large = await collectAll(many, adapter as Collectable, models)
      expect({ name, count: small.count }).toEqual({ name, count: FEW })
      expect({ name, count: large.count }).toEqual({ name, count: MANY })
      expect(large.calls).toBeGreaterThan(0)
      expect({ name, calls: large.calls }).toEqual({
        name,
        calls: small.calls,
      })
    }
  })
})
