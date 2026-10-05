// @vitest-environment node

/**
 * Real-Postgres coverage for `backfillConnections` (plan Phase 4): seeds
 * pre-Connection-table Inbox/Integration + satellite rows across a
 * representative spread of providers and status states, runs the backfill
 * directly (no subprocess), and asserts every inserted `Connection` row
 * matches the plan's mapping table, satisfies every real CHECK constraint
 * (the insert simply not throwing is the proof), and that `--verify` plus a
 * second run demonstrate idempotency.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { AuthType, type AuthValue } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { and, eq } from "drizzle-orm"
import { describe, expect, test, vi } from "vitest"
import {
  type BackfillConnectionsResult,
  backfillConnections,
  type Candidate,
  parseArgs,
  printResult,
} from "../../scripts/backfill-connections"
import { type DatabaseClient, db } from "../../src/client"
import type { ChannelType, InboxDisconnectReason } from "../../src/partials"
import {
  connectionModel,
  inboxModel,
  integrationApiModel,
  integrationClaudeModel,
  integrationFacebookAdsModel,
  integrationGoogleCalendarModel,
  integrationGoogleSheetsModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationModel,
  integrationSmtpModel,
  integrationTelegramModel,
  integrationTiktokModel,
  integrationWebchatModel,
  integrationWhatsappModel,
  integrationZaloModel,
  userModel,
  workspaceModel,
} from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

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

const seedWorkspace = async (
  tx: DatabaseClient,
  label: string,
): Promise<string> => {
  const ownerId = createId()
  const workspaceId = createId()
  await tx.insert(userModel).values({
    id: ownerId,
    email: `backfill-connections-${label}-${ownerId}@example.test`,
    name: "Backfill connections test owner",
  })
  await tx.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: `backfill-connections-${label}-${workspaceId}`,
  })
  return workspaceId
}

const secretTextAuth: AuthValue = {
  authType: AuthType.secretText,
  secretText: "test-secret",
}

const seedInbox = async (
  tx: DatabaseClient,
  input: {
    workspaceId: string
    channel: ChannelType
    sourceId: string
    name: string
    status?: "connected" | "disconnected"
    disconnectReason?: InboxDisconnectReason | null
    disconnectedAt?: Date | null
  },
): Promise<{ inboxId: string; createdAt: Date }> => {
  const inboxId = createId()
  const [row] = await tx
    .insert(inboxModel)
    .values({
      id: inboxId,
      workspaceId: input.workspaceId,
      name: input.name,
      channel: input.channel,
      sourceId: input.sourceId,
      status: input.status ?? "connected",
      disconnectReason: input.disconnectReason ?? null,
      disconnectedAt: input.disconnectedAt ?? null,
    })
    .returning({ createdAt: inboxModel.createdAt })
  return { inboxId, createdAt: row.createdAt }
}

const seedIntegration = async (
  tx: DatabaseClient,
  workspaceId: string,
  integrationType: string,
): Promise<string> => {
  const integrationId = createId()
  await tx
    .insert(integrationModel)
    .values({ id: integrationId, workspaceId, integrationType })
  return integrationId
}

const findConnection = async (
  tx: DatabaseClient,
  input: { workspaceId: string; provider: string; sourceId: string },
) =>
  await tx.query.connectionModel.findFirst({
    where: {
      workspaceId: input.workspaceId,
      provider: input.provider,
      sourceId: input.sourceId,
    },
  })

const workspaceOwnerId = async (
  tx: DatabaseClient,
  workspaceId: string,
): Promise<string> => {
  const row = await tx.query.workspaceModel.findFirst({
    where: { id: workspaceId },
    columns: { ownerId: true },
  })
  if (!row) {
    throw new Error(`workspace ${workspaceId} not found`)
  }
  return row.ownerId
}

describe.skipIf(!databaseUrl)("backfillConnections against Postgres", () => {
  test("maps every representative provider/status combination to a valid Connection row, is idempotent, and surfaces duplicate conflicts", async () => {
    await withRolledBackTransaction(async (tx) => {
      const mainWorkspaceId = await seedWorkspace(tx, "main")

      // Case A: messenger, connected, no tokenRefreshError -> connected.
      const messengerConnectedPageId = `page-connected-${createId()}`
      const { inboxId: messengerConnectedInboxId } = await seedInbox(tx, {
        workspaceId: mainWorkspaceId,
        channel: "messenger",
        sourceId: messengerConnectedPageId,
        name: "Connected Page",
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId: mainWorkspaceId,
        inboxId: messengerConnectedInboxId,
        pageId: messengerConnectedPageId,
        name: "Connected Page",
        auth: secretTextAuth,
        // DB columns have no default despite the Drizzle schema declaring one.
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      // Case B: whatsapp, connected, has tokenRefreshError -> degraded/refresh_failed.
      const whatsappPhoneNumberId = `phone-${createId()}`
      const { inboxId: whatsappInboxId } = await seedInbox(tx, {
        workspaceId: mainWorkspaceId,
        channel: "whatsapp",
        sourceId: whatsappPhoneNumberId,
        name: "Degraded Number",
      })
      await tx.insert(integrationWhatsappModel).values({
        workspaceId: mainWorkspaceId,
        inboxId: whatsappInboxId,
        phoneNumberId: whatsappPhoneNumberId,
        wabaId: `waba-${createId()}`,
        businessId: `biz-${createId()}`,
        name: "Verified Name Co",
        displayPhoneNumber: "+1 555 0100",
        auth: secretTextAuth,
        tokenRefreshError: "refresh_token_expired",
      })

      // Case C: zalo, disconnected/manual -> disconnected/manual with disconnectedAt.
      const zaloOaId = `oa-${createId()}`
      const manualDisconnectedAt = new Date("2026-01-02T03:04:05.000Z")
      const { inboxId: zaloManualInboxId } = await seedInbox(tx, {
        workspaceId: mainWorkspaceId,
        channel: "zalo",
        sourceId: zaloOaId,
        name: "Manually Disconnected OA",
        status: "disconnected",
        disconnectReason: "manual",
        disconnectedAt: manualDisconnectedAt,
      })
      await tx.insert(integrationZaloModel).values({
        workspaceId: mainWorkspaceId,
        inboxId: zaloManualInboxId,
        oaId: zaloOaId,
        name: "Manual Zalo OA",
        auth: secretTextAuth,
      })

      // Case D: tiktok, disconnected, NULL reason (legacy) -> needs_reauth/token_revoked + conflict.
      const tiktokOpenId = `open-${createId()}`
      const { inboxId: tiktokInboxId } = await seedInbox(tx, {
        workspaceId: mainWorkspaceId,
        channel: "tiktok",
        sourceId: `username-${createId()}`,
        name: "Legacy TikTok",
        status: "disconnected",
        disconnectReason: null,
      })
      await tx.insert(integrationTiktokModel).values({
        workspaceId: mainWorkspaceId,
        inboxId: tiktokInboxId,
        openId: tiktokOpenId,
        name: "Legacy TikTok Display Name",
        auth: secretTextAuth,
      })

      // Case E: messenger, disconnected/tenant_suspended -> paused.
      const messengerPausedPageId = `page-paused-${createId()}`
      const { inboxId: messengerPausedInboxId } = await seedInbox(tx, {
        workspaceId: mainWorkspaceId,
        channel: "messenger",
        sourceId: messengerPausedPageId,
        name: "Paused Page",
        status: "disconnected",
        disconnectReason: "tenant_suspended",
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId: mainWorkspaceId,
        inboxId: messengerPausedInboxId,
        pageId: messengerPausedPageId,
        name: "Paused Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      // Case F: claude, workspace-singleton AI-key integration -> connected, sourceId "workspace".
      const claudeIntegrationId = await seedIntegration(
        tx,
        mainWorkspaceId,
        "claude",
      )
      await tx.insert(integrationClaudeModel).values({
        workspaceId: mainWorkspaceId,
        integrationId: claudeIntegrationId,
        auth: secretTextAuth,
        maxOutputTokens: 1024,
        model: "claude-test",
      })

      // Case G: facebookAds, status "invalid" -> needs_reauth/token_revoked.
      const facebookAdsIntegrationId = await seedIntegration(
        tx,
        mainWorkspaceId,
        "facebookAds",
      )
      await tx.insert(integrationFacebookAdsModel).values({
        workspaceId: mainWorkspaceId,
        integrationId: facebookAdsIntegrationId,
        auth: secretTextAuth,
        status: "invalid",
      })

      // Case H: googleCalendar, oauth2 auth with expiry + email -> connected,
      // sourceId = providerCalendarId, displayName = email, authExpiresAt set.
      const googleCalendarIntegrationId = await seedIntegration(
        tx,
        mainWorkspaceId,
        "googleCalendar",
      )
      const calendarExpiresAt = "2027-06-01T00:00:00.000Z"
      await tx.insert(integrationGoogleCalendarModel).values({
        workspaceId: mainWorkspaceId,
        integrationId: googleCalendarIntegrationId,
        auth: {
          authType: AuthType.oauth2,
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUrl: "https://example.test/callback",
          tokens: { accessToken: "access-token", expiresAt: calendarExpiresAt },
        } satisfies AuthValue,
        providerCalendarId: "calendar-primary-xyz",
        email: "calendar-owner@example.test",
      })

      // Case I: googleSheets, legacy row with no auth.metadata.accountId ->
      // sourceId falls back to "legacy:<integrationId>".
      const googleSheetsIntegrationId = await seedIntegration(
        tx,
        mainWorkspaceId,
        "googleSheets",
      )
      await tx.insert(integrationGoogleSheetsModel).values({
        workspaceId: mainWorkspaceId,
        integrationId: googleSheetsIntegrationId,
        auth: secretTextAuth,
      })

      // Case J: telegram, already has a matching Connection row (as if a
      // migrated connect() flow already wrote it) -> must stay a no-op.
      const telegramBotId = `bot-${createId()}`
      const { inboxId: telegramInboxId, createdAt: telegramCreatedAt } =
        await seedInbox(tx, {
          workspaceId: mainWorkspaceId,
          channel: "telegram",
          sourceId: telegramBotId,
          name: "Pre-existing Telegram bot",
        })
      await tx.insert(integrationTelegramModel).values({
        workspaceId: mainWorkspaceId,
        inboxId: telegramInboxId,
        botId: telegramBotId,
        name: "Pre-existing Telegram bot",
        auth: secretTextAuth,
      })
      const preExistingConnectionId = createId()
      await tx.insert(connectionModel).values({
        id: preExistingConnectionId,
        workspaceId: mainWorkspaceId,
        provider: "telegram",
        kind: "channel",
        channel: "telegram",
        inboxId: telegramInboxId,
        sourceId: telegramBotId,
        displayName: "Telegram bot",
        status: "connected",
        connectedAt: telegramCreatedAt,
      })

      // --- First backfill run, scoped to this workspace ---
      const firstRun = await backfillConnections(tx, {
        workspaceId: mainWorkspaceId,
      })
      expect(firstRun.dryRun).toBe(false)
      // 9 brand-new rows (A-I); case J already existed, so ON CONFLICT DO
      // NOTHING must skip it.
      expect(firstRun.totalInserted).toBe(9)

      const messengerConnected = await findConnection(tx, {
        workspaceId: mainWorkspaceId,
        provider: "messenger",
        sourceId: messengerConnectedPageId,
      })
      expect(messengerConnected).toMatchObject({
        kind: "channel",
        channel: "messenger",
        inboxId: messengerConnectedInboxId,
        displayName: "Connected Page",
        status: "connected",
        statusReason: null,
        disconnectedAt: null,
      })

      const whatsappDegraded = await findConnection(tx, {
        workspaceId: mainWorkspaceId,
        provider: "whatsapp",
        sourceId: whatsappPhoneNumberId,
      })
      expect(whatsappDegraded).toMatchObject({
        status: "degraded",
        statusReason: "refresh_failed",
        disconnectedAt: null,
        displayName: "Verified Name Co",
      })

      const zaloManual = await findConnection(tx, {
        workspaceId: mainWorkspaceId,
        provider: "zalo",
        sourceId: zaloOaId,
      })
      expect(zaloManual).toMatchObject({
        status: "disconnected",
        statusReason: "manual",
      })
      expect(zaloManual?.disconnectedAt?.toISOString()).toBe(
        manualDisconnectedAt.toISOString(),
      )

      const tiktokLegacy = await findConnection(tx, {
        workspaceId: mainWorkspaceId,
        provider: "tiktok",
        sourceId: tiktokOpenId,
      })
      expect(tiktokLegacy).toMatchObject({
        status: "needs_reauth",
        statusReason: "token_revoked",
        disconnectedAt: null,
        displayName: "Legacy TikTok Display Name",
      })
      const legacyConflict = firstRun.conflicts.find(
        (conflict) =>
          conflict.kind === "legacy_needs_reauth_heuristic" &&
          conflict.provider === "tiktok",
      )
      const mainOwnerId = await workspaceOwnerId(tx, mainWorkspaceId)
      expect(legacyConflict).toMatchObject({
        workspaceId: mainWorkspaceId,
        ownerId: mainOwnerId,
        inboxId: tiktokInboxId,
      })

      const messengerPaused = await findConnection(tx, {
        workspaceId: mainWorkspaceId,
        provider: "messenger",
        sourceId: messengerPausedPageId,
      })
      expect(messengerPaused).toMatchObject({
        status: "paused",
        statusReason: "tenant_suspended",
        disconnectedAt: null,
      })

      const claudeConnection = await findConnection(tx, {
        workspaceId: mainWorkspaceId,
        provider: "claude",
        sourceId: "workspace",
      })
      expect(claudeConnection).toMatchObject({
        kind: "integration",
        channel: null,
        inboxId: null,
        integrationId: claudeIntegrationId,
        displayName: "Claude",
        status: "connected",
        statusReason: null,
      })

      const facebookAdsConnection = await findConnection(tx, {
        workspaceId: mainWorkspaceId,
        provider: "facebookAds",
        sourceId: "workspace",
      })
      expect(facebookAdsConnection).toMatchObject({
        status: "needs_reauth",
        statusReason: "token_revoked",
        displayName: "Facebook Ads",
      })

      const googleCalendarConnection = await findConnection(tx, {
        workspaceId: mainWorkspaceId,
        provider: "googleCalendar",
        sourceId: "calendar-primary-xyz",
      })
      expect(googleCalendarConnection).toMatchObject({
        status: "connected",
        displayName: "calendar-owner@example.test",
      })
      expect(googleCalendarConnection?.authExpiresAt?.toISOString()).toBe(
        new Date(calendarExpiresAt).toISOString(),
      )

      const googleSheetsConnection = await findConnection(tx, {
        workspaceId: mainWorkspaceId,
        provider: "googleSheets",
        sourceId: `legacy:${googleSheetsIntegrationId}`,
      })
      expect(googleSheetsConnection).toMatchObject({
        status: "connected",
        displayName: "Google Sheets",
      })

      // Case J stayed a no-op: still exactly the pre-existing row.
      const telegramRows = await tx
        .select()
        .from(connectionModel)
        .where(
          and(
            eq(connectionModel.workspaceId, mainWorkspaceId),
            eq(connectionModel.provider, "telegram"),
          ),
        )
      expect(telegramRows).toHaveLength(1)
      expect(telegramRows[0].id).toBe(preExistingConnectionId)

      // --- Verify: all three counts must be 0 after a successful backfill. ---
      const verifyResult = await backfillConnections(tx, {
        verify: true,
        workspaceId: mainWorkspaceId,
      })
      expect(verifyResult.verify).toEqual({
        channelInboxesMissingConnection: 0,
        integrationsMissingConnection: 0,
        statusMismatches: 0,
        channelInboxesWithNoSatellite: 0,
      })

      // --- Re-run: idempotency, 0 new inserts. ---
      const secondRun = await backfillConnections(tx, {
        workspaceId: mainWorkspaceId,
      })
      expect(secondRun.totalInserted).toBe(0)
    })
  })

  test("reports a Zalo oaId connected from more than one workspace", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceA = await seedWorkspace(tx, "zalo-cross-a")
      const workspaceB = await seedWorkspace(tx, "zalo-cross-b")
      const sharedOaId = `cross-ws-oa-${createId()}`

      const inboxA = await seedInbox(tx, {
        workspaceId: workspaceA,
        channel: "zalo",
        sourceId: sharedOaId,
        name: "Cross-workspace OA (A)",
      })
      await tx.insert(integrationZaloModel).values({
        workspaceId: workspaceA,
        inboxId: inboxA.inboxId,
        oaId: sharedOaId,
        name: "Cross-workspace OA (A)",
        auth: secretTextAuth,
      })

      const inboxB = await seedInbox(tx, {
        workspaceId: workspaceB,
        channel: "zalo",
        sourceId: sharedOaId,
        name: "Cross-workspace OA (B)",
      })
      await tx.insert(integrationZaloModel).values({
        workspaceId: workspaceB,
        inboxId: inboxB.inboxId,
        oaId: sharedOaId,
        name: "Cross-workspace OA (B)",
        auth: secretTextAuth,
      })

      // Unscoped by workspace (provider-scoped only) so both workspaces'
      // rows are visible in the same run — required to detect a
      // cross-workspace duplicate at all.
      const result = await backfillConnections(tx, { provider: "zalo" })
      expect(
        result.conflicts.some(
          (conflict) =>
            conflict.kind === "duplicate_zalo_oaid" &&
            conflict.sourceId === sharedOaId,
        ),
      ).toBe(true)

      // Unlike the same-workspace case, each workspace has its own
      // (workspaceId, provider, sourceId) key, so both rows are legitimately
      // inserted.
      const connectionA = await findConnection(tx, {
        workspaceId: workspaceA,
        provider: "zalo",
        sourceId: sharedOaId,
      })
      const connectionB = await findConnection(tx, {
        workspaceId: workspaceB,
        provider: "zalo",
        sourceId: sharedOaId,
      })
      expect(connectionA).toBeDefined()
      expect(connectionB).toBeDefined()
    })
  })

  test("--dry-run performs no writes", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "dry-run")
      const pageId = `page-dry-run-${createId()}`
      const { inboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "messenger",
        sourceId: pageId,
        name: "Dry Run Page",
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId,
        inboxId,
        pageId,
        name: "Dry Run Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      const dryRunResult = await backfillConnections(tx, {
        workspaceId,
        dryRun: true,
      })
      expect(dryRunResult.totalInserted).toBe(1)
      const sample: Candidate | undefined = dryRunResult.sample.find(
        (candidate) => candidate.sourceId === pageId,
      )
      expect(sample).toMatchObject({
        status: "connected",
        provider: "messenger",
      })

      const rows = await tx
        .select()
        .from(connectionModel)
        .where(eq(connectionModel.workspaceId, workspaceId))
      expect(rows).toHaveLength(0)
    })
  })

  test("a pre-existing Connection row with a different sourceId for the same inboxId is reported as a conflict, not overwritten, and the rest of the batch still inserts", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "existing-conflict")

      // Row A: already has a Connection row, but its satellite's pageId has
      // since drifted to a NEW value — legacy data the live engine already
      // connected under the OLD identity.
      const oldPageId = `page-old-${createId()}`
      const newPageId = `page-new-${createId()}`
      const { inboxId: driftedInboxId, createdAt: driftedCreatedAt } =
        await seedInbox(tx, {
          workspaceId,
          channel: "messenger",
          sourceId: newPageId,
          name: "Drifted Page",
        })
      await tx.insert(integrationMessengerModel).values({
        workspaceId,
        inboxId: driftedInboxId,
        pageId: newPageId,
        name: "Drifted Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })
      await tx.insert(connectionModel).values({
        id: createId(),
        workspaceId,
        provider: "messenger",
        kind: "channel",
        channel: "messenger",
        inboxId: driftedInboxId,
        sourceId: oldPageId,
        displayName: "Drifted Page (stale)",
        status: "connected",
        connectedAt: driftedCreatedAt,
      })

      // Row B: an unrelated, perfectly normal candidate in the SAME batch —
      // proves the untargeted `onConflictDoNothing` doesn't abort the whole
      // multi-row INSERT over row A's conflict.
      const healthyPageId = `page-healthy-${createId()}`
      const { inboxId: healthyInboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "messenger",
        sourceId: healthyPageId,
        name: "Healthy Page",
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId,
        inboxId: healthyInboxId,
        pageId: healthyPageId,
        name: "Healthy Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      const result = await backfillConnections(tx, { workspaceId })
      expect(result.totalInserted).toBe(1)

      // Row A's stale Connection row is untouched (never overwritten).
      const staleRow = await findConnection(tx, {
        workspaceId,
        provider: "messenger",
        sourceId: oldPageId,
      })
      expect(staleRow?.inboxId).toBe(driftedInboxId)
      const driftedRow = await findConnection(tx, {
        workspaceId,
        provider: "messenger",
        sourceId: newPageId,
      })
      expect(driftedRow).toBeUndefined()

      // Row B still inserted despite row A's conflict in the same batch.
      const healthyRow = await findConnection(tx, {
        workspaceId,
        provider: "messenger",
        sourceId: healthyPageId,
      })
      expect(healthyRow).toMatchObject({ status: "connected" })

      const ownerId = await workspaceOwnerId(tx, workspaceId)
      const conflict = result.conflicts.find(
        (c) => c.kind === "existing_connection_conflict",
      )
      expect(conflict).toMatchObject({
        workspaceId,
        ownerId,
        inboxId: driftedInboxId,
        sourceId: newPageId,
      })
    })
  })

  test("true duplicate source: two different googleSheets Integrations in the same workspace resolving to the same accountId — only one wins, the conflict reports workspaceId/ownerId/integrationId per row", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "dup-source")
      const sharedAccountId = `account-dup-${createId()}`

      const integrationOne = await seedIntegration(
        tx,
        workspaceId,
        "googleSheets",
      )
      await tx.insert(integrationGoogleSheetsModel).values({
        workspaceId,
        integrationId: integrationOne,
        auth: {
          authType: AuthType.oauth2,
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUrl: "https://example.test/callback",
          tokens: { accessToken: "access-token-one" },
          metadata: { accountId: sharedAccountId, email: "one@example.test" },
        } satisfies AuthValue,
      })

      const integrationTwo = await seedIntegration(
        tx,
        workspaceId,
        "googleSheets",
      )
      await tx.insert(integrationGoogleSheetsModel).values({
        workspaceId,
        integrationId: integrationTwo,
        auth: {
          authType: AuthType.oauth2,
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUrl: "https://example.test/callback",
          tokens: { accessToken: "access-token-two" },
          metadata: { accountId: sharedAccountId, email: "two@example.test" },
        } satisfies AuthValue,
      })

      const result = await backfillConnections(tx, { workspaceId })
      expect(result.totalInserted).toBe(1)

      const ownerId = await workspaceOwnerId(tx, workspaceId)
      const duplicateConflicts = result.conflicts.filter(
        (c) => c.kind === "duplicate_source_inbox",
      )
      expect(duplicateConflicts).toHaveLength(2)
      const reportedIntegrationIds = duplicateConflicts
        .map((c) => c.integrationId)
        .sort()
      expect(reportedIntegrationIds).toEqual(
        [integrationOne, integrationTwo].sort(),
      )
      for (const conflict of duplicateConflicts) {
        expect(conflict).toMatchObject({
          workspaceId,
          ownerId,
          sourceId: sharedAccountId,
        })
      }

      const winningRow = await findConnection(tx, {
        workspaceId,
        provider: "googleSheets",
        sourceId: sharedAccountId,
      })
      expect([integrationOne, integrationTwo]).toContain(
        winningRow?.integrationId,
      )
    })
  })

  test("instagram and instagramFacebook share IntegrationInstagram but split by `type`", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "ig-split")

      const nativeIgId = `ig-native-${createId()}`
      const { inboxId: nativeInboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "instagram",
        sourceId: nativeIgId,
        name: "Native IG",
      })
      await tx.insert(integrationInstagramModel).values({
        workspaceId,
        inboxId: nativeInboxId,
        type: "instagram",
        igId: nativeIgId,
        pageId: `page-${createId()}`,
        name: "Native IG",
        username: "native_ig",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
      })

      const viaFacebookIgId = `ig-via-fb-${createId()}`
      const { inboxId: viaFacebookInboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "instagram",
        sourceId: viaFacebookIgId,
        name: "IG via Facebook Page",
      })
      await tx.insert(integrationInstagramModel).values({
        workspaceId,
        inboxId: viaFacebookInboxId,
        type: "facebook",
        igId: viaFacebookIgId,
        pageId: `page-${createId()}`,
        name: "IG via Facebook Page",
        username: "ig_via_fb",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
      })

      const result = await backfillConnections(tx, { workspaceId })
      expect(result.totalInserted).toBe(2)

      const nativeConnection = await findConnection(tx, {
        workspaceId,
        provider: "instagram",
        sourceId: nativeIgId,
      })
      expect(nativeConnection).toMatchObject({
        channel: "instagram",
        inboxId: nativeInboxId,
      })

      const viaFacebookConnection = await findConnection(tx, {
        workspaceId,
        provider: "instagramFacebook",
        sourceId: viaFacebookIgId,
      })
      expect(viaFacebookConnection).toMatchObject({
        channel: "instagram",
        inboxId: viaFacebookInboxId,
      })

      const verifyResult = await backfillConnections(tx, {
        verify: true,
        workspaceId,
      })
      expect(verifyResult.verify).toMatchObject({
        channelInboxesMissingConnection: 0,
        statusMismatches: 0,
      })
    })
  })

  test("api, smtp, and webchat channels backfill using the satellite row's own id as sourceId (not the literal 'workspace' singleton sourceId)", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "channel-singletons")

      const { inboxId: apiInboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "api",
        sourceId: `api-source-${createId()}`,
        name: "API Channel",
      })
      const [apiRow] = await tx
        .insert(integrationApiModel)
        .values({
          workspaceId,
          inboxId: apiInboxId,
          name: "API Channel",
          auth: secretTextAuth,
          tokenHash: createId(),
          tokenPrefix: "tok_",
        })
        .returning({ id: integrationApiModel.id })

      const { inboxId: smtpInboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "smtp",
        sourceId: `smtp-source-${createId()}`,
        name: "SMTP Channel",
      })
      const [smtpRow] = await tx
        .insert(integrationSmtpModel)
        .values({
          workspaceId,
          inboxId: smtpInboxId,
          name: "SMTP Channel",
          auth: secretTextAuth,
          fromAddress: "sender@example.test",
        })
        .returning({ id: integrationSmtpModel.id })

      const { inboxId: webchatInboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "webchat",
        sourceId: `webchat-source-${createId()}`,
        name: "Webchat Channel",
      })
      const [webchatRow] = await tx
        .insert(integrationWebchatModel)
        .values({
          workspaceId,
          inboxId: webchatInboxId,
          name: "Webchat Channel",
          auth: secretTextAuth,
          brandColor: "#000000",
          conversationStarters: [],
          persistentMenus: [],
          authorizedDomains: [],
        })
        .returning({ id: integrationWebchatModel.id })

      const result = await backfillConnections(tx, { workspaceId })
      expect(result.totalInserted).toBe(3)

      const apiConnection = await findConnection(tx, {
        workspaceId,
        provider: "api",
        sourceId: apiRow.id,
      })
      expect(apiConnection).toMatchObject({
        inboxId: apiInboxId,
        kind: "channel",
        channel: "api",
      })

      const smtpConnection = await findConnection(tx, {
        workspaceId,
        provider: "smtp",
        sourceId: smtpRow.id,
      })
      expect(smtpConnection).toMatchObject({
        inboxId: smtpInboxId,
        kind: "channel",
        channel: "smtp",
      })

      const webchatConnection = await findConnection(tx, {
        workspaceId,
        provider: "webchat",
        sourceId: webchatRow.id,
      })
      expect(webchatConnection).toMatchObject({
        inboxId: webchatInboxId,
        kind: "channel",
        channel: "webchat",
      })

      // Each is a per-Inbox channel identity, not the workspace-singleton
      // integration pattern's literal "workspace" sourceId (see
      // `credential-providers.ts`'s AI-key providers) — a second instance in
      // the same workspace must get its own identity, not collide.
      expect(apiConnection?.sourceId).not.toBe("workspace")
      expect(smtpConnection?.sourceId).not.toBe("workspace")
      expect(webchatConnection?.sourceId).not.toBe("workspace")
    })
  })

  test("trial_expired and workspace_purge Inbox.disconnectReason map 1-1 to the same Connection.statusReason", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "disconnect-reasons")
      const trialDisconnectedAt = new Date("2026-02-01T00:00:00.000Z")
      const purgeDisconnectedAt = new Date("2026-03-01T00:00:00.000Z")

      const trialExpiredPageId = `page-trial-${createId()}`
      const { inboxId: trialExpiredInboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "messenger",
        sourceId: trialExpiredPageId,
        name: "Trial Expired Page",
        status: "disconnected",
        disconnectReason: "trial_expired",
        disconnectedAt: trialDisconnectedAt,
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId,
        inboxId: trialExpiredInboxId,
        pageId: trialExpiredPageId,
        name: "Trial Expired Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      const purgePageId = `page-purge-${createId()}`
      const { inboxId: purgeInboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "messenger",
        sourceId: purgePageId,
        name: "Workspace Purge Page",
        status: "disconnected",
        disconnectReason: "workspace_purge",
        disconnectedAt: purgeDisconnectedAt,
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId,
        inboxId: purgeInboxId,
        pageId: purgePageId,
        name: "Workspace Purge Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      const result = await backfillConnections(tx, { workspaceId })
      expect(result.totalInserted).toBe(2)

      const trialExpiredConnection = await findConnection(tx, {
        workspaceId,
        provider: "messenger",
        sourceId: trialExpiredPageId,
      })
      expect(trialExpiredConnection).toMatchObject({
        status: "disconnected",
        statusReason: "trial_expired",
      })
      expect(trialExpiredConnection?.disconnectedAt?.toISOString()).toBe(
        trialDisconnectedAt.toISOString(),
      )

      const purgeConnection = await findConnection(tx, {
        workspaceId,
        provider: "messenger",
        sourceId: purgePageId,
      })
      expect(purgeConnection).toMatchObject({
        status: "disconnected",
        statusReason: "workspace_purge",
      })
      expect(purgeConnection?.disconnectedAt?.toISOString()).toBe(
        purgeDisconnectedAt.toISOString(),
      )
    })
  })

  test("a disconnected Inbox with no disconnectedAt recorded (legacy data predating that column) falls back to 'now'", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "disconnected-no-timestamp")
      const pageId = `page-no-disconnectedat-${createId()}`
      const { inboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "messenger",
        sourceId: pageId,
        name: "No DisconnectedAt Page",
        status: "disconnected",
        disconnectReason: "manual",
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId,
        inboxId,
        pageId,
        name: "No DisconnectedAt Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      const before = new Date()
      const result = await backfillConnections(tx, { workspaceId })
      const after = new Date()
      expect(result.totalInserted).toBe(1)

      const connection = await findConnection(tx, {
        workspaceId,
        provider: "messenger",
        sourceId: pageId,
      })
      expect(connection?.status).toBe("disconnected")
      expect(connection?.statusReason).toBe("manual")
      expect(connection?.disconnectedAt).not.toBeNull()
      expect(connection?.disconnectedAt?.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      )
      expect(connection?.disconnectedAt?.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      )
    })
  })

  test("an Inbox with no satellite row at all is excluded from channelInboxesMissingConnection and reported only as channelInboxesWithNoSatellite", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "no-satellite")
      await seedInbox(tx, {
        workspaceId,
        channel: "messenger",
        sourceId: `orphaned-page-${createId()}`,
        name: "Orphaned Page",
        status: "disconnected",
        disconnectReason: "manual",
      })
      // No integrationMessengerModel row at all for this Inbox.

      const verifyResult = await backfillConnections(tx, {
        verify: true,
        workspaceId,
        provider: "messenger",
      })
      expect(verifyResult.verify).toMatchObject({
        channelInboxesMissingConnection: 0,
        channelInboxesWithNoSatellite: 1,
      })
    })
  })

  test("verify stays 0 right after a real engine transition the backfill's legacy-column recompute can't fully reproduce", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "engine-transition")

      // Row A: engine marks the connection degraded via
      // `markDegradedByIdentifier` — `Connection.statusReason` becomes a
      // reason with NO legacy `tokenRefreshError` column write at all.
      const degradedPageId = `page-engine-degraded-${createId()}`
      const { inboxId: degradedInboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "messenger",
        sourceId: degradedPageId,
        name: "Engine Degraded Page",
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId,
        inboxId: degradedInboxId,
        pageId: degradedPageId,
        name: "Engine Degraded Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      // Row B: engine marks the connection needs_reauth via a
      // `provider_revoked` reason — wider than the legacy Inbox
      // `token_revoked` value it maps to.
      const revokedPageId = `page-engine-revoked-${createId()}`
      const { inboxId: revokedInboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "messenger",
        sourceId: revokedPageId,
        name: "Engine Revoked Page",
        status: "disconnected",
        disconnectReason: "token_revoked",
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId,
        inboxId: revokedInboxId,
        pageId: revokedPageId,
        name: "Engine Revoked Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      await backfillConnections(tx, { workspaceId })

      // Simulate the live engine's own transition, bypassing the backfill
      // entirely (mirrors what `ConnectionStateService.markDegradedByIdentifier`
      // / `markUnhealthy` actually write).
      await tx
        .update(connectionModel)
        .set({ status: "degraded", statusReason: "refresh_failed" })
        .where(
          and(
            eq(connectionModel.workspaceId, workspaceId),
            eq(connectionModel.sourceId, degradedPageId),
          ),
        )
      await tx
        .update(connectionModel)
        .set({ status: "needs_reauth", statusReason: "provider_revoked" })
        .where(
          and(
            eq(connectionModel.workspaceId, workspaceId),
            eq(connectionModel.sourceId, revokedPageId),
          ),
        )

      const verifyResult = await backfillConnections(tx, {
        verify: true,
        workspaceId,
      })
      expect(verifyResult.verify).toMatchObject({
        channelInboxesMissingConnection: 0,
        statusMismatches: 0,
      })
    })
  })

  test("messenger with a legacy oauth2 auth shape still derives authExpiresAt", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "messenger-oauth2")
      const pageId = `page-oauth2-${createId()}`
      const { inboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "messenger",
        sourceId: pageId,
        name: "OAuth2 Page",
      })
      const expiresAt = "2027-09-01T00:00:00.000Z"
      await tx.insert(integrationMessengerModel).values({
        workspaceId,
        inboxId,
        pageId,
        name: "OAuth2 Page",
        auth: {
          authType: AuthType.oauth2,
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUrl: "https://example.test/callback",
          tokens: { accessToken: "access-token", expiresAt },
        } satisfies AuthValue,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      const result = await backfillConnections(tx, { workspaceId })
      expect(result.totalInserted).toBe(1)

      const connection = await findConnection(tx, {
        workspaceId,
        provider: "messenger",
        sourceId: pageId,
      })
      expect(connection?.status).toBe("connected")
      expect(connection?.authExpiresAt?.toISOString()).toBe(
        new Date(expiresAt).toISOString(),
      )
    })
  })

  test("affectedOwnerIds lists the distinct owners of every workspace touched by a real run, for the operator's quota resync (empty for --verify)", async () => {
    await withRolledBackTransaction(async (tx) => {
      const workspaceId = await seedWorkspace(tx, "affected-owners")
      const pageId = `page-owner-${createId()}`
      const { inboxId } = await seedInbox(tx, {
        workspaceId,
        channel: "messenger",
        sourceId: pageId,
        name: "Owner Page",
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId,
        inboxId,
        pageId,
        name: "Owner Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })

      const ownerId = await workspaceOwnerId(tx, workspaceId)
      const result = await backfillConnections(tx, { workspaceId })
      expect(result.affectedOwnerIds).toEqual([ownerId])

      const verifyResult = await backfillConnections(tx, {
        verify: true,
        workspaceId,
      })
      expect(verifyResult.affectedOwnerIds).toEqual([])

      const dryRunWorkspaceId = await seedWorkspace(tx, "affected-owners-dry")
      const dryRunPageId = `page-owner-dry-${createId()}`
      const { inboxId: dryRunInboxId } = await seedInbox(tx, {
        workspaceId: dryRunWorkspaceId,
        channel: "messenger",
        sourceId: dryRunPageId,
        name: "Dry Run Owner Page",
      })
      await tx.insert(integrationMessengerModel).values({
        workspaceId: dryRunWorkspaceId,
        inboxId: dryRunInboxId,
        pageId: dryRunPageId,
        name: "Dry Run Owner Page",
        auth: secretTextAuth,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })
      const dryRunOwnerId = await workspaceOwnerId(tx, dryRunWorkspaceId)
      const dryRunResult = await backfillConnections(tx, {
        workspaceId: dryRunWorkspaceId,
        dryRun: true,
      })
      expect(dryRunResult.affectedOwnerIds).toEqual([dryRunOwnerId])
    })
  })

  test("verify skips workspaces with scheduledDeletionAt or purgeStartedAt set", async () => {
    await withRolledBackTransaction(async (tx) => {
      const purgingWorkspaceId = await seedWorkspace(tx, "purging")
      await tx
        .update(workspaceModel)
        .set({ purgeStartedAt: new Date() })
        .where(eq(workspaceModel.id, purgingWorkspaceId))

      // An Inbox with no satellite AND no Connection row — would otherwise
      // inflate both the missing-connection and no-satellite counts.
      await seedInbox(tx, {
        workspaceId: purgingWorkspaceId,
        channel: "messenger",
        sourceId: `purging-page-${createId()}`,
        name: "Purging Workspace Page",
        status: "disconnected",
        disconnectReason: "workspace_purge",
      })

      const verifyResult = await backfillConnections(tx, {
        verify: true,
        workspaceId: purgingWorkspaceId,
        provider: "messenger",
      })
      expect(verifyResult.verify).toEqual({
        channelInboxesMissingConnection: 0,
        integrationsMissingConnection: 0,
        statusMismatches: 0,
        channelInboxesWithNoSatellite: 0,
      })
    })
  })
})

describe("parseArgs / printResult — --print-owners CLI flag", () => {
  test("parseArgs does not choke on --print-owners (read directly off argv by `main`, not folded into BackfillConnectionsOptions)", () => {
    expect(() => parseArgs(["--print-owners"])).not.toThrow()
    expect(() => parseArgs(["--print-owners", "--dry-run"])).not.toThrow()
  })

  test("printResult prints affectedOwnerIds only when printOwners is requested", () => {
    const baseResult: BackfillConnectionsResult = {
      dryRun: false,
      counts: [],
      totalInserted: 0,
      conflicts: [],
      sample: [],
      affectedOwnerIds: ["owner-1", "owner-2"],
    }
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
    try {
      printResult(baseResult, { printOwners: false })
      expect(
        logSpy.mock.calls.some((call) => String(call[0]).includes("owner-1")),
      ).toBe(false)

      logSpy.mockClear()
      printResult(baseResult, { printOwners: true })
      expect(
        logSpy.mock.calls.some((call) => String(call[0]).includes("owner-1")),
      ).toBe(true)
    } finally {
      logSpy.mockRestore()
    }
  })
})
