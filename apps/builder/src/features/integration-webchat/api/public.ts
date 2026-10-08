import { integrationWebchatService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createWebchatPublicRequest,
  updateWebchatPublicRequest,
  webchatPublicResource,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

const tags = ["Channels"]

// `create`/`update` accept `customCss` with no extra permission check, unlike
// the private `updateWebchatAction`'s `superAdmin` gate — intentional, see
// the security note in `../lib/widget-css.tsx` and the Channels scope section
// of `docs/developer/workspace-api-tokens.md`: minting any workspace token
// already requires superAdmin, so there is no lower-privileged caller left to
// gate against.

export const webchatsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/webchats",
      summary: "List webchats",
      description:
        "Use this to find webchat ids before inspecting one with `webchats.get` or changing one with `webchats.update`. Returns webchats in this workspace.",
      tags,
    })
    .input(publicListRequest)
    .output(publicListResponse(webchatPublicResource))
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await integrationWebchatService.list({
          workspaceId: context.workspace.id,
          page: input.page,
          perPage: input.perPage,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/webchats/{id}",
      summary: "Get webchat",
      description:
        "Returns one webchat's branding and behavior settings. Use `webchats.list` to find its id first.",
      tags,
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Webchat id. Get it from `webchats.list`.",
        ),
      }),
    )
    .output(webchatPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await integrationWebchatService.findByIdForWorkspace({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/webchats",
      summary: "Create webchat",
      description:
        "Adds a webchat widget for the workspace's website. Use `webchats.list` first to avoid duplicating an existing one.",
      successStatus: 201,
      tags,
    })
    .input(createWebchatPublicRequest)
    .output(webchatPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { connection } =
        await integrationWebchatService.createWithWorkspace({
          workspaceId: context.workspace.id,
          ownerId: context.workspace.ownerId,
          createdBy: context.workspace.ownerId,
          workspaceName: input.name,
          data: {
            ...input,
            auth: {},
            customCss: input.customCss ?? null,
          },
        })
      return await integrationWebchatService.findByIdForWorkspace({
        id: connection.sourceId,
        workspaceId: context.workspace.id,
      })
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/webchats/{id}",
      summary: "Update webchat",
      description:
        "Changes an existing webchat's branding or behavior settings. Call `webchats.get` to inspect current values first.",
      tags,
    })
    .input(
      updateWebchatPublicRequest.and(
        z.object({
          id: zodBigintAsString().describe(
            "Webchat id. Get it from `webchats.list`.",
          ),
        }),
      ),
    )
    .output(webchatPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      await integrationWebchatService.findByIdForWorkspace({
        id,
        workspaceId: context.workspace.id,
      })

      await integrationWebchatService.update({
        workspaceId: context.workspace.id,
        id,
        data: rest,
      })

      return await integrationWebchatService.findByIdForWorkspace({
        id,
        workspaceId: context.workspace.id,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/webchats/{id}",
      summary: "Delete webchat",
      description:
        "Permanently deletes a webchat widget. Use `webchats.list` to find its id first.",
      successStatus: 204,
      tags,
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Webchat id. Get it from `webchats.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await integrationWebchatService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}
