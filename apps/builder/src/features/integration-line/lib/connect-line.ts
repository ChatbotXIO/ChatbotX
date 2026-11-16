import {
  lineIntegrationService,
  tenantService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  ChatbotXException,
  channelHiddenException,
  connectionCredentialsRejectedException,
  connectionProviderUnavailableException,
} from "@chatbotx.io/business/errors"
import type { UserModel } from "@chatbotx.io/database/types"
import type { LineAuthValue } from "@chatbotx.io/integration-line"
import { AuthException, SdkException } from "@chatbotx.io/sdk"
import { resolveConnectOwnerId } from "@/features/channel-connect/lib/resolve-connect-owner"
import { assertChannelCreatable } from "@/features/connections/lib/connect-flow"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"

export type ConnectLineInput = {
  /** Omitted → a new workspace is created for the channel (Telegram parity). */
  workspaceId?: string
  /**
   * The signed-in user (UI). `null` for a workspace-token call: the token
   * already authenticated the workspace, so `workspaceId` is required and
   * the workspace owner acts as the creator.
   */
  user: UserModel | null
  channelId: string
  channelSecret: string
}

export type ConnectLineResult = {
  workspaceId: string
  integrationId: string
  inboxId: string
  /** The bot's display name, stored as the channel name. */
  name: string
  basicId: string
  webhook: {
    url: string
    /** D16: a different, foreign endpoint we overwrote — the UI shows a notice. */
    previousWebhookUrl: string | null
    /** LINE console "Use webhook" toggle (`GET webhook/endpoint` `.active`). */
    active: boolean
    testOk: boolean
    testReason?: string
  }
}

export const buildLineWebhookUrl = (channelId: string): string =>
  buildBrokerCallbackUrl(
    `/integrations/line/webhook?channelId=${encodeURIComponent(channelId)}`,
  )

export type LineWebhookCheck = {
  active: boolean
  testOk: boolean
  testReason?: string
}

const webhookCheckFailed = (err: unknown): LineWebhookCheck => ({
  active: false,
  testOk: false,
  testReason: err instanceof Error ? err.message : "Webhook test failed",
})

/**
 * LINE's webhook test plus the "Use webhook" toggle. Must run AFTER the
 * channel row is committed (LINE's test request hits our route, which looks
 * the row up). Never throws (D18).
 */
export async function checkLineWebhook(
  auth: LineAuthValue,
): Promise<LineWebhookCheck> {
  try {
    const result = await integrations.line.runAction("testWebhook", { auth })
    return {
      active: result.active,
      testOk: result.success,
      testReason: result.success ? undefined : result.reason,
    }
  } catch (err) {
    logger.warn({ err }, "LINE webhook check failed")
    return webhookCheckFailed(err)
  }
}

const HTTP_CLIENT_ERROR_MIN = 400
const HTTP_SERVER_ERROR_MIN = 500
const HTTP_TOO_MANY_REQUESTS = 429
const CREDENTIAL_STATUSES = new Set([400, 401, 403])

type ConnectStage = "credentials" | "webhook" | "other"

/** Network failures and timeouts (ky `TimeoutError`, fetch `TypeError`). */
const isTransportError = (error: unknown): boolean =>
  error instanceof TypeError ||
  (error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "NetworkError"))

/** LINE rejected the webhook endpoint (e.g. the broker URL), not the credentials. */
const lineWebhookRejectedException = (detail: string) =>
  new ChatbotXException(
    `LINE rejected the webhook URL: ${detail}`,
    "lineWebhookRejected",
    400,
  )

/** Raw LINE / HTTP failures become typed public errors (Telegram parity). */
const toTypedConnectError = (error: unknown, stage: ConnectStage): unknown => {
  if (error instanceof ChatbotXException) {
    return error
  }
  if (isTransportError(error)) {
    logger.warn({ err: error }, "LINE connect: transport failure")
    return connectionProviderUnavailableException(502)
  }
  if (error instanceof SdkException) {
    const status = error.httpStatusCode ?? 0
    if (status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR_MIN) {
      logger.warn({ err: error }, "LINE connect: provider unavailable")
      return connectionProviderUnavailableException(502)
    }
    if (stage === "credentials" && CREDENTIAL_STATUSES.has(status)) {
      return connectionCredentialsRejectedException(
        "Invalid LINE Channel ID or Channel secret.",
      )
    }
    if (stage === "webhook" && status >= HTTP_CLIENT_ERROR_MIN) {
      logger.warn({ err: error }, "LINE connect: webhook endpoint rejected")
      return lineWebhookRejectedException(error.message)
    }
  }
  logger.error({ err: error }, "Failed to connect LINE channel")
  return new ChatbotXException(
    "Failed to connect LINE. Please check the Channel ID and Channel secret and try again.",
  )
}

/**
 * Tenant channel-visibility gate (invariant 18), same semantics as
 * `POST /v1/connections`' `assertChannelCreatable`: an already-connected
 * channel stays allowed (grandfathered into `visibleChannels`).
 */
const assertLineCreatable = async (props: {
  workspaceId: string | undefined
  ownerId: string
}): Promise<void> => {
  const { workspaceId, ownerId } = props
  if (workspaceId) {
    await assertChannelCreatable(workspaceId, "line")
    return
  }
  // New workspace: the owner is the creating user; no connected channels yet.
  const creatable = await tenantService.resolveVisibleChannels(ownerId)
  if (!creatable.includes("line")) {
    throw channelHiddenException("line")
  }
}

