// @vitest-environment node

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { templateInstallationSyncRepository } from "../../src/repositories/template-installation-sync/repository"
import { listUnknownResourceKinds } from "../../src/repositories/template-installed-resource/kinds"
import { templateInstalledResourceRepository } from "../../src/repositories/template-installed-resource/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

class RollbackSignal extends Error {}

const withRolledBackTransaction = async (
  client: Client,
  fn: (tx: DatabaseClient) => Promise<void>,
): Promise<void> => {
  const db = drizzle({ client, schema, relations })
  try {
    await db.transaction(async (tx) => {
      await fn(tx)
      throw new RollbackSignal()
    })
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error
    }
  }
}

describe.skipIf(!databaseUrl)("template installed resource kinds", () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client.end()
  })

  const seed = async (tx: DatabaseClient) => {
    const suffix = `${Date.now()}-${Math.random()}`
    const [owner] = await tx
      .insert(schema.userModel)
      .values({ email: `kinds-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await tx
      .insert(schema.workspaceModel)
      .values({ name: `kinds-${suffix}`, ownerId: owner.id })
      .returning({ id: schema.workspaceModel.id })
    const [installation] = await tx
      .insert(schema.templateInstallationModel)
      .values({
        workspaceId: workspace.id,
        templateName: "Kinds",
        sourceWorkspaceId: workspace.id,
        formatVersion: 1,
        permissions: { allowEdit: true, allowDelete: true },
      })
      .returning({ id: schema.templateInstallationModel.id })
    const rows = [
      ["flow", "1001"],
      ["legacyKindFromANewerBuild", "1002"],
      ["tag", "1003"],
    ] as const
    for (const [kind, resourceId] of rows) {
      await tx.insert(schema.templateInstalledResourceModel).values({
        installationId: installation.id,
        workspaceId: workspace.id,
        category: "flows",
        resourceKind: kind as never,
        resourceId,
        sourceResourceId: `src-${resourceId}`,
      })
    }
    return { workspaceId: workspace.id, installationId: installation.id }
  }

  test("readers skip an unknown kind instead of crashing, and keep paginating", () =>
    withRolledBackTransaction(client, async (tx) => {
      const { workspaceId, installationId } = await seed(tx)

      const synced =
        await templateInstallationSyncRepository.listInstalledResources(
          installationId,
          tx,
        )
      expect(synced.map((row) => row.resourceKind).sort()).toEqual([
        "flow",
        "tag",
      ])

      const first = await templateInstalledResourceRepository.listPage(
        { installationId, workspaceId, limit: 2 },
        tx,
      )
      expect(first.rows.length).toBeLessThanOrEqual(2)
      expect(first.nextCursor).not.toBeNull()
      const second = await templateInstalledResourceRepository.listPage(
        {
          installationId,
          workspaceId,
          limit: 2,
          afterId: first.nextCursor ?? undefined,
        },
        tx,
      )
      expect(second.nextCursor).toBeNull()
      expect(
        [...first.rows, ...second.rows].map((row) => row.resourceKind).sort(),
      ).toEqual(["flow", "tag"])
    }))

  test("the preflight query reports the unknown kind with its count", () =>
    withRolledBackTransaction(client, async (tx) => {
      await seed(tx)

      const unknown = await listUnknownResourceKinds(tx)

      expect(unknown).toContainEqual({
        resourceKind: "legacyKindFromANewerBuild",
        rows: 1,
      })
      expect(unknown.map((row) => row.resourceKind)).not.toContain("flow")
    }))
})
