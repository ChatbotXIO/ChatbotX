import "server-only"

import { connectionService } from "@chatbotx.io/connections"
import type {
  ChannelType,
  CredentialType,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import { logger } from "@/lib/log"
import type { ConnectActionResultWire } from "../schema"
import {
  connectedOutcome,
  duplicatedOutcome,
  notSelectableOutcome,
  runConnectFollowUps,
  toConnectActionFailure,
} from "./connect-action-outcomes"
import type { ResolvedConnectSession } from "./resolve-connect-session"
import { resolveConnectSession } from "./resolve-connect-session"

/**
 * Generic core behind every per-account connect action (Messenger's
 * `connectMessengerPage`, Instagram's `connectInstagramAccount` and
 * `connectInstagramAccountViaFacebook`, and any future channel the picker
 * grows) — they were ~95% identical, differing only in which credential they
 * resolve, which row they look up post-connect, and which post-connect
 * follow-up they run. Session resolution, the selectable/already-connected
 * guard, the `connectTargets` call, the row lookup, and outcome shaping are
 * identical, so that part lives here once; each caller owns only its own
 * `findRow`/`runFollowUps` closures.
 *
 * `connection.inboxId` is guarded explicitly rather than cast: `connectTargets`
 * already succeeded by the time this runs — the channel IS connected — so a
 * missing `inboxId` or a `findRow` failure must never downgrade the outcome
 * to `failed`/`unknown`; it only disables coexist eligibility and skips the
 * row-dependent follow-up, logged at `error` so it's never silently lost.
 */
export async function connectSessionCandidate<
  T extends CredentialType,
  TRow extends { id: string },
>(props: {
  userId: string
  sessionId: string
  targetId: string
  provider: IntegrationType
  credentialType: T
  brandingChannel: ChannelType
  findRow: (inboxId: string) => Promise<TRow>
  runFollowUps: (input: {
    session: ResolvedConnectSession
    row: TRow
  }) => Promise<void>
  /** Toast shown when the connect itself succeeded but the follow-up (branding/logo) failed. */
  followUpFailureMessage: string
  /** Server log message when the whole connect attempt throws. */
  connectFailureLog: string
}): Promise<ConnectActionResultWire> {
  const {
    userId,
    sessionId,
    targetId,
    provider,
    credentialType,
    brandingChannel,
    findRow,
    runFollowUps,
    followUpFailureMessage,
    connectFailureLog,
  } = props
  let name = targetId

  try {
    const session = await resolveConnectSession({
      userId,
      sessionId,
      credentialType,
      expectedProvider: provider,
      brandingChannel,
    })

    const target = session.session.targets.find((t) => t.id === targetId)
    if (!target) {
      return notSelectableOutcome({ sourceId: targetId, name })
    }
    name = target.name

    if (!target.selectable) {
      return target.alreadyConnected
        ? duplicatedOutcome({ sourceId: targetId, name })
        : notSelectableOutcome({ sourceId: targetId, name })
    }

    const result = await connectionService.connectTargets({
      sessionId,
      workspaceId: session.workspace.id,
      targetIds: [targetId],
      actorUserId: userId,
    })
    const outcome = result.outcomes[0]
    const connection = result.connections[0]

    if (!(outcome && outcome.status === "connected" && connection)) {
      logger.error(
        { sessionId, targetId, outcome },
        `${connectFailureLog}: connectTargets returned no outcome or a failed outcome for a selectable target`,
      )
      return {
        kind: "outcome",
        outcome: {
          sourceId: targetId,
          name,
          status: outcome?.status ?? "failed",
          reason: outcome?.reason ?? "unknown",
          detail: outcome?.detail,
          coexistEligible: false,
        },
      }
    }

    let row: TRow | undefined
    if (connection.inboxId) {
      try {
        row = await findRow(connection.inboxId)
      } catch (err) {
        logger.error(
          { err, inboxId: connection.inboxId, connectionId: connection.id },
          `${connectFailureLog}: failed to look up the integration row after connect`,
        )
      }
    } else {
      logger.error(
        { connectionId: connection.id, targetId },
        `${connectFailureLog}: connected target has no inboxId`,
      )
    }

    const warning = row
      ? await runConnectFollowUps(() => runFollowUps({ session, row }), {
          message: followUpFailureMessage,
        })
      : "followUpFailed"

    return connectedOutcome({
      sourceId: targetId,
      name,
      warning,
      integrationId: row?.id,
      coexistEligible: Boolean(row),
    })
  } catch (error) {
    return toConnectActionFailure(error, {
      sourceId: targetId,
      name,
      log: connectFailureLog,
    })
  }
}
