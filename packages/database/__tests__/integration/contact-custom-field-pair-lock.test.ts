// @vitest-environment node

/**
 * `contactCustomFieldRepository.lockPairs` serializes read-modify-write on a
 * `(contact, field)` pair even when the row does not exist yet, and its global
 * ordering keeps opposite-order callers from deadlocking. Needs two committed
 * connections, so the fixture is committed and deleted in `afterAll`
 * (workspace deletion cascades).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
import { contactCustomFieldRepository } from "../../src/repositories/contact-custom-field/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const ROUNDS = 25

const createDatabase = (client: Client) =>
  drizzle({ client, schema, relations })

describe.skipIf(!databaseUrl)("contactCustomFieldRepository pair locks", () => {
  let clientA: Client
  let clientB: Client
  let dbA: ReturnType<typeof createDatabase>
  let dbB: ReturnType<typeof createDatabase>
  let workspaceId: string
  let ownerId: string
  let contactIds: string[]
  let fieldIds: string[]

  beforeAll(async () => {
    clientA = new Client({ connectionString: databaseUrl as string })
    clientB = new Client({ connectionString: databaseUrl as string })
    await Promise.all([clientA.connect(), clientB.connect()])
    dbA = createDatabase(clientA)
    dbB = createDatabase(clientB)
    const [owner] = await dbA
      .insert(schema.userModel)
      .values({ email: `ccf-lock-${Date.now()}-${Math.random()}@example.test` })
      .returning({ id: schema.userModel.id })
    ownerId = owner.id
    const [workspace] = await dbA
      .insert(schema.workspaceModel)
      .values({ name: "ccf-lock", ownerId })
      .returning({ id: schema.workspaceModel.id })
    workspaceId = workspace.id
    const contacts = await dbA
      .insert(schema.contactModel)
      .values([{ workspaceId }, { workspaceId }])
      .returning({ id: schema.contactModel.id })
    contactIds = contacts.map((contact) => contact.id)
    const fields = await dbA
      .insert(schema.customFieldModel)
      .values([
        { workspaceId, name: "points", type: "number" as const },
        { workspaceId, name: "visits", type: "number" as const },
      ])
      .returning({ id: schema.customFieldModel.id })
    fieldIds = fields.map((field) => field.id)
  })

  afterAll(async () => {
    await dbA
      .delete(schema.workspaceModel)
      .where(eq(schema.workspaceModel.id, workspaceId))
    await dbA.delete(schema.userModel).where(eq(schema.userModel.id, ownerId))
    await Promise.all([clientA.end(), clientB.end()])
  })

  const readValue = async (contactId: string, customFieldId: string) => {
    const [row] = await dbA
      .select({ value: schema.contactCustomFieldModel.value })
      .from(schema.contactCustomFieldModel)
      .where(
        and(
          eq(schema.contactCustomFieldModel.contactId, contactId),
          eq(schema.contactCustomFieldModel.customFieldId, customFieldId),
        ),
      )
    return row?.value ?? null
  }

  /** The same lock → read → write shape `applyFieldOperations` uses. */
  const increment = (
    db: typeof dbA,
    contactId: string,
    customFieldId: string,
  ) =>
    db.transaction(async (tx) => {
      await contactCustomFieldRepository.lockPairs(tx, [
        { contactId, customFieldId },
      ])
      const [current] = await contactCustomFieldRepository.listValuesForPairs(
        { contactIds: [contactId], customFieldIds: [customFieldId] },
        tx,
      )
      const next = String(Number(current?.value ?? 0) + 1)
      await tx
        .insert(schema.contactCustomFieldModel)
        .values({ contactId, customFieldId, value: next })
        .onConflictDoUpdate({
          target: [
            schema.contactCustomFieldModel.contactId,
            schema.contactCustomFieldModel.customFieldId,
          ],
          set: { value: next },
        })
    })

  test("two concurrent increments on a missing row both count", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const contactId = contactIds[0] as string
      const customFieldId = fieldIds[0] as string
      await dbA
        .delete(schema.contactCustomFieldModel)
        .where(eq(schema.contactCustomFieldModel.contactId, contactId))

      await Promise.all([
        increment(dbA, contactId, customFieldId),
        increment(dbB, contactId, customFieldId),
      ])

      expect(await readValue(contactId, customFieldId)).toBe("2")
    }
  })

  test("a plain set racing an increment on an existing row stays serial", async () => {
    const contactId = contactIds[0] as string
    const customFieldId = fieldIds[1] as string
    const plainSet = (db: typeof dbA, value: string) =>
      db
        .insert(schema.contactCustomFieldModel)
        .values({ contactId, customFieldId, value })
        .onConflictDoUpdate({
          target: [
            schema.contactCustomFieldModel.contactId,
            schema.contactCustomFieldModel.customFieldId,
          ],
          set: { value },
        })

    for (let round = 0; round < ROUNDS; round += 1) {
      await plainSet(dbA, "10")

      await Promise.all([
        increment(dbA, contactId, customFieldId),
        plainSet(dbB, "100"),
      ])

      // Serial orders only: set then increment = 101, increment then set = 100.
      // A lost update would leave 11 (the increment read 10, the set landed in between).
      expect(["100", "101"]).toContain(
        await readValue(contactId, customFieldId),
      )
    }
  })

  test("opposite-order multi-pair locks never deadlock", async () => {
    const pairs = contactIds.flatMap((contactId) =>
      fieldIds.map((customFieldId) => ({ contactId, customFieldId })),
    )
    for (let round = 0; round < ROUNDS; round += 1) {
      await Promise.all([
        dbA.transaction((tx) =>
          contactCustomFieldRepository.lockPairs(tx, pairs),
        ),
        dbB.transaction((tx) =>
          contactCustomFieldRepository.lockPairs(tx, [...pairs].reverse()),
        ),
      ])
    }
    expect(true).toBe(true)
  })

  test("deleteValue returns what it removed, or null when there was nothing", async () => {
    const contactId = contactIds[1] as string
    const customFieldId = fieldIds[1] as string
    await dbA
      .insert(schema.contactCustomFieldModel)
      .values({ contactId, customFieldId, value: "7" })

    expect(
      await contactCustomFieldRepository.deleteValue(
        { contactId, customFieldId },
        dbA,
      ),
    ).toBe("7")
    expect(
      await contactCustomFieldRepository.deleteValue(
        { contactId, customFieldId },
        dbA,
      ),
    ).toBeNull()
  })

  test("a rolled-back transaction leaves the value untouched", async () => {
    const contactId = contactIds[1] as string
    const customFieldId = fieldIds[0] as string
    await expect(
      dbA.transaction(async (tx) => {
        await tx
          .insert(schema.contactCustomFieldModel)
          .values({ contactId, customFieldId, value: "9" })
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")

    expect(await readValue(contactId, customFieldId)).toBeNull()
  })
})
