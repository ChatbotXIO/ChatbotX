import { reflinkService } from "@chatbotx.io/business"
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
import { createReflinkRequest, updateReflinkRequest } from "../schema/action"
import { reflinkResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const reflinksPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ref-links",
      summary: "List ref links",
      description:
        "Use this to find ref link ids before inspecting one with `reflinks.get` or changing one with `reflinks.update`. Returns ref links in this workspace.",
      tags: ["Ref Links"],
    })
    .input(publicListRequest)
    .output(publicListResponse(reflinkResource))
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await reflinkService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ref-links/{id}",
      summary: "Get ref link",
      description:
        "Returns one ref link's target and settings. Use `reflinks.list` to find its id first.",
      tags: ["Ref Links"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Ref link id. Get it from `reflinks.list`.",
        ),
      }),
    )
    .output(reflinkResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await reflinkService.findOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ref-links",
      summary: "Create ref link",
      description:
        "Adds a shareable link that redirects to a flow or destination. Use `reflinks.list` first to avoid duplicating an existing one.",
      successStatus: 201,
      tags: ["Ref Links"],
    })
    .input(createReflinkRequest)
    .output(reflinkResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await reflinkService.create({
          workspaceId: context.workspace.id,
          data: input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/ref-links/{id}",
      summary: "Update ref link",
      description:
        "Changes an existing ref link's target or settings. Call `reflinks.get` to inspect current values first.",
      tags: ["Ref Links"],
    })
    .input(
      updateReflinkRequest.and(
        z.object({
          id: zodBigintAsString().describe(
            "Ref link id. Get it from `reflinks.list`.",
          ),
        }),
      ),
    )
    .output(reflinkResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await reflinkService.update(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ref-links/{id}",
      summary: "Delete ref link",
      description:
        "Permanently deletes a ref link. Use `reflinks.list` to find its id first.",
      successStatus: 204,
      tags: ["Ref Links"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Ref link id. Get it from `reflinks.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await reflinkService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
