import {
  deviceTokenService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { z } from "zod"
import type {
  registerDeviceTokenRequest,
  unregisterDeviceTokenRequest,
} from "../schema/action"

/**
 * Registers a push token for `userId`. Shared by the session `/rpc` procedure
 * and the mobile `PUT /v1/me/device-tokens`; a workspace the user does not
 * belong to is refused so a token can't be bound to a foreign workspace.
 */
export const registerDeviceToken = async (
  userId: string,
  input: z.infer<typeof registerDeviceTokenRequest>,
): Promise<{ success: true }> => {
  if (input.workspaceId) {
    const isMember = await workspaceMemberService.isMember({
      workspaceId: input.workspaceId,
      userId,
    })
    if (!isMember) {
      throw new ChatbotXException(
        "Not a member of this workspace",
        "forbidden",
        403,
      )
    }
  }

  await deviceTokenService.upsert({
    userId,
    workspaceId: input.workspaceId,
    platform: input.platform,
    token: input.token,
  })
  return { success: true as const }
}

export const unregisterDeviceToken = async (
  userId: string,
  input: z.infer<typeof unregisterDeviceTokenRequest>,
): Promise<{ success: true }> => {
  await deviceTokenService.deleteByToken({ userId, token: input.token })
  return { success: true as const }
}
