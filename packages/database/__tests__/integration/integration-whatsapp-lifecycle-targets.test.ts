// @vitest-environment node

import { createId } from "@chatbotx.io/utils"
import { inArray, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DatabaseClient } from "../../src/client"
import type { ProviderAccountRouteScope } from "../../src/partials"
import { relations } from "../../src/relations"
import { integrationWhatsappRepository } from "../../src/repositories/integration-whatsapp/repository"
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

const uniqueSuffix = () => `${Date.now()}-${Math.random()}`

const seedUser = async (tx: DatabaseClient, label: string) => {
  const [user] = await tx
    .insert(schema.userModel)
    .values({ email: `lifecycle-${label}-${uniqueSuffix()}@example.test` })
    .returning({ id: schema.userModel.id })
  return user.id
}

const seedNumber = async (
  tx: DatabaseClient,
  input: {
    ownerId: string
    tenantId?: string
    wabaId: string
    phoneNumberId: string
    isManual?: boolean
    withConnection?: boolean
    /** The provider app the number connected through; absent = a legacy row. */
    appId?: string
  },
) => {
  const [workspace] = await tx
    .insert(schema.workspaceModel)
    .values({
      name: `lifecycle-${input.phoneNumberId}`,
      ownerId: input.ownerId,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    })
    .returning({ id: schema.workspaceModel.id })
  const [inbox] = await tx
    .insert(schema.inboxModel)
    .values({
      name: input.phoneNumberId,
      channel: "whatsapp",
      sourceId: input.phoneNumberId,
      workspaceId: workspace.id,
    })
    .returning({ id: schema.inboxModel.id })
  const [integration] = await tx
    .insert(schema.integrationWhatsappModel)
    .values({
      auth: {
        ...(input.appId ? { clientId: input.appId } : {}),
        ...(input.isManual ? { metadata: { isManual: true } } : {}),
      },
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId,
      businessId: "business",
      name: input.phoneNumberId,
      workspaceId: workspace.id,
      inboxId: inbox.id,
    })
    .returning({ id: schema.integrationWhatsappModel.id })
  let connectionId: string | null = null
  if (input.withConnection) {
    // Raw insert on the long-standing columns only: the typed insert also
    // writes the provider-event columns, which exist only once the migration
    // has been applied, and this read test must not depend on that.
    connectionId = createId()
    await tx.execute(sql`
      INSERT INTO "Connection"
        ("id", "workspaceId", "provider", "kind", "channel", "inboxId", "sourceId", "displayName")
      VALUES
        (${connectionId}, ${workspace.id}, 'whatsapp', 'channel', 'whatsapp', ${inbox.id}, ${input.phoneNumberId}, ${input.phoneNumberId})
    `)
  }
  return {
    workspaceId: workspace.id,
    integrationId: integration.id,
    inboxId: inbox.id,
    connectionId,
  }
}

const phoneNumberIdsFor = async (
  tx: DatabaseClient,
  wabaId: string,
  scope: ProviderAccountRouteScope,
) => {
  const targets =
    await integrationWhatsappRepository.listAccountTargetsByWabaId(
      { wabaId, scope },
      tx,
    )
  if (targets.length === 0) {
    return []
  }
  const rows = await tx
    .select({
      id: schema.integrationWhatsappModel.id,
      phoneNumberId: schema.integrationWhatsappModel.phoneNumberId,
    })
    .from(schema.integrationWhatsappModel)
    .where(
      inArray(
        schema.integrationWhatsappModel.id,
        targets.map((target) => target.integrationId),
      ),
    )
  const phoneById = new Map(rows.map((row) => [row.id, row.phoneNumberId]))
  return targets.map((target) => phoneById.get(target.integrationId))
}

