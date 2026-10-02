import "server-only"

import { instagramIntegrationService } from "@chatbotx.io/business"
import { connectionService } from "@chatbotx.io/connections"
import type { CredentialType } from "@chatbotx.io/database/partials"
import {
  connectedOutcome,
  duplicatedOutcome,
  notSelectableOutcome,
  runConnectFollowUps,
  toConnectActionFailure,
} from "@/features/channel-connect/lib/connect-action-outcomes"
import type { ResolvedConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import { resolveConnectSession } from "@/features/channel-connect/lib/resolve-connect-session"
import type { ConnectActionResultWire } from "@/features/channel-connect/schema"

type InstagramIntegrationRow = Awaited<
  ReturnType<typeof instagramIntegrationService.findByInboxId>
>

/**
 * Shared core behind both `connectInstagramAccount` (Instagram Business
 * Login, `connect-account.ts`) and `connectInstagramAccountViaFacebook`
 * (`connect-account-facebook.ts`) — the two were ~95% identical, differing
 * only in which OAuth credential they resolve and which `IntegrationDefinition`
 * (and Meta app) their post-connect branding follow-up runs against. Session
 * resolution, the selectable/already-connected guard, the `connectTargets`
 * call, and outcome shaping are identical, so that part lives here once;
 * each thin wrapper owns only its own `run*FollowUps` closure (which needs
 * its own integration module import) and passes it in.
 */
export async function connectInstagramCandidate<
  T extends CredentialType,
>(props: {
  userId: string
  sessionId: string
  igId: string
  credentialType: T
  runFollowUps: (input: {
    session: ResolvedConnectSession<T>
    instagramRow: InstagramIntegrationRow
  }) => Promise<void>
  /** Toast shown when the connect itself succeeded but the follow-up (branding/logo) failed. */
  followUpFailureMessage: string
  /** Server log message when the whole connect attempt throws. */
  connectFailureLog: string
}): Promise<ConnectActionResultWire> {
  const {
    userId,
    sessionId,
    igId,
    credentialType,
    runFollowUps,
    followUpFailureMessage,
    connectFailureLog,
  } = props
  let name = igId

  try {
    const session = await resolveConnectSession({
      userId,
      sessionId,
      credentialType,
      brandingChannel: "instagram",
    })

    const target = session.session.targets.find((t) => t.id === igId)
    if (!target) {
      return notSelectableOutcome({ sourceId: igId, name })
    }
    name = target.name

    if (!target.selectable) {
      return target.alreadyConnected
        ? duplicatedOutcome({ sourceId: igId, name })
        : notSelectableOutcome({ sourceId: igId, name })
    }

    const result = await connectionService.connectTargets({
      sessionId,
      workspaceId: session.workspace.id,
      targetIds: [igId],
      actorUserId: userId,
    })
    const outcome = result.outcomes[0]
    const connection = result.connections[0]

    if (!(outcome && outcome.status === "connected" && connection)) {
      return {
        kind: "outcome",
        outcome: {
          sourceId: igId,
          name,
          status: outcome?.status ?? "failed",
          reason: outcome?.reason ?? "unknown",
          detail: outcome?.detail,
          coexistEligible: false,
        },
      }
    }

    const instagramRow = await instagramIntegrationService.findByInboxId(
      connection.inboxId as string,
    )

    const warning = await runConnectFollowUps(
      () => runFollowUps({ session, instagramRow }),
      { message: followUpFailureMessage },
    )

    return connectedOutcome({
      sourceId: igId,
      name,
      warning,
      integrationId: instagramRow.id,
      coexistEligible: true,
    })
  } catch (error) {
    return toConnectActionFailure(error, {
      sourceId: igId,
      name,
      log: connectFailureLog,
    })
  }
}
