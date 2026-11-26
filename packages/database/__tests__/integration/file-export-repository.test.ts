// @vitest-environment node

/**
 * Export `File` rows against a real Postgres: the pending-only settle guard,
 * the retention sweep read across several export kinds, and the per-workspace
 * purge batch. Needs only the base schema.
 *
 * Runs only against an explicitly configured local database:
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { ExportSubType, FileStatus } from "../../src/partials/file"
import { relations } from "../../src/relations"
import { fileRepository } from "../../src/repositories/file/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const OLD = new Date("2026-01-01T00:00:00.000Z")
const CUTOFF = new Date("2026-06-01T00:00:00.000Z")
const RECENT = new Date("2026-09-01T00:00:00.000Z")

describe.skipIf(!databaseUrl)("export files against a real database", () => {
  let client: Client
  let userId: string
  let workspaceId: string
  let otherWorkspaceId: string
  const suffix = `${Date.now()}-${Math.random()}`
  let counter = 0

  const database = () => drizzle({ client, relations, schema })

  const insertFile = async (input: {
    workspaceId: string
    contextType?: "export" | "generic"
    subType?: ExportSubType | null
    status?: FileStatus
    createdAt?: Date
  }): Promise<string> => {
    counter += 1
    const [file] = await database()
      .insert(schema.fileModel)
      .values({
        contextType: input.contextType ?? "export",
        createdAt: input.createdAt,
        fileName: `export-${counter}.csv`,
        mimeType: "text/csv",
        path: `export-test/${suffix}/${counter}.csv`,
        status: input.status ?? "pending",
        subType: input.subType === undefined ? "contacts" : input.subType,
        workspaceId: input.workspaceId,
      })
      .returning({ id: schema.fileModel.id })
    return file.id
  }

  const statusOf = async (id: string) =>
    (
      await client.query<{ status: string }>(
        `SELECT status FROM "File" WHERE id = $1`,
        [id],
      )
    ).rows[0]?.status

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
    const [user] = await database()
      .insert(schema.userModel)
      .values({ email: `file-export-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    userId = user.id
    const [workspace] = await database()
      .insert(schema.workspaceModel)
      .values({ name: `file-export-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    workspaceId = workspace.id
    const [other] = await database()
      .insert(schema.workspaceModel)
      .values({ name: `file-export-other-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    otherWorkspaceId = other.id
  })

  afterAll(async () => {
    if (userId) {
      for (const id of [workspaceId, otherWorkspaceId]) {
        await database()
          .delete(schema.workspaceModel)
          .where(eq(schema.workspaceModel.id, id))
      }
      await database()
        .delete(schema.userModel)
        .where(eq(schema.userModel.id, userId))
    }
    await client?.end()
  })

  describe("updatePendingForWorkspace", () => {
    test("settles a pending row of the workspace", async () => {
      const id = await insertFile({ workspaceId })

      const updated = await fileRepository.updatePendingForWorkspace({
        id,
        values: { status: "uploaded" },
        workspaceId,
      })

      expect(updated).toBe(true)
      expect(await statusOf(id)).toBe("uploaded")
    })

    test.each([
      "uploaded",
      "failed",
    ] as const)("returns false and keeps a %s row untouched", async (status) => {
      const id = await insertFile({ status, workspaceId })

      const updated = await fileRepository.updatePendingForWorkspace({
        id,
        values: { status: "failed" },
        workspaceId,
      })

      expect(updated).toBe(false)
      expect(await statusOf(id)).toBe(status)
    })

    test("returns false for another workspace's pending row", async () => {
      const id = await insertFile({ workspaceId: otherWorkspaceId })

      const updated = await fileRepository.updatePendingForWorkspace({
        id,
        values: { status: "uploaded" },
        workspaceId,
      })

      expect(updated).toBe(false)
      expect(await statusOf(id)).toBe("pending")
    })
  })

  describe("claimFirstRunForWorkspace", () => {
    const claim = (id: string, ws = workspaceId) =>
      fileRepository.claimFirstRunForWorkspace({
        id,
        values: { meta: { heartbeatAt: new Date().toISOString() } },
        workspaceId: ws,
      })

    test("of concurrent claims on one pending row exactly one wins", async () => {
      const id = await insertFile({
        subType: "channelPostComments",
        workspaceId,
      })

      const results = await Promise.all([claim(id), claim(id), claim(id)])

      expect(results.filter(Boolean)).toHaveLength(1)
    })

    test("a row that already has a heartbeat cannot be claimed again", async () => {
      const id = await insertFile({
        subType: "channelPostComments",
        workspaceId,
      })

      expect(await claim(id)).toBe(true)
      expect(await claim(id)).toBe(false)
    })

    test.each([
      "uploaded",
      "failed",
    ] as const)("does not claim a %s row", async (status) => {
      const id = await insertFile({ status, workspaceId })

      expect(await claim(id)).toBe(false)
    })

    test("does not claim another workspace's row", async () => {
      const id = await insertFile({ workspaceId: otherWorkspaceId })

      expect(await claim(id)).toBe(false)
      expect(await statusOf(id)).toBe("pending")
    })
  })

  describe("listPendingExportsForWorkspace", () => {
    test("returns only the workspace's pending exports of the asked kind, within the limit", async () => {
      const pending = await insertFile({
        subType: "channelPostComments",
        workspaceId,
      })
      const settled = await insertFile({
        status: "uploaded",
        subType: "channelPostComments",
        workspaceId,
      })
      const otherKind = await insertFile({ subType: "contacts", workspaceId })
      const foreign = await insertFile({
        subType: "channelPostComments",
        workspaceId: otherWorkspaceId,
      })

      const rows = await fileRepository.listPendingExportsForWorkspace({
        limit: 50,
        subType: "channelPostComments",
        workspaceId,
      })

      const ids = rows.map((row) => row.id)
      expect(ids).toContain(pending)
      expect(ids).not.toContain(settled)
      expect(ids).not.toContain(otherKind)
      expect(ids).not.toContain(foreign)
      expect(
        (
          await fileRepository.listPendingExportsForWorkspace({
            limit: 1,
            subType: "channelPostComments",
            workspaceId,
          })
        ).length,
      ).toBe(1)
    })
  })

  describe("listExportsCreatedBefore", () => {
    test("returns old export rows of the asked kinds only, oldest first", async () => {
      const contacts = await insertFile({
        createdAt: OLD,
        subType: "contacts",
        workspaceId,
      })
      const comments = await insertFile({
        createdAt: new Date(OLD.getTime() + 1000),
        subType: "channelPostComments",
        workspaceId: otherWorkspaceId,
      })
      const coupons = await insertFile({
        createdAt: OLD,
        subType: "coupons",
        workspaceId,
      })
      const recent = await insertFile({
        createdAt: RECENT,
        subType: "contacts",
        workspaceId,
      })
      const generic = await insertFile({
        contextType: "generic",
        createdAt: OLD,
        subType: null,
        workspaceId,
      })
      const mine = [contacts, comments, coupons, recent, generic]

      const rows = await fileRepository.listExportsCreatedBefore({
        before: CUTOFF,
        limit: 10_000,
        subTypes: ["contacts", "channelPostComments"],
      })

      const ids = rows.map((row) => row.id).filter((id) => mine.includes(id))
      expect(ids).toEqual([contacts, comments])
    })
  })

  describe("listWorkspaceExportsBatch", () => {
    test("returns the workspace's export files of every kind, not generic files or other workspaces'", async () => {
      const contacts = await insertFile({ workspaceId })
      const comments = await insertFile({
        subType: "channelPostComments",
        workspaceId,
      })
      const generic = await insertFile({
        contextType: "generic",
        subType: null,
        workspaceId,
      })
      const foreign = await insertFile({ workspaceId: otherWorkspaceId })

      const rows = await fileRepository.listWorkspaceExportsBatch({
        limit: 10_000,
        workspaceId,
      })

      const ids = rows.map((row) => row.id)
      expect(ids).toContain(contacts)
      expect(ids).toContain(comments)
      expect(ids).not.toContain(generic)
      expect(ids).not.toContain(foreign)
    })
  })
})
