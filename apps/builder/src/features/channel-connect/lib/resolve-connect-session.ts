import "server-only"

import {
  platformCredentialService,
  resolveTenantSettings,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import {
  connectSessionExpiredException,
  credentialMissingException,
  notWorkspaceMemberException,
} from "@chatbotx.io/business/errors"
import type {
  ChannelType,
  CredentialType,
} from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import {
  BRANDING_TITLE,
  getBrandingUrl,
} from "@/features/integration-webchat/lib"
import {
  type FacebookAuthCallback,
  readPendingAuth,
} from "@/lib/facebook-pending-auth"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import {
  checkWorkspaceOwnerAccess,
  workspaceAccessDenialException,
} from "@/lib/workspace/authorize-workspace-access"

/**
 * `platformCredentialService.resolveForOwner`'s success type isn't exported
 * by `packages/business` — derived here instead of widening every caller to
 * `unknown`. `NonNullable` drops the `undefined` branch: this module always
 * turns a missing credential into `credentialMissingException()` before
 * returning, so callers never see it.
 */
type ConnectCredential<T extends CredentialType> = NonNullable<
  Awaited<ReturnType<typeof platformCredentialService.resolveForOwner<T>>>
>

// Not exported — only used internally to build `ResolvedConnectSession` below.
type ConnectBrandingMenuEntry = {
  label: string
  type: "url"
  url: string
}

export type ConnectSessionRequest<T extends CredentialType> = {
  userId: string
  cookieName: string
  credentialType: T
  brandingChannel: ChannelType
}

export type ResolvedConnectSession<T extends CredentialType> = {
  pendingAuth: FacebookAuthCallback
  workspace: WorkspaceModel
  platformOwnerId: string
  credential: ConnectCredential<T>
  appUrl: string
  brandingMenuEntry: ConnectBrandingMenuEntry
}

/**
 * Shared plan §2.4 steps 1–4: pending-auth cookie → workspace + membership →
 * owner quota/trial gate → platform credential + branding menu entry. Every
 * per-account connect action (Messenger today; Instagram's two actions in a
 * later phase) starts here instead of re-implementing the same five checks.
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
 * across every picker.
 */
export async function resolveConnectSession<T extends CredentialType>(
  props: ConnectSessionRequest<T>,
): Promise<ResolvedConnectSession<T>> {
  const pendingAuth = await readPendingAuth(props.cookieName)
  if (!pendingAuth) {
    throw connectSessionExpiredException(
      "Your connect session expired. Please start again.",
    )
  }

  // `find` (not `findById`) — a vanished workspace must read the same as
  // "not a member of it" (a session error), not fall through to a generic
  // item-level `failed/unknown` outcome from an uncaught `notFoundException`.
  const workspace = await workspaceService.find({
    where: { id: pendingAuth.workspaceId },
  })
  if (!workspace) {
    throw notWorkspaceMemberException()
  }

  const isMember = await workspaceMemberService.isMember({
    workspaceId: workspace.id,
    userId: props.userId,
  })
  if (!isMember) {
    throw notWorkspaceMemberException()
  }

  const denialReason = await checkWorkspaceOwnerAccess({
    ownerId: workspace.ownerId,
  })
  if (denialReason) {
    throw workspaceAccessDenialException(denialReason)
  }

  const platformOwnerId = await resolvePlatformOwnerId({
    userId: props.userId,
    workspaceId: workspace.id,
  })

  const credential = await platformCredentialService.resolveForOwner({
    ownerId: platformOwnerId,
    type: props.credentialType,
  })
  if (!credential) {
    throw credentialMissingException(
      "App credentials are not configured for this workspace.",
    )
  }

  const { appUrl } = await resolveTenantSettings({
    workspaceId: workspace.id,
  })
  const brandingMenuEntry: ConnectBrandingMenuEntry = {
    label: BRANDING_TITLE,
    type: "url",
    url: getBrandingUrl(props.brandingChannel, appUrl),
  }

  return {
    pendingAuth,
    workspace,
    platformOwnerId,
    credential,
    appUrl,
    brandingMenuEntry,
  }
}
