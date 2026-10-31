// @vitest-environment node

/**
 * The keyset page of a workspace's template list against a real Postgres: it
 * walks every template exactly once, newest first, across page edges, including
 * rows that share a `createdAt`. Commits its fixtures and removes them after.
 */

import { db, eq } from "@chatbotx.io/database/client"
import { templateRepository } from "@chatbotx.io/database/repositories"
import {
  templateModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterAll, describe, expect, test } from "vitest"

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

const databaseUrl = realDatabaseUrl()
const ROOT_TENANT_ID = "1"
const created = { userId: "", workspaceId: "" }

afterAll(async () => {
  if (created.workspaceId) {
    await db
      .delete(templateModel)
      .where(eq(templateModel.workspaceId, created.workspaceId))
    await db
      .delete(workspaceModel)
      .where(eq(workspaceModel.id, created.workspaceId))
  }
  if (created.userId) {
    await db.delete(userModel).where(eq(userModel.id, created.userId))
  }
})

describe.skipIf(!databaseUrl)(
  "templateRepository.listWithInstallCountsPage",
  () => {
    test("pages every template once, newest first, with ties broken by id", async () => {
      const suffix = createId()
      const [owner] = await db
        .insert(userModel)
        .values({ email: `template-page-${suffix}@example.test` })
        .returning({ id: userModel.id })
      created.userId = owner.id
      const [workspace] = await db
        .insert(workspaceModel)
        .values({ name: `template-page-${suffix}`, ownerId: owner.id })
        .returning({ id: workspaceModel.id })
      created.workspaceId = workspace.id

      const sameInstant = new Date("2026-03-01T00:00:00.000Z")
      const stamps = [
        new Date("2026-01-01T00:00:00.000Z"),
        sameInstant,
        sameInstant,
        sameInstant,
        new Date("2026-05-01T00:00:00.000Z"),
      ]
      for (const [index, createdAt] of stamps.entries()) {
        await db.insert(templateModel).values({
          workspaceId: workspace.id,
          tenantId: ROOT_TENANT_ID,
          name: `Template ${index}`,
          selection: { mode: "all" } as never,
          payload: {},
          categoryCounts: {},
          formatVersion: 2,
          shareToken: `tok-${suffix}-${index}`,
          defaultPermissions: { allowEdit: true, allowDelete: true } as never,
          createdAt,
        })
      }

      const unpaged = await templateRepository.listWithInstallCounts(
        workspace.id,
      )
      const seen: string[] = []
      let after: { key: string; id: string } | undefined
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await templateRepository.listWithInstallCountsPage({
          workspaceId: workspace.id,
          limit: 2,
          after,
        })
        expect(page.rows.length).toBeLessThanOrEqual(2)
        seen.push(...page.rows.map((row) => row.id))
        const last = page.rows.at(-1)
        if (!(page.hasMore && last && page.lastKey)) {
          break
        }
        after = { key: page.lastKey, id: last.id }
      }

      expect(seen).toHaveLength(5)
      expect(new Set(seen).size).toBe(5)
      expect(seen).toEqual(unpaged.map((row) => row.id))
      expect(unpaged[0]?.name).toBe("Template 4")
    })
  },
)
