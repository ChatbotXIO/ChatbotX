import "server-only"

import { workspaceService } from "@chatbotx.io/business"
import "@chatbotx.io/business/audit"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { connectionService, failSession } from "@chatbotx.io/connections"
import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import type {
  ConnectSessionModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import type { ConnectSessionNextAction } from "@chatbotx.io/sdk"
import { getPublicUrlFromRequest } from "@chatbotx.io/utils"
import { notFound, redirect, unstable_rethrow } from "next/navigation"
import type { NextRequest } from "next/server"
import { resolveOAuthCredential } from "@/features/connections/lib/resolve-connect-credential"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserId } from "@/lib/auth/utils"
import { logger } from "@/lib/log"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { createFirstWorkspace } from "@/lib/workspace/create-first-workspace"

/** What a `beforeStart` hook decides once the credential/workspace are resolved. */
export type BeforeStartResult =
  | { type: "redirect"; url: string }
  | { type: "continue" }

export type BeforeStartContext = {
  userId: string
  platformOwnerId: string
  /**
   * Not pre-awaited — a hook with its own independent async work (e.g.
   * Messenger's SSO-token validity check) can run it concurrently via
   * `Promise.all` instead of waiting on workspace resolve-or-create first.
   */
  targetWorkspacePromise: Promise<WorkspaceModel>
  /** Type-erased (`ConnectionCredential = unknown`, same as `resolveOAuthCredential`'s own return) — a caller that needs the concrete shape casts it, same as every other generic-credential call site. */
  credential: Record<string, unknown>
}

export type StartChannelConnectOptions = {
  provider: IntegrationType
  /** The select-page path to set as the session's (relative) `returnUrl`, once the session id is known. */
  selectPath: (sessionId: string) => string
  /**
   * Runs once the credential and target workspace are resolved, before the
   * OAuth `startSession` call — Messenger's Facebook-SSO-token reuse
   * short-circuit hooks in here: on a hit it mints its own session, attaches
   * candidates, and redirects straight to the picker with no OAuth round
   * trip; on a miss (or its own failure) it returns `{ type: "continue" }`
   * to fall back to the normal OAuth start below.
   */
  beforeStart?: (ctx: BeforeStartContext) => Promise<BeforeStartResult>
}

const START_FAILURE_REDIRECT = "/channels/create?error=sessionExpired"

/**
 * Shared GET-route body behind the three `channels/<channel>[/create]/
 * route.ts` OAuth-start handlers (Instagram, Instagram-via-Facebook,
 * Messenger): the workspace-permission guard, platform owner, credential
 * (resolved once, before any workspace is created — a workspace must never
 * be minted only to 404 right after on a missing credential), workspace
 * resolve-or-create, `startSession`, the relative `updateReturnUrl`, the
 * `open_url` check, and error redirects. Every route becomes a thin wrapper
 * that supplies its own `provider`/`selectPath` and (Messenger only) its
 * SSO-reuse `beforeStart`.
 */
