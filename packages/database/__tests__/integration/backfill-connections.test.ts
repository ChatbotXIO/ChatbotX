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
import { describe, expect, test } from "vitest"
import {
  backfillConnections,
  type Candidate,
} from "../../scripts/backfill-connections"
import { type DatabaseClient, db } from "../../src/client"
import type { ChannelType, InboxDisconnectReason } from "../../src/partials"
import {
  connectionModel,
  inboxModel,
  integrationClaudeModel,
  integrationFacebookAdsModel,
  integrationGoogleCalendarModel,
  integrationGoogleSheetsModel,
  integrationMessengerModel,
  integrationModel,
  integrationTelegramModel,
  integrationTiktokModel,
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
      expect(
        firstRun.conflicts.some(
          (conflict) =>
            conflict.kind === "legacy_needs_reauth_heuristic" &&
            conflict.provider === "tiktok",
        ),
      ).toBe(true)

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
})
