import { userService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { createId } from "@chatbotx.io/utils"
import { ORPCError } from "@orpc/server"
import { APIError } from "better-auth/api"
import { z } from "zod"
import { successResponse } from "@/features/common/schema"
import {
  registerDeviceToken,
  unregisterDeviceToken,
} from "@/features/device-tokens/lib/device-tokens"
import { listMyWorkspaces } from "@/features/workspaces/lib/list-my-workspaces"
import { workspaceResource } from "@/features/workspaces/schema/resource"
import { auth } from "@/lib/auth/auth"
import { logger } from "@/lib/log"
import { isValidWorkspaceId } from "@/lib/mobile-auth/resolve-mobile-principal"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
  possibleErrorsOnSchedulingAccountDeletion,
} from "@/lib/orpc/orpc-error-helper"
import { mobileUserAPI, mobileUserPasswordChangeAPI } from "@/orpc"
import {
  accountDeletionRequest,
  changeMyPasswordRequest,
  meResource,
  mobileTokenResponse,
  registerMyDeviceTokenRequest,
  unregisterMyDeviceTokenRequest,
} from "../schema/public"

const changePasswordFailed = {
  message: "The password could not be changed",
  status: 400,
}

const WORKSPACE_ID_HEADER = "x-workspace-id"

const parseOptionalWorkspaceHeader = (headers: Headers): string | undefined => {
  const raw = headers.get(WORKSPACE_ID_HEADER)?.trim()
  if (!raw) {
    return
  }
  if (!isValidWorkspaceId(raw)) {
    throw new ORPCError("BAD_REQUEST", {
      status: 400,
      message: "x-workspace-id must be a numeric workspace identifier",
    })
  }
  return raw
}

/**
 * User-level operations for the native mobile app. They act for the signed-in
 * person, not a workspace, so they take no `x-workspace-id` and only a mobile
 * access JWT is accepted (`POST /api/auth/mobile/token`).
 */
export const mePublicRouter = {
  get: mobileUserPasswordChangeAPI
    .route({
      method: "GET",
      path: "/v1/me",
      summary: "Get signed-in user",
      description:
        "Returns the user a mobile access token belongs to. Only mobile app access tokens are accepted, not workspace API tokens. Still answers while `mustChangePassword` is true, so the app can route to the password change.",
      tags: ["Me"],
    })
    .output(meResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(({ context }) => ({
      id: context.user.id,
      name: context.user.name ?? "",
      email: context.user.email,
      image: context.user.image ?? null,
      mustChangePassword: context.user.mustChangePassword ?? false,
    })),

  listWorkspaces: mobileUserAPI
    .route({
      method: "GET",
      path: "/v1/me/workspaces",
      summary: "List my workspaces",
      description:
        "Lists the workspaces the signed-in user is a member of. Use a returned `id` as the `x-workspace-id` header on every workspace-scoped operation.",
      tags: ["Me"],
    })
    .output(z.object({ workspaces: z.array(workspaceResource) }))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => await listMyWorkspaces(context.user.id)),

  registerDeviceToken: mobileUserAPI
    .route({
      method: "PUT",
      path: "/v1/me/device-tokens",
      summary: "Register push notification token",
      description:
        "Registers (or moves to this user) an Expo push token for the signed-in user. Send the optional `x-workspace-id` header to bind the token to a workspace the user belongs to (403 otherwise); omit it to register for the account only.",
      tags: ["Me"],
    })
    .input(registerMyDeviceTokenRequest)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await registerDeviceToken(context.user.id, {
          ...input,
          workspaceId: parseOptionalWorkspaceHeader(context.headers),
        }),
    ),

  unregisterDeviceToken: mobileUserAPI
    .route({
      method: "DELETE",
      path: "/v1/me/device-tokens",
      summary: "Unregister push notification token",
      description:
        "Removes a push token of the signed-in user, e.g. on sign-out. Unknown tokens are ignored.",
      tags: ["Me"],
    })
    .input(unregisterMyDeviceTokenRequest)
    .output(successResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await unregisterDeviceToken(context.user.id, input),
    ),

  changePassword: mobileUserPasswordChangeAPI
    .route({
      method: "POST",
      path: "/v1/me/password",
      summary: "Change my password",
      description:
        "Verifies `currentPassword`, sets `newPassword`, clears `mustChangePassword`, and ends every other sign-in of the user (web sessions and refresh tokens on all devices). The response is a fresh token pair for this device, in the shape of `POST /api/auth/mobile/token`, so the app stays signed in.",
      tags: ["Me"],
    })
    .input(changeMyPasswordRequest)
    .output(mobileTokenResponse)
    .errors({
      ...possibleErrorsOnMutatingResource,
      changePasswordFailed,
    })
    .handler(async ({ context, input }) => {
      context.resHeaders?.set("Cache-Control", "no-store")
      context.resHeaders?.set("Pragma", "no-cache")
      try {
        return await auth.api.mobileChangePassword({
          body: {
            userId: context.user.id,
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
            deviceId: input.deviceId ?? context.mobileDeviceId ?? createId(),
          },
        })
      } catch (error) {
        if (
          error instanceof APIError &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          throw new ChatbotXException(
            error.body?.message ?? "Failed to change password",
            "changePasswordFailed",
            error.statusCode,
          )
        }
        logger.error({ err: error }, "Mobile password change failed")
        throw error
      }
    }),

  webHandoff: mobileUserAPI
    .route({
      method: "POST",
      path: "/v1/me/web-handoff",
      summary: "Create web account handoff",
      description:
        "Creates a one-time, 60-second URL that signs the mobile user into the account deletion page.",
      tags: ["Me"],
    })
    .input(z.object({}))
    .output(z.object({ url: z.url() }))
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context }) => {
      const result = await auth.api.mobileCreateWebHandoff({
        body: { userId: context.user.id },
      })
      if (!context.url) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Request URL is unavailable",
        })
      }
      const url = new URL("/api/auth/account/handoff", context.url)
      url.searchParams.set("code", result.code)
      return { url: url.toString() }
    }),

  delete: mobileUserAPI
    .route({
      method: "DELETE",
      path: "/v1/me",
      summary: "Schedule account deletion",
      description:
        'Schedules deletion of the signed-in account and all workspaces it owns. Send { "confirmation": "DELETE" } to confirm.',
      tags: ["Me"],
    })
    .input(accountDeletionRequest)
    .output(z.object({ scheduledDeletionAt: z.date() }))
    .errors(possibleErrorsOnSchedulingAccountDeletion)
    .handler(async ({ context }) => {
      context.resHeaders?.set("Cache-Control", "no-store")
      context.resHeaders?.set("Pragma", "no-cache")
      return await userService.requestAccountDeletion({
        actor: { userId: context.user.id },
        userId: context.user.id,
      })
    }),
}
