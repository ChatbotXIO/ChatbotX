import {
  resolveTenantSettings,
  templateStoreService,
} from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  listTemplateStorePublicRequest,
  publicTemplateStoreResponse,
} from "../../schema/store"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("templates")

export const templateStorePublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-store",
      summary: "List store templates",
      description:
        "The templates in this workspace owner's template store: the ones an admin approved, which anyone can open and install. Read-only. `categories` lists the store's tabs; filter with `categoryId`, `language` and `keyword`. Each template lists the `languages` it is made for (empty = every language); `language` keeps those and the ones with none. To install one, call `templatePreviews.get` with its `shareToken` as `id`, then `templateInstallations.install` with the same `shareToken`.",
      tags: ["Template store"],
      spec: mcpSpec({ readOnlyHint: true }),
    })
    .input(listTemplateStorePublicRequest)
    .output(publicTemplateStoreResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      // The store is the token workspace's tenant's, never the request host's.
      const [store, { storageUrl, faviconUrl }] = await Promise.all([
        templateStoreService.listPublished({
          tenantId: context.workspace.tenantId,
          categoryId: input.categoryId,
          keyword: input.keyword,
          language: input.language,
        }),
        resolveTenantSettings({ workspaceId: context.workspace.id }),
      ])
      return {
        categories: store.categories,
        templates: store.templates.map(
          ({ section: _section, ...template }) => ({
            ...template,
            imageUrl: template.imageUrl
              ? getPublicFileUrl(template.imageUrl, storageUrl)
              : faviconUrl,
          }),
        ),
      }
    }),
}
