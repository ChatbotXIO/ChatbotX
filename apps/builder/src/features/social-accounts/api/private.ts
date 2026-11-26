import { z } from "zod"
import {
  workspaceAuthorizedMidddleware,
  workspacePermissionMiddleware,
} from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { socialAccountOperations } from "../lib/social-account-operations"
import {
  listSocialAccountsResponse,
  socialAccountIdRequest,
  socialAccountResource,
} from "../schema"

const tags = ["Social accounts"]
const inWorkspace = { workspaceId: z.string() }
const base = "/workspaces/{workspaceId}"

/**
 * The Posts page's session procedures. They call the same operations as the
 * public API (`api/public.ts`), behind the `broadcast` page permission;
 * disconnecting is a super admin's action, like connecting (the connect step is
 * the `connectSocialAccountAction` redirect).
 */
export const socialAccountsAPIs = {
  privateListSocialAccountsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/social-accounts`,
      summary: "List social accounts",
      tags,
    })
    .input(z.object(inWorkspace))
    .output(listSocialAccountsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ input }) => ({
      items: await socialAccountOperations.list(input.workspaceId),
    })),

  privateVerifySocialAccountAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/social-accounts/{id}/verify`,
      summary: "Verify social account",
      tags,
    })
    .input(socialAccountIdRequest.extend(inWorkspace))
    .output(socialAccountResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await socialAccountOperations.verify({
          id: input.id,
          workspaceId: input.workspaceId,
        }),
    ),

  privateSyncSocialAccountDestinationsAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/social-accounts/{id}/sync-destinations`,
      summary: "Sync social account destinations",
      tags,
    })
    .input(socialAccountIdRequest.extend(inWorkspace))
    .output(socialAccountResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await socialAccountOperations.syncDestinations({
          id: input.id,
          workspaceId: input.workspaceId,
        }),
    ),

  privateDisconnectSocialAccountAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: `${base}/social-accounts/{id}`,
      summary: "Disconnect social account",
      successStatus: 204,
      tags,
    })
    .input(socialAccountIdRequest.extend(inWorkspace))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .use(
      workspacePermissionMiddleware("superAdmin"),
      (input) => input.workspaceId,
    )
    .handler(async ({ input }) => {
      await socialAccountOperations.disconnect({
        id: input.id,
        workspaceId: input.workspaceId,
      })
    }),
}
