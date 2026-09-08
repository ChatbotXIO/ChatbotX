import "server-only"

import type { CredentialType } from "@chatbotx.io/database/partials"
import type { ConnectActionResultWire } from "../schema"
import {
  connectedOutcome,
  duplicatedOutcome,
  notSelectableOutcome,
  runConnectFollowUps,
  toConnectActionFailure,
} from "./connect-action-outcomes"
import {
  type ConnectSessionRequest,
  type ResolvedConnectSession,
  resolveConnectSession,
} from "./resolve-connect-session"

/**
 * The provider lookup's two outcomes. `unselectableCandidate` carries the
 * display name when the provider knows one (a page the operator can see but
 * cannot administer, say) so the failure outcome still names the thing that
 * was rejected instead of echoing a raw id back at the operator.
 */
export type ConnectCandidateLookup<TCandidate> =
  | { isSelectable: true; candidate: TCandidate }
  | { isSelectable: false; name?: string }

export const selectableCandidate = <TCandidate>(
  candidate: TCandidate,
): ConnectCandidateLookup<TCandidate> => ({ isSelectable: true, candidate })

export const unselectableCandidate = (
  name?: string,
): ConnectCandidateLookup<never> => ({ isSelectable: false, name })

type ConnectPersistResult = {
  integrationId: string
  /**
   * Best-effort work that runs after the row is persisted (branding, logo,
   * user info, tag scan, …). A throw here downgrades the outcome to a
   * warning; it never fails the connect.
   */
  runFollowUps: () => Promise<void>
}

type ConnectSequence<
  TCredential extends CredentialType,
  TCandidate extends { name: string },
> = {
  /** The provider id the operator picked (page id / IG id / phone number). */
  sourceId: string
  session: ConnectSessionRequest<TCredential>
  lookUpCandidate: (args: {
    session: ResolvedConnectSession<TCredential>
    sourceId: string
  }) => Promise<ConnectCandidateLookup<TCandidate>>
  isAlreadyConnected: (sourceId: string) => Promise<boolean>
  /** The provider call + persist sequence — the only channel-specific step. */
  connect: (args: {
    session: ResolvedConnectSession<TCredential>
    candidate: TCandidate
  }) => Promise<ConnectPersistResult>
  logMessages: { followUpFailed: string; failed: string }
}

/**
 * The per-account connect skeleton every channel shares (plan §2.4): resolve
 * the pending-auth session → look the candidate up on the provider → reject
 * duplicates → provider call + persist → best-effort follow-ups → typed
 * outcome. Session-level and item-level failures both come back as a
 * `ConnectActionResult`; this never throws.
 *
 * No channel literal lives here — the cookie, credential type, provider
 * lookup and persist sequence all arrive from the caller, so a fourth channel
 * plugs in without re-copying the skeleton.
 */
export async function runConnectSequence<
  TCredential extends CredentialType,
  TCandidate extends { name: string },
>({
  sourceId,
  session: sessionRequest,
  lookUpCandidate,
  isAlreadyConnected,
  connect,
  logMessages,
}: ConnectSequence<TCredential, TCandidate>): Promise<ConnectActionResultWire> {
  let name = sourceId

  try {
    const session = await resolveConnectSession(sessionRequest)

    const lookup = await lookUpCandidate({ session, sourceId })
    if (!lookup.isSelectable) {
      return notSelectableOutcome({ sourceId, name: lookup.name ?? name })
    }
    name = lookup.candidate.name

    if (await isAlreadyConnected(sourceId)) {
      return duplicatedOutcome({ sourceId, name })
    }

    const { integrationId, runFollowUps } = await connect({
      session,
      candidate: lookup.candidate,
    })

    const warning = await runConnectFollowUps(runFollowUps, {
      message: logMessages.followUpFailed,
    })

    return connectedOutcome({
      sourceId,
      name,
      warning,
      integrationId,
      coexistEligible: true,
    })
  } catch (error) {
    return toConnectActionFailure(error, {
      sourceId,
      name,
      log: logMessages.failed,
    })
  }
}