/**
 * A workspace-token call (no `user`) acts as the workspace owner; a signed-in
 * user goes through the shared access + quota gate.
 */
const resolveOwnerId = async (props: {
  workspaceId: string | undefined
  user: UserModel | null
}): Promise<string> => {
  const { workspaceId, user } = props
  if (user) {
    return resolveConnectOwnerId({ workspaceId, user })
  }
  if (!workspaceId) {
    throw new ChatbotXException("Workspace not found", "notFound", 404)
  }
  const workspace = await workspaceService.findOrFail({
    where: { id: workspaceId },
  })
  return workspace.ownerId
}

/** Runs one connect step, mapping its failure to a typed public error. */
const inStage = async <T>(
  stage: ConnectStage,
  run: () => Promise<T>,
): Promise<T> => {
  try {
    return await run()
  } catch (error) {
    throw toTypedConnectError(error, stage)
  }
}

/**
 * The single LINE connect operation, shared by the public API and the
 * settings UI action. Validates the credentials with LINE, persists the
 * channel, points the LINE webhook at us and runs the webhook test. The
 * test result never fails the connect (D18).
 */
export function connectLine(
  input: ConnectLineInput,
): Promise<ConnectLineResult> {
  return inStage("other", () => connectLineSteps(input))
}

async function connectLineSteps(
  input: ConnectLineInput,
): Promise<ConnectLineResult> {
  const { user, workspaceId, channelId, channelSecret } = input

  const integration = integrations.line
  const ownerId = await resolveOwnerId({ workspaceId, user })
  await assertLineCreatable({ workspaceId, ownerId })
  const { auth, bot } = await inStage("credentials", () =>
    integration.runAction("connect", { channelId, channelSecret }),
  )

  const url = buildLineWebhookUrl(channelId)
  let registered: { previousWebhookUrl: string | null } | undefined

  const result = await lineIntegrationService.connect({
    workspaceId,
    ownerId,
    createdBy: user?.id ?? ownerId,
    channelId,
    auth,
    bot,
    onConnected: async () => {
      // Endpoint GET/PUT only; the webhook test runs after commit below.
      registered = await inStage("webhook", () =>
        integration.runAction("registerWebhook", { auth, webhookUrl: url }),
      )
    },
  })

  // The row is committed now, so LINE's test request can resolve the channel.
  const check = await checkLineWebhook(auth)
  const webhook: ConnectLineResult["webhook"] = {
    url,
    previousWebhookUrl: registered?.previousWebhookUrl ?? null,
    ...check,
  }

  if (webhook.previousWebhookUrl) {
    logger.info(
      {
        workspaceId: result.workspaceId,
        channelId,
        previousWebhookUrl: webhook.previousWebhookUrl,
      },
      "LINE connect overwrote an existing webhook endpoint",
    )
  }

  if (result.createdWorkspace) {
    await auditService.record({
      userId: user?.id ?? ownerId,
      workspaceId: result.workspaceId,
      action: "create",
      detail: `created the workspace (#${result.workspaceId})`,
    })
  }

  if (result.wasCreated) {
    await auditService.record({
      userId: user?.id ?? ownerId,
      workspaceId: result.workspaceId,
      action: "connect",
      detail: `connected a new LINE channel (#${result.integrationId})`,
    })
  }

  return {
    workspaceId: result.workspaceId,
    integrationId: result.integrationId,
    inboxId: result.inboxId,
    name: bot.displayName,
    basicId: bot.basicId,
    webhook,
  }
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/**
 * `runAction` without a ctx bypasses the SDK's refresh, so refresh a stale
 * short-lived token here (and persist it) before calling LINE.
 */
export async function ensureFreshLineAuth(row: {
  id: string
  workspaceId: string
  auth: unknown
}): Promise<LineAuthValue> {
  const auth = row.auth as LineAuthValue
  const expiresAt = auth.tokens?.expiresAt
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN
  if (
    Number.isNaN(expiresAtMs) ||
    expiresAtMs - Date.now() >= TOKEN_REFRESH_BUFFER_MS
  ) {
    return auth
  }
  const refreshed = await integrations.line.refreshAuth?.({ auth })
  if (!refreshed) {
    return auth
  }
  await lineIntegrationService.updateAuth({
    id: row.id,
    workspaceId: row.workspaceId,
    auth: refreshed as Record<string, unknown>,
  })
  return refreshed
}

/**
 * Webhook check for an already-connected channel: refreshes a stale token
 * first, and never throws. A refresh rejected by LINE (credentials reset or
 * revoked) marks the channel offline, like the worker's refresh job.
 */
export async function checkConnectedLineWebhook(row: {
  id: string
  workspaceId: string
  auth: unknown
}): Promise<LineWebhookCheck> {
  try {
    return await checkLineWebhook(await ensureFreshLineAuth(row))
  } catch (err) {
    logger.warn({ err }, "LINE token refresh before webhook test failed")
    if (err instanceof AuthException) {
      await lineIntegrationService
        .markTokenRefreshError({
          id: row.id,
          workspaceId: row.workspaceId,
          error: err.message,
          isRevoked: true,
        })
        .catch((markErr: unknown) =>
          logger.warn({ err: markErr }, "LINE mark offline failed"),
        )
    }
    return webhookCheckFailed(err)
  }
}
