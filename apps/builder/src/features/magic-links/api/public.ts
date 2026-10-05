import { magicLinkService, resolveTenantSettings } from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { buildMagicLinkUrl } from "../lib/magic-link-url"
import {
  createMagicLinkPublicRequest,
  deleteMagicLinkPublicRequest,
  getMagicLinkPublicRequest,
  listMagicLinksPublicRequest,
  listMagicLinksPublicResponse,
  magicLinkPublicResource,
  updateMagicLinkPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

/** Served on the tenant's own app URL, so a white-label link stays on-brand. */
const createUrlBuilder = async (workspaceId: string) => {
  const { appUrl } = await resolveTenantSettings({ workspaceId })
  return <T extends { name: string }>(magicLink: T) => ({
    ...magicLink,
    url: buildMagicLinkUrl({
      origin: appUrl,
      workspaceId,
      name: magicLink.name,
    }),
  })
}

const withUrl = async <T extends { name: string }>(
  workspaceId: string,
  magicLink: T,
) => (await createUrlBuilder(workspaceId))(magicLink)

export const magicLinksPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/magic-links",
      summary: "List magic links",
      description:
        "Use this to find magic link ids before inspecting one with `magicLinks.get` or reading its clicks with `analytics.magicLinkStats`. Returns magic links in this workspace.",
      tags: ["Magic Links"],
    })
    .input(listMagicLinksPublicRequest)
    .output(listMagicLinksPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const [{ data, pageCount }, addUrl] = await Promise.all([
        magicLinkService.list({ ...input, workspaceId }),
        createUrlBuilder(workspaceId),
      ])
      return { data: data.map(addUrl), pageCount }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/magic-links/{id}",
      summary: "Get magic link",
      description:
        "Returns one magic link's name, destination URL and shareable `url`. Use `magicLinks.list` to find its id first, and `analytics.magicLinkStats` for its clicks.",
      tags: ["Magic Links"],
    })
    .input(getMagicLinkPublicRequest)
    .output(magicLinkPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      withUrl(
        context.workspace.id,
        await magicLinkService.findOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
      ),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/magic-links",
      summary: "Create magic link",
      description:
        "Adds a short tracked link that redirects to a destination URL and records who clicked it. Use `magicLinks.list` first to avoid reusing a taken name.",
      successStatus: 201,
      tags: ["Magic Links"],
    })
    .input(createMagicLinkPublicRequest)
    .output(magicLinkPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) =>
      withUrl(
        context.workspace.id,
        await magicLinkService.create({
          workspaceId: context.workspace.id,
          data: input,
        }),
      ),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/magic-links/{id}",
      summary: "Update magic link",
      description:
        "Use this to rename a magic link or change its destination URL. Renaming breaks links already shared under the old name. Call `magicLinks.get` to inspect current values first.",
      tags: ["Magic Links"],
    })
    .input(updateMagicLinkPublicRequest)
    .output(magicLinkPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await withUrl(
        context.workspace.id,
        await magicLinkService.update({
          workspaceId: context.workspace.id,
          id,
          data,
        }),
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/magic-links/{id}",
      summary: "Delete magic link",
      description:
        "Permanently deletes a magic link; its URL stops redirecting. Use `magicLinks.list` to find its id first.",
      successStatus: 204,
      tags: ["Magic Links"],
    })
    .input(deleteMagicLinkPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await magicLinkService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}
