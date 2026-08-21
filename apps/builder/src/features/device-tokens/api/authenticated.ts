import { deviceTokenService } from "@chatbotx.io/business"
import z from "zod"
import { authorizedAPI } from "@/orpc"
import {
  registerDeviceTokenRequest,
  unregisterDeviceTokenRequest,
} from "../schema/action"

const successResponse = z.object({ success: z.literal(true) })

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
    .handler(async ({ input }) => {
      await deviceTokenService.deleteByToken({ token: input.token })
      return { success: true as const }
    }),
}
