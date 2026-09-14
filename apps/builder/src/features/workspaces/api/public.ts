import {
  channelTokenRefreshService,
  workspaceLifecycleService,
  workspaceService,
  workspaceSupportAccessService,
} from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { channelTokenRefreshCallbacks } from "../lib/channel-refresh-callbacks"
import {
  refreshChannelTokensPublicResponse,
  updateWorkspacePublicRequest,
  updateWorkspaceStatusPublicRequest,
  updateWorkspaceSupportAccessPublicRequest,
  workspacePublicResource,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("workspace")

const tags = ["Workspace"]

export const workspacePublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/workspace",
      summary: "Get workspace settings",
      tags,
    })
    .output(workspacePublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context }) =>
        await workspaceService.findById({ id: context.workspace.id }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/workspace",
      summary: "Update workspace settings",
      tags,
    })
    .input(updateWorkspacePublicRequest)
    .output(workspacePublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await workspaceService.update({
          id: context.workspace.id,
          data: input,
        }),
    ),

  updateStatus: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/workspace/status",
      summary: "Update workspace active status and hours",
      tags,
    })
    .input(updateWorkspaceStatusPublicRequest)
    .output(workspacePublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await workspaceService.update({
          id: context.workspace.id,
          data: input,
        }),
    ),

  scheduleDeletion: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/workspace/deletion",
      summary: "Schedule workspace deletion",
      tags,
    })
    .output(workspacePublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context }) => {
      const workspace = await workspaceService.scheduleDeletion({
        id: context.workspace.id,
      })
      await workspaceLifecycleService.freezeWorkspaceRuntime(
        context.workspace.id,
      )
      return workspace
    }),

  cancelDeletion: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/workspace/deletion",
      summary: "Cancel scheduled workspace deletion",
      successStatus: 204,
      tags,
    })
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context }) => {
      await workspaceService.cancelDeletion({ id: context.workspace.id })
    }),

  updateSupportAccess: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/workspace/support-access",
      summary: "Enable or disable platform support access",
      successStatus: 204,
      tags,
    })
    .input(updateWorkspaceSupportAccessPublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      if (input.enabled) {
        await workspaceSupportAccessService.enable({
          workspaceId: context.workspace.id,
          actorUserId: null,
        })
        return
      }

      await workspaceSupportAccessService.disable({
        workspaceId: context.workspace.id,
        actorUserId: null,
      })
    }),

  refreshChannelTokens: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/workspace/channel-tokens/refresh",
      summary: "Refresh channel access tokens",
      tags,
    })
    .output(refreshChannelTokensPublicResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context }) =>
        await channelTokenRefreshService.refreshWorkspace({
          workspaceId: context.workspace.id,
          ...channelTokenRefreshCallbacks,
        }),
    ),
}
