// @vitest-environment node

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { integrationSmtpRepository } from "../../src/repositories/integration-smtp/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

class RollbackSignal extends Error {}

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

const withRolledBackTransaction = async (
  db: DatabaseClient,
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

const DUE_SCAN_LIMIT = 10_000
const NOW = new Date("2026-11-18T12:00:00.000Z")
const MINUTE_MS = 60_000

const seedWorkspace = async (tx: DatabaseClient, label: string) => {
  const suffix = `${label}-${Date.now()}-${Math.random()}`
  const [owner] = await tx
    .insert(schema.userModel)
    .values({ email: `integration-smtp-repository-${suffix}@example.test` })
    .returning({ id: schema.userModel.id })
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({
      name: `integration-smtp-repository-${suffix}`,
      ownerId: owner.id,
    })
    .returning({ id: schema.workspaceModel.id })
  return workspace.id
}

type SeedSmtp = {
  workspaceId: string
  label: string
  status?: "connected" | "disconnected"
  imapEnabled?: boolean
  imapNextPollAt?: Date | null
  lastPolledAt?: Date | null
  inboundToken?: string | null
}

const seedSmtp = async (tx: DatabaseClient, input: SeedSmtp) => {
  const suffix = `${input.label}-${Date.now()}-${Math.random()}`
  const [inbox] = await tx
    .insert(schema.inboxModel)
    .values({
      workspaceId: input.workspaceId,
      name: `smtp-${suffix}`,
      channel: "smtp",
      sourceId: `smtp-${suffix}@example.test`,
      status: input.status ?? "connected",
    })
    .returning({ id: schema.inboxModel.id })
  const [row] = await tx
    .insert(schema.integrationSmtpModel)
    .values({
      workspaceId: input.workspaceId,
      inboxId: inbox.id,
      auth: {},
      name: `smtp-${suffix}`,
      fromAddress: `smtp-${suffix}@example.test`,
      imapEnabled: input.imapEnabled ?? true,
      imapNextPollAt: input.imapNextPollAt ?? null,
      lastPolledAt: input.lastPolledAt ?? null,
      inboundToken: input.inboundToken ?? null,
    })
    .returning()
  return row
}

describe.skipIf(!databaseUrl)(
  "integrationSmtpRepository against Postgres",
  () => {
    let client: Client

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
    })

    afterAll(async () => {
      await client.end()
    })

    const run = (fn: (tx: DatabaseClient) => Promise<void>) =>
      withRolledBackTransaction(createDatabase(client), fn)

    describe("listDueImapInboxes", () => {
      test("skips IMAP-off, disconnected and not-yet-due inboxes", () =>
        run(async (tx) => {
          const workspaceId = await seedWorkspace(tx, "due")
          const due = await seedSmtp(tx, { workspaceId, label: "due" })
          const elapsed = await seedSmtp(tx, {
            workspaceId,
            label: "elapsed",
            imapNextPollAt: new Date(NOW.getTime() - MINUTE_MS),
          })
          const imapOff = await seedSmtp(tx, {
            workspaceId,
            label: "off",
            imapEnabled: false,
          })
          const disconnected = await seedSmtp(tx, {
            workspaceId,
            label: "gone",
            status: "disconnected",
          })
          const future = await seedSmtp(tx, {
            workspaceId,
            label: "future",
            imapNextPollAt: new Date(NOW.getTime() + MINUTE_MS),
          })

          const result = await integrationSmtpRepository.listDueImapInboxes(
            { now: NOW, limit: DUE_SCAN_LIMIT },
            tx,
          )
          const ids = result.map((item) => item.id)

          expect(ids).toContain(due.id)
          expect(ids).toContain(elapsed.id)
          expect(ids).not.toContain(imapOff.id)
          expect(ids).not.toContain(disconnected.id)
          expect(ids).not.toContain(future.id)
        }))

      test("orders least-recently-polled first, never-polled before all", () =>
        run(async (tx) => {
          const workspaceId = await seedWorkspace(tx, "order")
          const recent = await seedSmtp(tx, {
            workspaceId,
            label: "recent",
            lastPolledAt: new Date(NOW.getTime() - MINUTE_MS),
          })
          const old = await seedSmtp(tx, {
            workspaceId,
            label: "old",
            lastPolledAt: new Date(NOW.getTime() - 60 * MINUTE_MS),
          })
          const never = await seedSmtp(tx, {
            workspaceId,
            label: "never",
            lastPolledAt: null,
          })
          const ours = new Set([recent.id, old.id, never.id])

          const result = await integrationSmtpRepository.listDueImapInboxes(
            { now: NOW, limit: DUE_SCAN_LIMIT },
            tx,
          )

          expect(
            result.map((item) => item.id).filter((id) => ours.has(id)),
          ).toEqual([never.id, old.id, recent.id])
        }))
    })

    describe("findByInboundToken", () => {
      test("finds the row of a connected inbox by its token", () =>
        run(async (tx) => {
          const workspaceId = await seedWorkspace(tx, "token")
          const row = await seedSmtp(tx, {
            workspaceId,
            label: "token",
            inboundToken: `tok-${Math.random()}`,
          })

          const found = await integrationSmtpRepository.findByInboundToken(
            row.inboundToken as string,
            tx,
          )

          expect(found).toMatchObject({ id: row.id, inboxId: row.inboxId })
        }))

      test("returns undefined for an unknown token", () =>
        run(async (tx) => {
          await expect(
            integrationSmtpRepository.findByInboundToken(
              `missing-${Math.random()}`,
              tx,
            ),
          ).resolves.toBeUndefined()
        }))

      test("returns undefined for a disconnected inbox but keeps the token", () =>
        run(async (tx) => {
          const workspaceId = await seedWorkspace(tx, "disconnected")
          const row = await seedSmtp(tx, {
            workspaceId,
            label: "disconnected",
            status: "disconnected",
            inboundToken: `tok-${Math.random()}`,
          })

          await expect(
            integrationSmtpRepository.findByInboundToken(
              row.inboundToken as string,
              tx,
            ),
          ).resolves.toBeUndefined()
          await expect(
            integrationSmtpRepository.findById(row.id, tx),
          ).resolves.toMatchObject({ inboundToken: row.inboundToken })
        }))
    })

    describe("inbound token writes are workspace-scoped", () => {
      test("setInboundToken updates nothing for another workspace", () =>
        run(async (tx) => {
          const owner = await seedWorkspace(tx, "owner")
          const other = await seedWorkspace(tx, "other")
          const row = await seedSmtp(tx, {
            workspaceId: owner,
            label: "scoped",
            inboundToken: "original",
          })

          await expect(
            integrationSmtpRepository.setInboundToken(
              { id: row.id, workspaceId: other, token: "hijacked" },
              tx,
            ),
          ).resolves.toBeUndefined()
          await expect(
            integrationSmtpRepository.setInboundToken(
              { id: row.id, workspaceId: owner, token: "rotated" },
              tx,
            ),
          ).resolves.toMatchObject({ inboundToken: "rotated" })
        }))

      test("setInboundTokenIfUnset updates nothing for another workspace or a set token", () =>
        run(async (tx) => {
          const owner = await seedWorkspace(tx, "owner-unset")
          const other = await seedWorkspace(tx, "other-unset")
          const row = await seedSmtp(tx, {
            workspaceId: owner,
            label: "unset",
            inboundToken: null,
          })

          await expect(
            integrationSmtpRepository.setInboundTokenIfUnset(
              { id: row.id, workspaceId: other, token: "hijacked" },
              tx,
            ),
          ).resolves.toBeUndefined()
          await expect(
            integrationSmtpRepository.setInboundTokenIfUnset(
              { id: row.id, workspaceId: owner, token: "first" },
              tx,
            ),
          ).resolves.toMatchObject({ inboundToken: "first" })
          await expect(
            integrationSmtpRepository.setInboundTokenIfUnset(
              { id: row.id, workspaceId: owner, token: "second" },
              tx,
            ),
          ).resolves.toBeUndefined()
        }))
    })
  },
)
