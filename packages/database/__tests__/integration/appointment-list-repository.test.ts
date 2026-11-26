// @vitest-environment node

import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import { relations } from "../../src/relations"
import { appointmentRepository } from "../../src/repositories/appointment/repository"
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

const seedWorkspace = async (
  tx: DatabaseClient,
  label: string,
  ownerId: string,
) => {
  const suffix = `${label}-${Date.now()}-${Math.random()}`
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({ name: `appointment-list-${suffix}`, ownerId })
    .returning({ id: schema.workspaceModel.id })
  const [calendar] = await tx
    .insert(schema.appointmentCalendarModel)
    .values({
      workspaceId: workspace.id,
      name: `Calendar ${label}`,
      timezone: "UTC",
      locationType: "onlineMeeting",
      publicLinkSlug: `appointment-list-${suffix}`,
    })
    .returning({ id: schema.appointmentCalendarModel.id })
  const [contact] = await tx
    .insert(schema.contactModel)
    .values({
      workspaceId: workspace.id,
      firstName: `First-${label}`,
      lastName: `Last-${label}`,
      avatar: `https://example.test/${label}.png`,
    })
    .returning({ id: schema.contactModel.id })
  return {
    workspaceId: workspace.id,
    calendarId: calendar.id,
    contactId: contact.id,
  }
}

const seedAppointment = async (
  tx: DatabaseClient,
  input: { workspaceId: string; calendarId: string; contactId: string },
) => {
  const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const [appointment] = await tx
    .insert(schema.appointmentModel)
    .values({
      ...input,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
      inviteeTimezone: "UTC",
      locationType: "onlineMeeting",
    })
    .returning({ id: schema.appointmentModel.id })
  return appointment.id
}

describe.skipIf(!databaseUrl)(
  "appointmentRepository.list against Postgres",
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

    test("returns the joined contact and leaves out rows whose calendar or contact belongs to another workspace", async () => {
      await run(async (tx) => {
        const [owner] = await tx
          .insert(schema.userModel)
          .values({
            email: `appointment-list-${Date.now()}-${Math.random()}@example.test`,
          })
          .returning({ id: schema.userModel.id })
        const own = await seedWorkspace(tx, "own", owner.id)
        const foreign = await seedWorkspace(tx, "foreign", owner.id)

        const ownAppointmentId = await seedAppointment(tx, own)
        // Foreign keys only check the id, so these cross-workspace rows can
        // exist; the list joins must not pick them up.
        await seedAppointment(tx, {
          ...own,
          contactId: foreign.contactId,
        })
        await seedAppointment(tx, {
          ...own,
          calendarId: foreign.calendarId,
        })

        const result = await appointmentRepository.list(
          { workspaceId: own.workspaceId, tab: "next" },
          tx,
        )

        expect(result.total).toBe(1)
        expect(result.pageCount).toBe(1)
        expect(result.data).toHaveLength(1)
        expect(result.data[0]).toMatchObject({
          id: ownAppointmentId,
          calendarName: "Calendar own",
          contact: {
            id: own.contactId,
            avatar: "https://example.test/own.png",
            firstName: "First-own",
            lastName: "Last-own",
            fullName: "First-own Last-own",
          },
        })
      })
    })

    test("searches by the joined contact's name", async () => {
      await run(async (tx) => {
        const [owner] = await tx
          .insert(schema.userModel)
          .values({
            email: `appointment-search-${Date.now()}-${Math.random()}@example.test`,
          })
          .returning({ id: schema.userModel.id })
        const own = await seedWorkspace(tx, "own", owner.id)
        await seedAppointment(tx, own)

        const hit = await appointmentRepository.list(
          { workspaceId: own.workspaceId, tab: "next", search: "first-own" },
          tx,
        )
        const miss = await appointmentRepository.list(
          { workspaceId: own.workspaceId, tab: "next", search: "nobody" },
          tx,
        )

        expect(hit.total).toBe(1)
        expect(miss.total).toBe(0)
        expect(miss.data).toEqual([])
      })
    })
  },
)