export async function startChannelConnect(
  req: NextRequest,
  options: StartChannelConnectOptions,
): Promise<never> {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? undefined

  if (workspaceId) {
    await requireWorkspacePermission(workspaceId, "superAdmin")
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    notFound()
  }

  const platformOwnerId = await resolvePlatformOwnerId({ userId, workspaceId })

  // Resolved BEFORE the workspace: a missing credential must 404 without
  // ever minting a workspace for the user's first channel attempt —
  // otherwise a credential-less retry leaves an orphan empty workspace
  // behind every time.
  const resolved = await resolveOAuthCredential({
    provider: options.provider,
    ownerId: platformOwnerId,
  })
  if (!resolved) {
    notFound()
  }

  // A `beforeStart` hook (Messenger's SSO-token reuse check) needs a
  // materialized workspace to run concurrently with its own lookup and, on
  // a hit, to mint its own session outside the normal OAuth round trip — so
  // with a hook present (or an existing `workspaceId` targeted), the
  // workspace is still resolved/created eagerly here.
  //
  // Without a hook (Instagram, Instagram-via-Facebook's first-channel
  // path), nothing needs the workspace before `startSession` itself, so its
  // creation is deferred into `startSession`'s own transaction instead
  // (`createWorkspace` below): a `startSession` failure then rolls the
  // workspace back with it, instead of leaving an empty orphan workspace
  // behind when the connect attempt never even reaches the provider (M-7).
  let targetWorkspacePromise: Promise<WorkspaceModel> | undefined
  if (workspaceId) {
    targetWorkspacePromise = workspaceService.findById({ id: workspaceId })
  } else if (options.beforeStart) {
    targetWorkspacePromise = createFirstWorkspace(userId)
  }

  if (options.beforeStart) {
    if (!targetWorkspacePromise) {
      // Unreachable: `options.beforeStart` truthy forces the ternary's
      // middle branch above to run.
      throw new Error(
        "startChannelConnect: workspace must be resolved for beforeStart",
      )
    }
    const before = await options.beforeStart({
      userId,
      platformOwnerId,
      targetWorkspacePromise,
      credential: resolved.credential,
    })
    if (before.type === "redirect") {
      redirect(before.url)
    }
  }

  const sessionStartBase = {
    provider: options.provider,
    purpose: "connect" as const,
    credential: resolved.credential,
    callbackUrl: resolved.callbackUrl,
    actorUserId: userId,
    platformOwnerId,
    originHost: new URL(getPublicUrlFromRequest(req)).host,
  }

  let session: ConnectSessionModel
  let nextAction: ConnectSessionNextAction
  try {
    const started = await connectionService.startSession(
      targetWorkspacePromise
        ? {
            ...sessionStartBase,
            workspaceId: (await targetWorkspacePromise).id,
          }
        : {
            ...sessionStartBase,
            createWorkspace: (tx: DatabaseClient) =>
              createFirstWorkspace(userId, tx),
          },
    )
    session = started.session
    nextAction = started.nextAction
  } catch (err) {
    // `createFirstWorkspace` (either awaited eagerly above via
    // `targetWorkspacePromise`, or run as `startSession`'s own
    // `createWorkspace` callback inside its transaction) redirects straight
    // to a plan-limit error page itself on a known `ChatbotXException`
    // (`workspaceLimitReached`/`trialExpired`/`macLimitReached`) — that
    // `redirect()` throws a `NEXT_REDIRECT` control-flow error, which
    // reaches this `catch` same as a real failure. `unstable_rethrow` lets
    // it keep propagating instead of being logged and replaced with the
    // generic `START_FAILURE_REDIRECT` here, which would otherwise mask the
    // specific plan-limit message with a misleading "session expired" one.
    unstable_rethrow(err)
    logger.error(
      { err, provider: options.provider, workspaceId },
      "Failed to start a channel connect session",
    )
    redirect(START_FAILURE_REDIRECT)
  }

  // Set in a follow-up call, not passed into `startSession` itself — the
  // select-page redirect target needs the session's own id, which isn't
  // known until `startSession` returns. Always application-relative
  // (`validateReturnUrl` rejects an absolute value); the callback resolves
  // it against its own public origin before using it.
  try {
    await connectSessionService.updateReturnUrl({
      id: session.id,
      returnUrl: options.selectPath(session.id),
    })
  } catch (err) {
    logger.error(
      { err, sessionId: session.id, provider: options.provider },
      "Failed to set the connect session return URL",
    )
    await failSession(session, "internal_error")
    redirect(START_FAILURE_REDIRECT)
  }

  if (nextAction.type !== "open_url") {
    logger.error(
      { sessionId: session.id, nextAction, provider: options.provider },
      `Unexpected connect next action for ${options.provider}`,
    )
    await failSession(session, "internal_error")
    redirect(START_FAILURE_REDIRECT)
  }

  redirect(nextAction.url)
}
