import {
  deviceTokenService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { successResponse } from "@/features/common/schemas"
import { authorizedAPI } from "@/orpc"
import {
  registerDeviceTokenRequest,
  unregisterDeviceTokenRequest,
} from "../schema/action"

export const deviceTokensAuthenticatedAPI = {
  registerDeviceTokenAPI: authorizedAPI
    .route({
      method: "PUT",
      path: "/users/me/device-tokens",
      summary: "Register a push notification device token for the current user",
      tags: ["DeviceTokens"],
    })
    .input(registerDeviceTokenRequest)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      if (input.workspaceId) {
        const isMember = await workspaceMemberService.isMember({
          workspaceId: input.workspaceId,
          userId: context.user.id,
        })
        if (!isMember) {
          throw new ChatbotXException("Not a member of this workspace")
        }
      }

      await deviceTokenService.upsert({
        userId: context.user.id,
        workspaceId: input.workspaceId,
        platform: input.platform,
        token: input.token,
      })
      return { success: true as const }
    }),

  unregisterDeviceTokenAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/users/me/device-tokens",
      summary: "Unregister a push notification device token",
      tags: ["DeviceTokens"],
    })
    .input(unregisterDeviceTokenRequest)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      await deviceTokenService.deleteByToken({
        userId: context.user.id,
        token: input.token,
      })
      return { success: true as const }
    }),
}
