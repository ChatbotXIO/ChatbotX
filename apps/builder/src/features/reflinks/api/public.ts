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
import {
  publicListRequest,
  publicListResponse,
  publicSortRequest,
} from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { createReflinkLinkBuilder } from "../lib/reflink-links"
import { createReflinkRequest, updateReflinkRequest } from "../schema/action"
import { reflinkPublicResource } from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const withLinks = async <T extends { name: string }>(
  workspaceId: string,
  reflink: T,
) => {
  const { buildLinks } = await createReflinkLinkBuilder(workspaceId)
  return { ...reflink, links: buildLinks(reflink.name) }
}

export const reflinksPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ref-links",
      summary: "List ref links",
      description:
        "Use this to find ref link ids before inspecting one with `reflinks.get` or changing one with `reflinks.update`. Returns ref links in this workspace, newest first unless `sort` is given. Filter by `keyword` (substring of the name).",
      tags: ["Ref Links"],
    })
    .input(
      publicListRequest.extend({
        keyword: z
          .string()
          .nullish()
          .describe("Case-insensitive substring match on the ref link name."),
        sort: publicSortRequest(["name", "createdAt", "updatedAt"]),
      }),
    )
    .output(publicListResponse(reflinkPublicResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const [{ data, pageCount }, { buildLinks }] = await Promise.all([
        reflinkService.list({
          ...input,
          workspaceId,
          sort: input.sort ?? [{ id: "createdAt", desc: true }],
        }),
        createReflinkLinkBuilder(workspaceId),
      ])
      return {
        data: data.map((reflink) => ({
          ...reflink,
          links: buildLinks(reflink.name),
        })),
        pageCount,
      }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ref-links/{id}",
      summary: "Get ref link",
      description:
        "Returns one ref link's target and settings, plus `links`: the ready-to-share open-chat URL for each connected channel. Use `reflinks.list` to find its id first.",
      tags: ["Ref Links"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Ref link id. Get it from `reflinks.list`.",
        ),
      }),
    )
    .output(reflinkPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      withLinks(
        context.workspace.id,
        await reflinkService.findOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
      ),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ref-links",
      summary: "Create ref link",
      description:
        "Adds a shareable link that redirects to a flow or destination; the response's `links` holds the full open-chat URL per connected channel. Use `reflinks.list` first to avoid duplicating an existing one.",
      successStatus: 201,
      tags: ["Ref Links"],
    })
    .input(createReflinkRequest)
    .output(reflinkPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) =>
      withLinks(
        context.workspace.id,
        await reflinkService.create({
          workspaceId: context.workspace.id,
          data: input,
        }),
      ),
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
    .output(reflinkPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await withLinks(
        context.workspace.id,
        await reflinkService.update(
          { workspaceId: context.workspace.id, id },
          data,
        ),
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
