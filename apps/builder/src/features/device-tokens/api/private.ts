import { successResponse } from "@/features/common/schema"
import { authorizedAPI } from "@/orpc"
import {
  registerDeviceToken,
  unregisterDeviceToken,
} from "../lib/device-tokens"
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
    .handler(
      async ({ input, context }) =>
        await registerDeviceToken(context.user.id, input),
    ),

  unregisterDeviceTokenAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/users/me/device-tokens",
      summary: "Unregister a push notification device token",
      tags: ["DeviceTokens"],
    })
    .input(unregisterDeviceTokenRequest)
    .output(successResponse)
    .handler(
      async ({ input, context }) =>
        await unregisterDeviceToken(context.user.id, input),
    ),
}
