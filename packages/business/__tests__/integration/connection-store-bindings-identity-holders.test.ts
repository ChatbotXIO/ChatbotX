// @vitest-environment node

/**
 * `ConnectionStoreBinding.findIdentityHolders` against a real Postgres: a
 * channel satellite row reserves its account identity through a global unique
 * index whatever the `Connection` status is, so the connect picker asks the
 * binding which workspaces already hold a set of accounts.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db } from "@chatbotx.io/database/client"
import {
  inboxModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { AuthType, type SecretTextAuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { describe, expect, test } from "vitest"
import { CONNECTION_STORE_BINDINGS } from "../../src/connection/store-bindings"

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

/** Thrown at the end of a fixture transaction so it never commits. */
class RollbackSignal extends Error {}

const withRolledBackTransaction = async (
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

const seedWorkspace = async (tx: DatabaseClient): Promise<string> => {
  const ownerId = createId()
  const workspaceId = createId()
  await tx.insert(userModel).values({
    id: ownerId,
    email: `identity-holders-${ownerId}@example.test`,
    name: "Identity holders test owner",
  })
  await tx.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Identity holders test workspace",
  })
  return workspaceId
}

const testAuth: SecretTextAuthValue = {
  authType: AuthType.secretText,
  secretText: "test-token",
}

const messengerBinding = () => {
  const binding = CONNECTION_STORE_BINDINGS.messenger
  if (!binding?.findIdentityHolders) {
    throw new Error("messenger binding must expose findIdentityHolders")
  }
  return { binding, findIdentityHolders: binding.findIdentityHolders }
}

describe.skipIf(!databaseUrl)("findIdentityHolders against Postgres", () => {
  test("returns the workspace holding each reserved page, with no Connection row", async () => {
    await withRolledBackTransaction(async (tx) => {
      const { binding, findIdentityHolders } = messengerBinding()
      const holderWorkspaceId = await seedWorkspace(tx)
      const pageId = `page-${createId()}`
      const inboxId = createId()
      await tx.insert(inboxModel).values({
        id: inboxId,
        workspaceId: holderWorkspaceId,
        name: "Holder inbox",
        channel: "messenger",
        sourceId: pageId,
      })
      await binding.insertRow(
        {
          kind: "channel",
          workspaceId: holderWorkspaceId,
          inboxId,
          auth: testAuth,
          descriptor: { sourceId: pageId, displayName: "Holder page" },
        },
        tx,
      )

      const holders = await findIdentityHolders(
        [pageId, `free-${createId()}`],
        tx,
      )

      expect(holders).toEqual([
        {
          sourceId: pageId,
          workspaceId: holderWorkspaceId,
          inboxId,
          matchesBinding: true,
        },
      ])
    })
  })

  test("reports a row of the sibling slice as outside the binding's own slice", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx)
      const igId = `ig-${createId()}`
      const inboxId = createId()
      await tx.insert(inboxModel).values({
        id: inboxId,
        workspaceId,
        name: "Instagram inbox",
        channel: "instagram",
        sourceId: igId,
      })
      const facebookBinding = CONNECTION_STORE_BINDINGS.instagramFacebook
      const instagramBinding = CONNECTION_STORE_BINDINGS.instagram
      if (
        !(
          facebookBinding?.findIdentityHolders &&
          instagramBinding?.findIdentityHolders
        )
      ) {
        throw new Error("instagram bindings must expose findIdentityHolders")
      }
      await facebookBinding.insertRow(
        {
          kind: "channel",
          workspaceId,
          inboxId,
          auth: testAuth,
          descriptor: { sourceId: igId, displayName: "IG account" },
          config: { pageId: `page-${igId}`, username: `user_${igId}` },
        },
        tx,
      )

      await expect(
        instagramBinding.findIdentityHolders([igId], tx),
      ).resolves.toEqual([
        { sourceId: igId, workspaceId, inboxId, matchesBinding: false },
      ])
      await expect(
        facebookBinding.findIdentityHolders([igId], tx),
      ).resolves.toEqual([
        { sourceId: igId, workspaceId, inboxId, matchesBinding: true },
      ])
    })
  })
})
