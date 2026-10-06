import { workspaceService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { DatabaseClient } from "@chatbotx.io/database/client"
import { redirect } from "next/navigation"
import type { MessageKey } from "@/features/channel-connect/lib/message-key"

/** Query param `/channels/create` reads to explain why a channel connect could not start. */
const CREATE_CHANNEL_ERROR_PARAM = "error"

/**
 * Known failures keyed by `ChatbotXException.code` or connect-flow error code
 * → the copy `/channels/create` shows for them. Any other error keeps
 * propagating, so an unexpected failure is never dressed up as a known error.
 */
export const CREATE_CHANNEL_ERROR_MESSAGE_KEYS = {
  workspaceLimitReached: "channels.connectMany.reason.workspaceLimit",
  trialExpired: "channels.connectMany.sessionError.trialExpired",
  macLimitReached: "channels.connectMany.sessionError.macLimitReached",
  sessionExpired: "channels.connectMany.sessionError.sessionExpired",
} as const satisfies Record<string, MessageKey>

export type CreateChannelErrorCode =
  keyof typeof CREATE_CHANNEL_ERROR_MESSAGE_KEYS

export function isCreateChannelErrorCode(
  value: unknown,
): value is CreateChannelErrorCode {
  return (
    typeof value === "string" &&
    Object.hasOwn(CREATE_CHANNEL_ERROR_MESSAGE_KEYS, value)
  )
}

function createChannelErrorPath(code: CreateChannelErrorCode): string {
  return `/channels/create?${CREATE_CHANNEL_ERROR_PARAM}=${code}`
}

/** The `/channels/create` path for a known plan-limit failure, or `null` when the error must keep propagating. */
function createChannelErrorPathFor(error: unknown): string | null {
  if (
    error instanceof ChatbotXException &&
    isCreateChannelErrorCode(error.code)
  ) {
    return createChannelErrorPath(error.code)
  }
  return null
}

/**
 * First-channel path: the user has no workspace yet, so one is created before
 * the channel connects. Shared by the legacy JSON-state OAuth callback
 * (`app/integrations/[...integration]/callback.ts`) and
 * `startChannelConnect` (`features/channel-connect/lib/start-channel-
 * connect.ts`, itself shared by the Instagram, Instagram-via-Facebook, and
 * Messenger connect-start routes) so every caller turns a plan-limit
 * failure into a redirect back to `/channels/create` with a translated
 * message, never a bare 500.
 *
 * Idempotent on `ownerId` (regression I7): this runs from a plain GET route
 * reached by a redirect, not a POST — a browser back-button retry, a
 * double-navigation, or a replayed request must reuse the user's existing
 * workspace instead of minting a second "New Workspace" every time. Without
 * this check, `workspaceService.create` has no such guard (it isn't meant
 * to — callers that deliberately want an ADDITIONAL workspace, e.g.
 * Settings → "New workspace", must still be able to create one), so the
 * idempotency has to live here, at the "this is the user's FIRST workspace"
 * call site specifically. `findActiveByOwner` excludes a workspace mid
 * soft-delete, so a user who deleted their only workspace gets a fresh one
 * instead of being handed back the one that's about to be purged.
 *
 * Accepts an optional `tx`: `startChannelConnect`'s plain OAuth-start
 * path (no `beforeStart` hook) passes `connectionService.startSession`'s
 * own transaction through here instead of resolving a workspace up front,
 * so this insert and the `ConnectSession` it's starting commit or roll
 * back together — a connect attempt that fails before ever reaching the
 * provider never leaves an empty orphan workspace behind.
 */
export async function createFirstWorkspace(
  userId: string,
  tx?: DatabaseClient,
) {
  const existing = await workspaceService.findActiveByOwner({
    ownerId: userId,
    tx,
  })
  if (existing) {
    return existing
  }
  try {
    return await workspaceService.create({
      data: { name: "New Workspace", ownerId: userId },
      createdBy: userId,
      tx,
    })
  } catch (error) {
    const errorPath = createChannelErrorPathFor(error)
    if (!errorPath) {
      throw error
    }
    return redirect(errorPath)
  }
}
