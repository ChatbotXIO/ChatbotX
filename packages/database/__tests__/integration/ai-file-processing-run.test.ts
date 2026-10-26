// @vitest-environment node

/**
 * `AiFileEmbeddingRepository` processing-run claim/lease/finish and the
 * `reconcilePendingChunks` error reset against a real Postgres. The unit test
 * only renders the SQL; the jsonb guards (`COALESCE` over `->>`, lexical ISO
 * comparison, `||` patches with text-cast parameters) only prove themselves
 * here.
 *
 * Every test seeds its own fixture inside a transaction that is always rolled
 * back, so nothing is left behind in the database. Needs the
 * `add_ai_file_processing_run` migration applied to the local database.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import type { AIFileProcessingRun } from "../../src/partials"
import { relations } from "../../src/relations"
import { AiFileEmbeddingRepository } from "../../src/repositories/ai-file-embedding/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const NOW = "2026-10-24T10:00:00.000Z"
const STALE_BEFORE = "2026-10-24T09:00:00.000Z"
const OLD = "2026-10-24T08:00:00.000Z"
const FRESH = "2026-10-24T09:30:00.000Z"

/** Thrown at the end of a fixture transaction so it never commits. */
class RollbackSignal extends Error {}

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

const withRolledBackTransaction = async (
  db: ReturnType<typeof createDatabase>,
  fn: (tx: DatabaseClient) => Promise<void>,
): Promise<void> => {
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

const buildRun = (
  overrides: Partial<AIFileProcessingRun> = {},
): AIFileProcessingRun => ({
  id: "run-active",
  status: "queued",
  error: null,
  queuedAt: NOW,
  startedAt: null,
  heartbeatAt: null,
  finishedAt: null,
  ...overrides,
})

type Fixture = { workspaceId: string; aiFileId: string }

const seedFixture = async (
  tx: DatabaseClient,
  processingRun: unknown,
): Promise<Fixture> => {
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `ai-file-run-${Date.now()}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: "ai-file-run", ownerId: owner.id })
    .returning({ id: schema.workspaceModel.id })
  const [file] = await tx
    .insert(schema.aiFileModel)
    .values({
      name: "prices.csv",
      path: "ai-file-run/prices.csv",
      size: 10,
      mimeType: "text/csv",
      workspaceId: workspace.id,
      // Malformed jsonb is part of the matrix, so bypass the column type.
      processingRun: processingRun as AIFileProcessingRun | null,
    })
    .returning({ id: schema.aiFileModel.id })
  return { workspaceId: workspace.id, aiFileId: file.id }
}

const readRun = async (tx: DatabaseClient, aiFileId: string) => {
  const [row] = await tx
    .select({ processingRun: schema.aiFileModel.processingRun })
    .from(schema.aiFileModel)
    .where(eq(schema.aiFileModel.id, aiFileId))
  return row?.processingRun ?? null
}

describe.skipIf(!databaseUrl)(
  "AiFileEmbeddingRepository processing runs against Postgres",
  () => {
    let client: Client

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
    })

    afterAll(async () => {
      await client.end()
    })

    const run = (
      processingRun: unknown,
      fn: (
        repository: AiFileEmbeddingRepository,
        fixture: Fixture,
        tx: DatabaseClient,
      ) => Promise<void>,
    ) =>
      withRolledBackTransaction(createDatabase(client), async (tx) => {
        const fixture = await seedFixture(tx, processingRun)
        await fn(new AiFileEmbeddingRepository(tx), fixture, tx)
      })

    const claimCases: [string, unknown, boolean][] = [
      ["no run (NULL)", null, true],
      [
        "a finished run",
        buildRun({ status: "success", finishedAt: NOW }),
        true,
      ],
      ["a failed run", buildRun({ status: "error", error: "unknown" }), true],
      ["an active run within the lease", buildRun({ queuedAt: FRESH }), false],
      [
        "an unstarted run stale by queuedAt",
        buildRun({ queuedAt: OLD, heartbeatAt: null }),
        true,
      ],
      [
        "an old run with a fresh heartbeat",
        buildRun({ status: "processing", queuedAt: OLD, heartbeatAt: FRESH }),
        false,
      ],
      [
        "a run whose queuedAt and heartbeatAt are both old",
        buildRun({ status: "processing", queuedAt: OLD, heartbeatAt: OLD }),
        true,
      ],
      ["jsonb without a status", { id: "broken" }, true],
    ]

    test.each(
      claimCases,
    )("claim over %s → %s", async (_label, existing, expected) => {
      await run(existing, async (repository, fixture, tx) => {
        const next = buildRun({ id: "run-next" })
        await expect(
          repository.claimProcessingRun({
            ...fixture,
            run: next,
            staleBeforeIso: STALE_BEFORE,
          }),
        ).resolves.toBe(expected)
        const stored = await readRun(tx, fixture.aiFileId)
        expect(stored).toEqual(expected ? next : existing)
      })
    })

    test("claim is scoped to the workspace", async () => {
      await run(null, async (repository, fixture) => {
        await expect(
          repository.claimProcessingRun({
            aiFileId: fixture.aiFileId,
            workspaceId: "999999999",
            run: buildRun(),
            staleBeforeIso: STALE_BEFORE,
          }),
        ).resolves.toBe(false)
      })
    })

    test("start keeps the first startedAt, then lease and finish patch only their keys", async () => {
      await run(buildRun(), async (repository, fixture, tx) => {
        const ids = { ...fixture, runId: "run-active" }
        await expect(
          repository.markProcessingRunStarted({ ...ids, now: NOW }),
        ).resolves.toBe(true)
        await expect(
          repository.markProcessingRunStarted({
            ...ids,
            now: "2026-10-24T10:01:00.000Z",
          }),
        ).resolves.toBe(true)
        await expect(
          repository.refreshProcessingRunLease({
            ...ids,
            heartbeatAt: "2026-10-24T10:02:00.000Z",
          }),
        ).resolves.toBe(true)
        await expect(
          repository.finishProcessingRun({
            ...ids,
            status: "success",
            error: null,
            finishedAt: "2026-10-24T10:03:00.000Z",
          }),
        ).resolves.toBe(true)

        expect(await readRun(tx, fixture.aiFileId)).toEqual(
          buildRun({
            status: "success",
            startedAt: NOW,
            heartbeatAt: "2026-10-24T10:02:00.000Z",
            finishedAt: "2026-10-24T10:03:00.000Z",
          }),
        )
      })
    })

    test("records an error code and ignores a second finish", async () => {
      await run(
        buildRun({ status: "processing" }),
        async (repository, fixture, tx) => {
          const ids = { ...fixture, runId: "run-active" }
          await expect(
            repository.finishProcessingRun({
              ...ids,
              status: "error",
              error: "fileUnreadable",
              finishedAt: NOW,
            }),
          ).resolves.toBe(true)
          await expect(
            repository.finishProcessingRun({
              ...ids,
              status: "success",
              error: null,
              finishedAt: NOW,
            }),
          ).resolves.toBe(false)
          expect(await readRun(tx, fixture.aiFileId)).toMatchObject({
            status: "error",
            error: "fileUnreadable",
          })
        },
      )
    })

    test.each([
      ["queued", buildRun()],
      ["success", buildRun({ status: "success" })],
      ["error", buildRun({ status: "error", error: "unknown" })],
    ])("lease refresh is refused for a %s run", async (_label, existing) => {
      await run(existing, async (repository, fixture) => {
        await expect(
          repository.refreshProcessingRunLease({
            ...fixture,
            runId: "run-active",
            heartbeatAt: NOW,
          }),
        ).resolves.toBe(false)
      })
    })

    test("a superseded run can no longer refresh its lease or finish", async () => {
      await run(
        buildRun({ status: "processing", queuedAt: OLD, heartbeatAt: OLD }),
        async (repository, fixture) => {
          await expect(
            repository.claimProcessingRun({
              ...fixture,
              run: buildRun({ id: "run-next" }),
              staleBeforeIso: STALE_BEFORE,
            }),
          ).resolves.toBe(true)
          const old = { ...fixture, runId: "run-active" }
          await expect(
            repository.refreshProcessingRunLease({ ...old, heartbeatAt: NOW }),
          ).resolves.toBe(false)
          await expect(
            repository.markProcessingRunStarted({ ...old, now: NOW }),
          ).resolves.toBe(false)
          await expect(
            repository.finishProcessingRun({
              ...old,
              status: "success",
              error: null,
              finishedAt: NOW,
            }),
          ).resolves.toBe(false)
        },
      )
    })

    test("reconcile resets error/processing chunks it keeps and leaves success alone", async () => {
      await run(null, async (repository, fixture, tx) => {
        await tx.insert(schema.aiEmbeddingModel).values(
          (
            [
              ["910000000000000001", "error"],
              ["910000000000000002", "processing"],
              ["910000000000000003", "success"],
            ] as const
          ).map(([id, status]) => ({
            id,
            status,
            content: id,
            aiFileId: fixture.aiFileId,
            workspaceId: fixture.workspaceId,
          })),
        )

        const pending = await repository.reconcilePendingChunks({
          ...fixture,
          chunks: [
            { id: "910000000000000001", content: "a", chunkIndex: 0 },
            { id: "910000000000000002", content: "b", chunkIndex: 1 },
            { id: "910000000000000003", content: "c", chunkIndex: 2 },
          ],
        })

        expect(pending.map((row) => row.id).sort()).toEqual([
          "910000000000000001",
          "910000000000000002",
        ])
        const [success] = await tx
          .select({ status: schema.aiEmbeddingModel.status })
          .from(schema.aiEmbeddingModel)
          .where(eq(schema.aiEmbeddingModel.id, "910000000000000003"))
        expect(success?.status).toBe("success")
      })
    })

    const readConfig = async (tx: DatabaseClient, aiFileId: string) => {
      const [row] = await tx
        .select({ chunkingConfig: schema.aiFileModel.chunkingConfig })
        .from(schema.aiFileModel)
        .where(eq(schema.aiFileModel.id, aiFileId))
      return row?.chunkingConfig ?? null
    }

    const claim = (
      repository: AiFileEmbeddingRepository,
      fixture: Fixture,
      chunkingConfig?: Parameters<
        AiFileEmbeddingRepository["claimProcessingRun"]
      >[0]["chunkingConfig"],
    ) =>
      repository.claimProcessingRun({
        ...fixture,
        run: buildRun({ id: "run-new" }),
        staleBeforeIso: STALE_BEFORE,
        chunkingConfig,
      })

    test("claim writes, resets or keeps the chunking parameters with the run", async () => {
      await run(null, async (repository, fixture, tx) => {
        expect(await claim(repository, fixture, { chunkSize: 500 })).toBe(true)
        expect(await readConfig(tx, fixture.aiFileId)).toEqual({
          chunkSize: 500,
        })

        // Omitted: the stored parameters survive a plain reindex.
        await tx
          .update(schema.aiFileModel)
          .set({
            processingRun: buildRun({ status: "success", finishedAt: NOW }),
          })
          .where(eq(schema.aiFileModel.id, fixture.aiFileId))
        expect(await claim(repository, fixture)).toBe(true)
        expect(await readConfig(tx, fixture.aiFileId)).toEqual({
          chunkSize: 500,
        })

        await tx
          .update(schema.aiFileModel)
          .set({
            processingRun: buildRun({ status: "error", error: "unknown" }),
          })
          .where(eq(schema.aiFileModel.id, fixture.aiFileId))
        expect(await claim(repository, fixture, null)).toBe(true)
        expect(await readConfig(tx, fixture.aiFileId)).toBeNull()
      })
    })

    test("a claim refused by an active run leaves the parameters untouched", async () => {
      await run(
        buildRun({ queuedAt: FRESH }),
        async (repository, fixture, tx) => {
          expect(await claim(repository, fixture, { chunkSize: 500 })).toBe(
            false,
          )
          expect(await readConfig(tx, fixture.aiFileId)).toBeNull()
        },
      )
    })

    const seedChunks = async (
      tx: DatabaseClient,
      fixture: Fixture,
      rows: [id: string, chunkIndex: number | null, content?: string][],
    ) => {
      await tx.insert(schema.aiEmbeddingModel).values(
        rows.map(([id, chunkIndex, content]) => ({
          id,
          chunkIndex,
          status: "success" as const,
          content: content ?? id,
          aiFileId: fixture.aiFileId,
          workspaceId: fixture.workspaceId,
        })),
      )
    }

    test("reconcile numbers kept rows without touching status or other positions", async () => {
      await run(null, async (repository, fixture, tx) => {
        await seedChunks(tx, fixture, [
          ["920000000000000001", null],
          ["920000000000000002", 7],
        ])

        await repository.reconcilePendingChunks({
          ...fixture,
          chunks: [
            { id: "920000000000000001", content: "a", chunkIndex: 0 },
            // Same id arriving with another position cannot happen (the id
            // hashes the position); the stored value is never overwritten.
            { id: "920000000000000002", content: "b", chunkIndex: 1 },
          ],
        })

        const rows = await tx
          .select({
            id: schema.aiEmbeddingModel.id,
            chunkIndex: schema.aiEmbeddingModel.chunkIndex,
            status: schema.aiEmbeddingModel.status,
          })
          .from(schema.aiEmbeddingModel)
          .where(eq(schema.aiEmbeddingModel.aiFileId, fixture.aiFileId))
        const byId = new Map(rows.map((row) => [row.id, row]))
        expect(byId.get("920000000000000001")).toMatchObject({
          chunkIndex: 0,
          status: "success",
        })
        expect(byId.get("920000000000000002")).toMatchObject({
          chunkIndex: 7,
          status: "success",
        })
      })
    })

    test("reconcile stores the position of new chunks", async () => {
      await run(null, async (repository, fixture, tx) => {
        await repository.reconcilePendingChunks({
          ...fixture,
          chunks: [
            { id: "930000000000000001", content: "a", chunkIndex: 0 },
            { id: "930000000000000002", content: "b", chunkIndex: 1 },
          ],
        })

        const rows = await tx
          .select({ chunkIndex: schema.aiEmbeddingModel.chunkIndex })
          .from(schema.aiEmbeddingModel)
          .where(eq(schema.aiEmbeddingModel.aiFileId, fixture.aiFileId))
        expect(rows.map((row) => row.chunkIndex).sort()).toEqual([0, 1])
      })
    })

    test("listChunks follows document order, unnumbered rows last, across pages", async () => {
      await run(null, async (repository, fixture, tx) => {
        await seedChunks(tx, fixture, [
          ["940000000000000005", 2],
          ["940000000000000001", 0],
          ["940000000000000009", null],
          ["940000000000000003", 1],
          ["940000000000000007", null],
        ])
        const page = (
          cursor?: { chunkIndex: number | null; id: string },
          fromChunkIndex?: number,
        ) =>
          repository.listChunks({
            ...fixture,
            limit: 2,
            cursor,
            fromChunkIndex,
          })

        const first = await page()
        // limit + 1 rows come back so the caller can detect another page.
        expect(first.map((row) => row.id)).toEqual([
          "940000000000000001",
          "940000000000000003",
          "940000000000000005",
        ])

        const second = await page({
          chunkIndex: 1,
          id: "940000000000000003",
        })
        expect(second.map((row) => row.id)).toEqual([
          "940000000000000005",
          "940000000000000007",
          "940000000000000009",
        ])

        const third = await page({
          chunkIndex: null,
          id: "940000000000000007",
        })
        expect(third.map((row) => row.id)).toEqual(["940000000000000009"])

        const from = await page(undefined, 1)
        expect(from.map((row) => row.id)).toEqual([
          "940000000000000003",
          "940000000000000005",
          "940000000000000007",
        ])
      })
    })

    test("listChunks never returns another workspace's file", async () => {
      await run(null, async (repository, fixture, tx) => {
        await seedChunks(tx, fixture, [["950000000000000001", 0]])

        const rows = await repository.listChunks({
          workspaceId: "999999999999",
          aiFileId: fixture.aiFileId,
          limit: 10,
        })

        expect(rows).toEqual([])
      })
    })

    test("findChunksContaining matches literally and ignores case", async () => {
      await run(null, async (repository, fixture, tx) => {
        await seedChunks(tx, fixture, [
          ["960000000000000001", 0, "Sale 50% OFF today"],
          ["960000000000000002", 1, "Sale 500 off today"],
          ["960000000000000003", 2, "code a_b"],
          ["960000000000000004", 3, "code axb"],
        ])
        const find = (pattern: string) =>
          repository.findChunksContaining({
            workspaceId: fixture.workspaceId,
            fileIds: [fixture.aiFileId],
            pattern,
            limit: 20,
          })

        expect((await find("%50\\% off%")).map((row) => row.id)).toEqual([
          "960000000000000001",
        ])
        expect((await find("%a\\_b%")).map((row) => row.id)).toEqual([
          "960000000000000003",
        ])
        expect((await find("%SALE%")).map((row) => row.chunkIndex)).toEqual([
          0, 1,
        ])
      })
    })

    test("findChunksContaining is scoped to the workspace and files given", async () => {
      await run(null, async (repository, fixture, tx) => {
        await seedChunks(tx, fixture, [["970000000000000001", 0, "secret"]])

        expect(
          await repository.findChunksContaining({
            workspaceId: "999999999999",
            fileIds: [fixture.aiFileId],
            pattern: "%secret%",
            limit: 20,
          }),
        ).toEqual([])
        expect(
          await repository.findChunksContaining({
            workspaceId: fixture.workspaceId,
            fileIds: ["999999999999"],
            pattern: "%secret%",
            limit: 20,
          }),
        ).toEqual([])
      })
    })
  },
)
