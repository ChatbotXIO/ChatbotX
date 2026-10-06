import { connectSessionService } from "@chatbotx.io/business/connect-session"
import {
  isActiveConnectionStatus,
  resolveOwnerId,
} from "@chatbotx.io/business/connection"
import {
  ChatbotXException,
  connectionAlreadyConnectedException,
  connectSessionExpiredException,
  notFoundException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { isUniqueViolationError } from "@chatbotx.io/database/client"
import type {
  ConnectSessionOutcome,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import type {
  ConnectionModel,
  ConnectSessionModel,
} from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import type { ConnectionCandidate } from "@chatbotx.io/sdk"
import { ConnectionProviderRejectedError } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  connectAndPersist,
  encryptedCandidatesSchema,
  resolveAdapter,
  toConnectionProviderError,
} from "./internal"
import { logger } from "./logger"

/** Records a session's terminal failure best-effort; a persistence failure here never masks the original error. */
export const failSession = async (
  session: Pick<ConnectSessionModel, "id" | "workspaceId" | "provider">,
  errorCode: Parameters<typeof connectSessionService.fail>[0]["errorCode"],
  statuses?: Parameters<typeof connectSessionService.fail>[0]["statuses"],
): Promise<void> => {
  try {
    await connectSessionService.fail({
      id: session.id,
      workspaceId: session.workspaceId,
      errorCode,
      ...(statuses ? { statuses } : {}),
    })
  } catch (err) {
    logger.error(
      { err, sessionId: session.id, provider: session.provider, errorCode },
      "connection OAuth: failed to record terminal connect-session state",
    )
  }
}

const toFailureOutcome = (input: {
  err: unknown
  provider: IntegrationType
  targetId: string
}): ConnectSessionOutcome => {
  if (
    input.err instanceof ChatbotXException &&
    input.err.code === "channelLimitReached"
  ) {
    return {
      targetId: input.targetId,
      status: "limitReached",
      reason: "workspaceLimit",
    }
  }
  if (
    input.err instanceof ChatbotXException &&
    input.err.code === "connectionAlreadyConnected"
  ) {
    return {
      targetId: input.targetId,
      status: "duplicated",
      reason: "alreadyConnected",
    }
  }
  const providerError = toConnectionProviderError(input.err)
  if (providerError instanceof ConnectionProviderRejectedError) {
    logger.warn(
      {
        err: providerError,
        targetId: input.targetId,
        provider: input.provider,
      },
      "connectTargets: candidate connect was rejected by the provider",
    )
    return {
      targetId: input.targetId,
      status: "failed",
      reason: "providerRejected",
      detail: toPublicErrorMessage(providerError, "Connect failed"),
    }
  }
  logger.error(
    { err: input.err, targetId: input.targetId, provider: input.provider },
    "connectTargets: candidate connect failed internally",
  )
  return {
    targetId: input.targetId,
    status: "failed",
    reason: "internalError",
    detail: "Connect failed",
  }
}

/**
 * Connects one already-authorized `ConnectionCandidate` — the per-target
 * unit of work behind `connectTargets`. Mirrors `connectFromCredentials`'s
 * revive-or-insert transaction body via the shared `connectAndPersist`.
 *
 * Scope: a bare connect. Per-provider UI conveniences such as Messenger
 * branding, workspace-logo push, and tag-sync enqueue are not replicated
 * here; they remain owned by their app-layer actions.
 */
const connectCandidate = async (input: {
  adapter: ReturnType<typeof resolveAdapter>
  provider: IntegrationType
  workspaceId: string
  candidate: ConnectionCandidate
  ownerId: string | undefined
  actorUserId?: string | null
}): Promise<ConnectionModel> => {
  const { adapter } = input
  const { provider } = adapter
  const auth = input.candidate.auth
  const descriptor = provider.describe(auth)
  const extraConfig = provider.candidateToConfig?.(auth) ?? {}

  const existing = await connectionRepository.findByProviderSourceId({
    workspaceId: input.workspaceId,
    provider: input.provider,
    sourceId: descriptor.sourceId,
  })
  if (existing && isActiveConnectionStatus(existing.status)) {
    throw connectionAlreadyConnectedException()
  }

  try {
    return await connectAndPersist({
      adapter,
      provider: input.provider,
      workspaceId: input.workspaceId,
      auth,
      descriptor,
      extraConfig,
      existing,
      ownerId: input.ownerId,
      actorUserId: input.actorUserId,
      missingOwnerError: notFoundException("Workspace owner not found"),
    })
  } catch (err) {
    // `upsertConnectionRow` already converts its own `Connection` unique
    // violation into `connectionAlreadyConnectedException`. Any raw unique
    // violation reaching here comes from the satellite/Inbox insert inside
    // `saveOrInsertSatellite` (e.g. a page/account already bound to another
    // row) and must report the same "duplicated" outcome instead of falling
    // through `toFailureOutcome` to a generic internal error.
    if (isUniqueViolationError(err)) {
      throw connectionAlreadyConnectedException()
    }
    throw err
  }
}

/**
 * Finishes an `awaiting_selection` connect session by leasing each requested
 * target. A failed lease first checks whether another request committed an
 * active Connection; otherwise it reports the in-progress attempt without
 * persisting a retryable outcome, so the current owner can finish normally.
 */
export const connectTargets = async (input: {
  sessionId: string
  workspaceId: string
  targetIds: string[]
  actorUserId?: string | null
}): Promise<{
  session: ConnectSessionModel
  connections: ConnectionModel[]
  outcomes: ConnectSessionOutcome[]
}> => {
  const session = await connectSessionService.findByIdForWorkspace({
    id: input.sessionId,
    workspaceId: input.workspaceId,
  })
  if (!session) {
    throw notFoundException("Connect session not found")
  }
  if (session.status !== "awaiting_selection" || !session.encryptedAuth) {
    throw connectSessionExpiredException(
      "This connect session is not awaiting target selection.",
    )
  }

  const candidates = await encryptUtils.decryptObject(
    session.encryptedAuth,
    encryptedCandidatesSchema,
    `connect-session:${session.id}`,
  )
  const candidateBySourceId = new Map(
    candidates.map((candidate) => [candidate.sourceId, candidate]),
  )
  const targetById = new Map(
    session.targets.map((target) => [target.id, target]),
  )

  const outcomes: ConnectSessionOutcome[] = []
  const connections: ConnectionModel[] = []
  let updatedSession = session
  let flowError: unknown
  let flowFailed = false
  const adapter = resolveAdapter(session.provider)
  const ownerId = await resolveOwnerId({
    kind: adapter.provider.kind,
    workspaceId: input.workspaceId,
  })

  try {
    for (const targetId of input.targetIds) {
      const target = targetById.get(targetId)
      const candidate = candidateBySourceId.get(targetId)
      if (!(target && candidate)) {
        outcomes.push({ targetId, status: "failed", reason: "unknown" })
        continue
      }
      if (!target.selectable) {
        outcomes.push(
          target.alreadyConnected
            ? { targetId, status: "duplicated", reason: "alreadyConnected" }
            : { targetId, status: "failed", reason: "notSelectable" },
        )
        continue
      }

      const claimToken = createId()
      const claimed = await connectSessionService.claimTarget({
        id: session.id,
        workspaceId: session.workspaceId,
        targetId,
        ownerToken: claimToken,
      })
      if (!claimed) {
        const existing = await connectionRepository.findByProviderSourceId({
          workspaceId: input.workspaceId,
          provider: session.provider,
          sourceId: candidate.sourceId,
        })
        if (existing && isActiveConnectionStatus(existing.status)) {
          outcomes.push({
            targetId,
            status: "duplicated",
            reason: "alreadyConnected",
          })
          continue
        }
        outcomes.push({ targetId, status: "failed", reason: "inProgress" })
        continue
      }

      try {
        const connection = await connectCandidate({
          adapter,
          provider: session.provider,
          workspaceId: input.workspaceId,
          candidate,
          ownerId,
          actorUserId: input.actorUserId,
        })
        connections.push(connection)
        outcomes.push(
          connection.status === "degraded"
            ? {
                targetId,
                status: "connected",
                connectionId: connection.id,
                detail:
                  'Connected, but the provider webhook subscription failed — the matching entry in `connections[]` shows `status: "degraded"`; retry from the connection\'s settings.',
              }
            : { targetId, status: "connected", connectionId: connection.id },
        )
      } catch (err) {
        try {
          await connectSessionService.releaseTarget({
            id: session.id,
            workspaceId: session.workspaceId,
            targetId,
            ownerToken: claimToken,
          })
        } catch (releaseErr) {
          logger.error(
            { err: releaseErr, targetId, provider: session.provider },
            "connectTargets: failed to release a target claim after a failed connect attempt",
          )
        }
        outcomes.push(
          toFailureOutcome({
            err,
            provider: session.provider,
            targetId,
          }),
        )
      }
    }
  } catch (err) {
    flowError = err
    flowFailed = true
  }

  const connectionIds = connections.map((connection) => connection.id)
  const durableOutcomes = outcomes.filter(
    (outcome) => outcome.reason !== "inProgress",
  )
  try {
    updatedSession = await connectSessionService.recordResults({
      id: session.id,
      workspaceId: session.workspaceId,
      results: durableOutcomes,
      resultConnectionIds: connectionIds,
    })
  } catch (err) {
    logger.error(
      { err, sessionId: session.id, connectionIds },
      "connectTargets: failed to record collected results",
    )
    if (!flowFailed) {
      throw err
    }
  }
  if (flowFailed) {
    throw flowError
  }

  return { session: updatedSession, connections, outcomes }
}
