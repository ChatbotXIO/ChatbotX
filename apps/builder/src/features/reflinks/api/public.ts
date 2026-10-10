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
import {
  DEFAULT_WIDGET_LOGO_BACKGROUND_COLOR,
  resolveWidgetBrand,
} from "../lib/widget-brand"
import {
  buildReflinkWidgetEmbedCode,
  buildReflinkWidgetScriptUrl,
} from "../lib/widget-embed"
import {
  createReflinkRequest,
  updateReflinkRequest,
  updateReflinkWidgetRequest,
} from "../schema/action"
import {
  reflinkChatWidgetPublicResource,
  reflinkPublicResource,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const withLinks = async <T extends { name: string }>(
  workspaceId: string,
  reflink: T,
) => {
  const { buildLinks } = await createReflinkLinkBuilder(workspaceId)
  return { ...reflink, links: buildLinks(reflink.name) }
}

type ReflinkWithWidget = Awaited<
  ReturnType<typeof reflinkService.findWidgetOrFail>
>

/** The ref link's chat widget settings plus its script and embed code. */
const toChatWidgetResource = async (
  workspaceId: string,
  reflink: ReflinkWithWidget,
) => {
  const { tenant, buildLinks } = await createReflinkLinkBuilder(workspaceId)
  const hiddenInboxIds = new Set(reflink.widgetHiddenInboxIds)
  const { logoUrl } = resolveWidgetBrand(
    {
      widgetLogoPath: reflink.widgetLogoFile?.path ?? null,
      widgetBrandName: reflink.widgetBrandName,
      widgetBrandUrl: reflink.widgetBrandUrl,
      widgetLogoBackgroundColor: reflink.widgetLogoBackgroundColor,
    },
    tenant,
  )
  return {
    reflinkId: reflink.id,
    authorizedDomains: reflink.widgetAuthorizedDomains,
    hiddenInboxIds: reflink.widgetHiddenInboxIds,
    logoFileId: reflink.widgetLogoFileId,
    logoUrl,
    logoBackgroundColor:
      reflink.widgetLogoBackgroundColor || DEFAULT_WIDGET_LOGO_BACKGROUND_COLOR,
    brandName: reflink.widgetBrandName,
    brandUrl: reflink.widgetBrandUrl,
    scriptUrl: buildReflinkWidgetScriptUrl(tenant.appUrl),
    embedCode: buildReflinkWidgetEmbedCode(tenant.appUrl, reflink.id),
    channels: buildLinks(reflink.name).filter(
      (link) => !hiddenInboxIds.has(link.inboxId),
    ),
  }
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
  getChatWidget: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ref-links/{id}/chat-widget",
      summary: "Get ref link chat widget",
      description:
        "Returns the ref link's chat widget settings (logo, brand, authorized domains, hidden channels), the channels the widget shows, and `embedCode`: the `<script>` tag to paste into a website. Use `reflinks.list` to find the ref link id first.",
      tags: ["Ref Links"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Ref link id. Get it from `reflinks.list`.",
        ),
      }),
    )
    .output(reflinkChatWidgetPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toChatWidgetResource(
        context.workspace.id,
        await reflinkService.findWidgetOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
      ),
    ),

  updateChatWidget: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/ref-links/{id}/chat-widget",
      summary: "Update ref link chat widget",
      description:
        "Replaces all of the ref link's chat widget settings — send every field, so call `reflinks.getChatWidget` first and change only what you need. `brandName` and `brandUrl` are set together or both left empty. `logoFileId` must be an image in the workspace media library. Returns the same shape as `reflinks.getChatWidget`, including `embedCode`.",
      tags: ["Ref Links"],
    })
    .input(
      updateReflinkWidgetRequest.and(
        z.object({
          id: zodBigintAsString().describe(
            "Ref link id. Get it from `reflinks.list`.",
          ),
        }),
      ),
    )
    .output(reflinkChatWidgetPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...settings } = input
      const workspaceId = context.workspace.id
      await reflinkService.updateWidgetSettings({ workspaceId, id }, settings)
      return await toChatWidgetResource(
        workspaceId,
        await reflinkService.findWidgetOrFail({ workspaceId, id }),
      )
    }),
}
