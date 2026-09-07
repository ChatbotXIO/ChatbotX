import { workspaceService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { redirect } from "next/navigation"
import type { MessageKey } from "@/features/channel-connect/lib/message-key"

/** Query param `/channels/create` reads to explain why a channel connect could not start. */
const CREATE_CHANNEL_ERROR_PARAM = "error"

/**
 * Plan-limit failures the "create a workspace for the user's first channel"
 * step can raise (`workspaceService.create`'s quota gates), keyed by
 * `ChatbotXException.code` → the copy `/channels/create` shows for them. Any
 * other error keeps propagating, so an unexpected failure is never dressed
 * up as a plan limit.
 */
export const CREATE_CHANNEL_ERROR_MESSAGE_KEYS = {
  workspaceLimitReached: "channels.connectMany.reason.workspaceLimit",
  trialExpired: "channels.connectMany.sessionError.trialExpired",
  macLimitReached: "channels.connectMany.sessionError.macLimitReached",
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
 * the channel connects. Shared by the OAuth callback and the Facebook
 * SSO-reuse route so both turn a plan-limit failure into a redirect back to
 * `/channels/create` with a translated message, never a bare 500.
 */
export async function createFirstWorkspace(userId: string) {
  try {
    return await workspaceService.create({
      data: { name: "New Workspace", ownerId: userId },
      createdBy: userId,
    })
  } catch (error) {
    const errorPath = createChannelErrorPathFor(error)
    if (!errorPath) {
      throw error
    }
    return redirect(errorPath)
  }
}