describe.skipIf(!databaseUrl)(
  "integrationWhatsappRepository.listAccountTargetsByWabaId",
  () => {
    let client: Client
    let db: DatabaseClient

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl ?? undefined })
      await client.connect()
      db = createDatabase(client) as unknown as DatabaseClient
    })

    afterAll(async () => {
      await client.end()
    })

    test("each route only reaches the numbers that connected through its own app", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const waba = `waba-${uniqueSuffix()}`
        const platformUser = await seedUser(tx, "platform")
        const ownCredentialUser = await seedUser(tx, "own-credential")
        const resellerOwner = await seedUser(tx, "reseller")
        const resellerCustomer = await seedUser(tx, "customer")
        const [tenant] = await tx
          .insert(schema.tenantModel)
          .values({ ownerId: resellerOwner })
          .returning({ id: schema.tenantModel.id })
        await tx.insert(schema.platformCredentialModel).values([
          {
            userId: ownCredentialUser,
            type: "whatsapp",
            publicConfig: {},
            value: {},
          },
          {
            userId: resellerOwner,
            type: "whatsapp",
            publicConfig: {},
            value: {},
          },
        ] as never)

        await seedNumber(tx, {
          ownerId: platformUser,
          wabaId: waba,
          phoneNumberId: "p-platform",
        })
        await seedNumber(tx, {
          ownerId: ownCredentialUser,
          wabaId: waba,
          phoneNumberId: "p-own-credential",
        })
        await seedNumber(tx, {
          ownerId: resellerCustomer,
          tenantId: tenant.id,
          wabaId: waba,
          phoneNumberId: "p-reseller-customer",
        })
        await seedNumber(tx, {
          ownerId: platformUser,
          wabaId: waba,
          phoneNumberId: "p-manual",
          isManual: true,
        })
        await seedNumber(tx, {
          ownerId: platformUser,
          wabaId: `${waba}-other`,
          phoneNumberId: "p-other-waba",
        })

        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "platform",
            appId: "app-platform",
          }),
        ).toEqual(["p-platform"])
        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "credentialOwner",
            ownerId: ownCredentialUser,
            appId: "app-owner",
          }),
        ).toEqual(["p-own-credential"])
        // A reseller's customers own their workspaces, but the reseller owns
        // the credential, so the reseller's route must reach them…
        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "credentialOwner",
            ownerId: resellerOwner,
            appId: "app-owner",
          }),
        ).toEqual(["p-reseller-customer"])
        // …and the customer's own user id must not.
        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "credentialOwner",
            ownerId: resellerCustomer,
            appId: "app-owner",
          }),
        ).toEqual([])
      })
    })

    test("a number follows the app it connected through, not the owner's current credential", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const waba = `waba-${uniqueSuffix()}`
        const owner = await seedUser(tx, "switched-app")
        // The owner connected through the platform app, then saved an app of
        // their own: their credential row now exists.
        await tx.insert(schema.platformCredentialModel).values({
          userId: owner,
          type: "whatsapp",
          publicConfig: {},
          value: {},
        } as never)
        await seedNumber(tx, {
          ownerId: owner,
          wabaId: waba,
          phoneNumberId: "p-via-platform",
          appId: "app-platform",
        })
        await seedNumber(tx, {
          ownerId: owner,
          wabaId: waba,
          phoneNumberId: "p-via-own-app",
          appId: "app-owner",
        })

        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "platform",
            appId: "app-platform",
          }),
        ).toEqual(["p-via-platform"])
        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "credentialOwner",
            ownerId: owner,
            appId: "app-owner",
          }),
        ).toEqual(["p-via-own-app"])
        // An unrelated app matches neither.
        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "platform",
            appId: "app-unrelated",
          }),
        ).toEqual([])
      })
    })

    test("a reseller without an app of its own falls under the platform app", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const waba = `waba-${uniqueSuffix()}`
        const resellerOwner = await seedUser(tx, "reseller-no-app")
        const customer = await seedUser(tx, "customer-no-app")
        const [tenant] = await tx
          .insert(schema.tenantModel)
          .values({ ownerId: resellerOwner })
          .returning({ id: schema.tenantModel.id })
        await seedNumber(tx, {
          ownerId: customer,
          tenantId: tenant.id,
          wabaId: waba,
          phoneNumberId: "p-inherited",
        })

        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "platform",
            appId: "app-platform",
          }),
        ).toEqual(["p-inherited"])
      })
    })

    test("an owner whose credential row only delegates to the platform stays on the platform route", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const waba = `waba-${uniqueSuffix()}`
        const delegatingOwner = await seedUser(tx, "delegating")
        await tx.insert(schema.platformCredentialModel).values({
          userId: delegatingOwner,
          type: "whatsapp",
          publicConfig: {},
          value: {},
          usePlatformCredential: true,
        } as never)
        await seedNumber(tx, {
          ownerId: delegatingOwner,
          wabaId: waba,
          phoneNumberId: "p-delegating",
        })

        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "platform",
            appId: "app-platform",
          }),
        ).toEqual(["p-delegating"])
      })
    })

    test("a manual integration is reached only by its own route, and only for its own WABA", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const waba = `waba-${uniqueSuffix()}`
        const owner = await seedUser(tx, "manual")
        const manual = await seedNumber(tx, {
          ownerId: owner,
          wabaId: waba,
          phoneNumberId: "p-manual-only",
          isManual: true,
        })
        const sibling = await seedNumber(tx, {
          ownerId: owner,
          wabaId: waba,
          phoneNumberId: "p-sibling",
        })

        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "manualIntegration",
            integrationId: manual.integrationId,
            workspaceId: manual.workspaceId,
          }),
        ).toEqual(["p-manual-only"])
        // The route pins one integration: a forged workspace id matches nothing.
        expect(
          await phoneNumberIdsFor(tx, waba, {
            kind: "manualIntegration",
            integrationId: manual.integrationId,
            workspaceId: sibling.workspaceId,
          }),
        ).toEqual([])
        // A different WABA never matches even for the right integration.
        expect(
          await phoneNumberIdsFor(tx, `${waba}-x`, {
            kind: "manualIntegration",
            integrationId: manual.integrationId,
            workspaceId: manual.workspaceId,
          }),
        ).toEqual([])
      })
    })

    test("the channel list flags manual integrations without exposing auth", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const owner = await seedUser(tx, "is-manual")
        const manual = await seedNumber(tx, {
          ownerId: owner,
          wabaId: `waba-${uniqueSuffix()}`,
          phoneNumberId: "p-flag-manual",
          isManual: true,
        })
        const embedded = await seedNumber(tx, {
          ownerId: owner,
          wabaId: `waba-${uniqueSuffix()}`,
          phoneNumberId: "p-flag-embedded",
        })

        const [manualRow] =
          await integrationWhatsappRepository.listClientResourcesByWorkspaceId(
            manual.workspaceId,
            tx,
          )
        const [embeddedRow] =
          await integrationWhatsappRepository.listClientResourcesByWorkspaceId(
            embedded.workspaceId,
            tx,
          )

        expect(manualRow?.isManual).toBe(true)
        expect(embeddedRow?.isManual).toBe(false)
        expect(manualRow).not.toHaveProperty("auth")
      })
    })

    test("pages by integration id so every number is reached", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const waba = `waba-${uniqueSuffix()}`
        const owner = await seedUser(tx, "paging")
        const numbers = [
          await seedNumber(tx, {
            ownerId: owner,
            wabaId: waba,
            phoneNumberId: "p-page-1",
          }),
          await seedNumber(tx, {
            ownerId: owner,
            wabaId: waba,
            phoneNumberId: "p-page-2",
          }),
          await seedNumber(tx, {
            ownerId: owner,
            wabaId: waba,
            phoneNumberId: "p-page-3",
          }),
        ]
        const ids = numbers.map((n) => n.integrationId).sort()

        const rest =
          await integrationWhatsappRepository.listAccountTargetsByWabaId(
            {
              wabaId: waba,
              scope: { kind: "platform", appId: "app-platform" },
              afterIntegrationId: ids[0],
            },
            tx,
          )

        expect(rest.map((t) => t.integrationId)).toEqual(ids.slice(1))
      })
    })

    test("returns the Connection id, the workspace owner, and null for a legacy row", async () => {
      await withRolledBackTransaction(db, async (tx) => {
        const waba = `waba-${uniqueSuffix()}`
        const owner = await seedUser(tx, "connection")
        const withConnection = await seedNumber(tx, {
          ownerId: owner,
          wabaId: waba,
          phoneNumberId: "p-with-connection",
          withConnection: true,
        })
        const legacy = await seedNumber(tx, {
          ownerId: owner,
          wabaId: waba,
          phoneNumberId: "p-legacy",
        })

        const targets =
          await integrationWhatsappRepository.listAccountTargetsByWabaId(
            {
              wabaId: waba,
              scope: { kind: "platform", appId: "app-platform" },
            },
            tx,
          )

        const byIntegration = new Map(targets.map((t) => [t.integrationId, t]))
        expect(byIntegration.get(withConnection.integrationId)).toMatchObject({
          connectionId: withConnection.connectionId,
          workspaceOwnerId: owner,
          integrationId: withConnection.integrationId,
        })
        expect(byIntegration.get(legacy.integrationId)?.connectionId).toBeNull()
      })
    })
  },
)
