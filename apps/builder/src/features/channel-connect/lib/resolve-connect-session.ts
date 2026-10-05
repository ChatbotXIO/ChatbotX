import "server-only"

import {
  platformCredentialService,
  resolveTenantSettings,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import {
  connectSessionExpiredException,
  credentialMissingException,
  notWorkspaceMemberException,
} from "@chatbotx.io/business/errors"
import type {
  ChannelType,
  CredentialType,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import type {
  ConnectSessionModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import {
  checkWorkspaceOwnerAccess,
  workspaceAccessDenialException,
} from "@/lib/workspace/authorize-workspace-access"

// Not exported — only used internally to build `ResolvedConnectSession` below.
type ConnectBrandingMenuEntry = {
  label: string
  type: "url"
  url: string
}

export type ConnectSessionRequest<T extends CredentialType> = {
  userId: string
  sessionId: string
  credentialType: T
  /** The provider this caller expects the session to belong to — a mismatch is treated the same as a missing session, see below. */
  expectedProvider: IntegrationType
  brandingChannel: ChannelType
}

export type ResolvedConnectSession = {
  session: ConnectSessionModel
  workspace: WorkspaceModel
  brandingMenuEntry: ConnectBrandingMenuEntry
}

/** What `resolveConnectSessionCore`/`resolveConnectSessionForSelect` resolve — session + workspace, with no credential/branding lookup. */
export type ResolvedConnectSessionBinding = {
  session: ConnectSessionModel
  workspace: WorkspaceModel
}

/**
 * Session row + workspace binding shared by both the full per-account
 * connect resolve below and the lighter `resolveConnectSessionForSelect` —
 * a select/picker page needs none of the credential/branding lookups below,
 * only confirmation the session is this user's, still selectable, and the
 * workspace is in good standing.
 *
 * `session.actorUserId`/`status`/`purpose`/`provider` are checked against
 * the caller's expectations up front, all folded into the same
 * `connectSessionExpiredException` a missing/stale session would throw — a
 * mismatch here (another user's session, the wrong provider, a session
 * already completed/failed/cancelled) must read identically to "this
 * session doesn't exist" rather than leaking that someone else's session
 * is in a particular state. The `ConnectSession` id is NOT a capability
 * token by itself (see `ConnectSessionService.findById`'s own doc) — this
 * binding check is what makes a workspace-unscoped lookup by id safe.
 */
async function resolveConnectSessionCore(props: {
  userId: string
  sessionId: string
  expectedProvider: IntegrationType
}): Promise<ResolvedConnectSessionBinding> {
  const session = await connectSessionService.findById(props.sessionId)
  if (!session) {
    throw connectSessionExpiredException(
      "Your connect session expired. Please start again.",
    )
  }
  if (
    session.actorUserId !== props.userId ||
    session.status !== "awaiting_selection" ||
    session.purpose !== "connect" ||
    session.provider !== props.expectedProvider
  ) {
    throw connectSessionExpiredException(
      `Your connect session expired. Please start again. (status=${session.status}, provider=${session.provider}${session.errorCode ? `, errorCode=${session.errorCode}` : ""})`,
    )
  }

  // `find` (not `findById`) — a vanished workspace must read the same as
  // "not a member of it" (a session error), not fall through to a generic
  // item-level `failed/unknown` outcome from an uncaught `notFoundException`.
  // Independent of each other (both keyed off `session.workspaceId` alone),
  // so they run concurrently rather than one after the other.
  const [workspace, isMember] = await Promise.all([
    workspaceService.find({ where: { id: session.workspaceId } }),
    workspaceMemberService.isMember({
      workspaceId: session.workspaceId,
      userId: props.userId,
    }),
  ])
  if (!workspace) {
    throw notWorkspaceMemberException()
  }
  if (!isMember) {
    throw notWorkspaceMemberException()
  }

  const denialReason = await checkWorkspaceOwnerAccess({
    ownerId: workspace.ownerId,
  })
  if (denialReason) {
    throw workspaceAccessDenialException(denialReason)
  }

  return { session, workspace }
}

/**
 * Lighter resolve for the three `channels/<channel>/select/page.tsx` Server
 * Components: they only read `session.targets` and `workspace.id`, never
 * the credential or branding menu entry — skipping those two network calls
 * shaves real latency off a page load that is otherwise pure read.
 */
export function resolveConnectSessionForSelect(props: {
  userId: string
  sessionId: string
  expectedProvider: IntegrationType
}): Promise<ResolvedConnectSessionBinding> {
  return resolveConnectSessionCore(props)
}

/**
 * Shared per-account connect steps: `ConnectSession` row (bound to this
 * user/provider by `resolveConnectSessionCore` above) → workspace +
 * membership → owner quota/trial gate → platform credential + branding menu
 * entry. Every per-account connect action (Messenger, Instagram direct,
 * Instagram-via-Facebook) starts here instead of re-implementing the same
 * checks.
 *
 * Superseded the pending-auth-cookie version of this module: the session row
 * already carries `workspaceId`/`provider`/`targets` (computed once by
 * `ConnectionService.completeAuthorization`/`listAndAttachCandidates`), so
 * there is no cookie to read and no live re-fetch of the provider's
 * page/account list — `session.targets` is that list.
 *
 * Every failure throws one of the session-level exceptions
 * (`connectSessionExpiredException`, `notWorkspaceMemberException`,
 * `workspaceAccessDenialException`, `credentialMissingException`) — callers
 * catch once and map through `toConnectSessionError`
 * (`@chatbotx.io/business/inbox/connect-outcome`), exactly like every other
 * step in the action.
 *
 * The channel is passed in as plain data (`credentialType`/`brandingChannel`)
 * — this module never hard-codes a channel literal, so it stays reusable
 * across every picker. The resolved credential/`platformOwnerId`/`appUrl`
 * are deliberately NOT part of `ResolvedConnectSession` — no connect action
 * reads them, only `credentialMissingException` for a missing one and the
 * already-built `brandingMenuEntry.url` for the app URL, so this only
 * checks existence and discards the values.
 */
export async function resolveConnectSession<T extends CredentialType>(
  props: ConnectSessionRequest<T>,
): Promise<ResolvedConnectSession> {
  const { session, workspace } = await resolveConnectSessionCore(props)

  const platformOwnerId = session.platformOwnerId
  if (!platformOwnerId) {
    throw credentialMissingException(
      "App credentials are not configured for this workspace.",
    )
  }

  // Independent of each other — both keyed off `platformOwnerId`/
  // `workspace.id` alone — so they run concurrently.
  const [credential, { appUrl }] = await Promise.all([
    platformCredentialService.resolveForOwner({
      ownerId: platformOwnerId,
      type: props.credentialType,
    }),
    resolveTenantSettings({ workspaceId: workspace.id }),
  ])
  if (!credential) {
    throw credentialMissingException(
      "App credentials are not configured for this workspace.",
    )
  }

  const brandingMenuEntry: ConnectBrandingMenuEntry = {
    label: BRANDING_TITLE,
    type: "url",
    url: getBrandingUrl(props.brandingChannel, appUrl),
  }

  return {
    session,
    workspace,
    brandingMenuEntry,
  }
}
