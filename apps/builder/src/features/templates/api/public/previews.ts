import {
  type TemplateActor,
  templateInstallationRequestService,
} from "@chatbotx.io/business"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { previewInstallCollisionsForShare } from "../../queries/preview-install-collisions"
import {
  previewTemplatePublicRequest,
  publicTemplatePreviewResponse,
} from "../../schema/public"
import { INSTALLATION_TAGS, tokenActor } from "./shared"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("templates")

/** What installing would answer to a `read_only` token. */
const READ_ONLY_TOKEN_REASON = "templateManagePermissionDenied"

export const templatePreviewsPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-previews/{id}",
      summary: "Preview shared template",
      description:
        "Whether the template behind a share link can be installed into this workspace, and what it contains. For an installable template, `collisions` predicts per tag, custom field, folder, product category, pipeline and inbox whether the install reuses, creates, renames or binds it, given what this workspace already has (`collisionSummary` counts them). Inbox predictions assume no inbox bindings, since this preview cannot take any; `templateInstallations.install` with `inboxBindings` decides the final binding. `installable: false` carries a `reason` instead of an error. Install it with `templateInstallations.install`.",
      tags: INSTALLATION_TAGS,
      spec: mcpSpec({ readOnlyHint: true }),
    })
    .input(previewTemplatePublicRequest)
    .output(publicTemplatePreviewResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const tokenPower = tokenActor(context)
      // Reading a preview is allowed to every token, so judge the link as an
      // installer with full power would, then say precisely why a read-only
      // token could not act on it, instead of misreporting the link as unusable.
      const actor: TemplateActor = { kind: "apiToken", permission: "full" }
      const preview = await templateInstallationRequestService.preview({
        shareToken: input.id,
        targetWorkspaceId: context.workspace.id,
        actor,
      })
      if (!preview.installable) {
        return preview
      }
      if (
        tokenPower.kind === "apiToken" &&
        tokenPower.permission === "read_only"
      ) {
        return {
          installable: false as const,
          reason: READ_ONLY_TOKEN_REASON,
        }
      }
      const { collisions, summary } = await previewInstallCollisionsForShare({
        shareToken: input.id,
        targetWorkspaceId: context.workspace.id,
        actor,
      })
      return {
        installable: true as const,
        template: {
          name: preview.template.name,
          description: preview.template.description,
          imageUrl: preview.template.imageUrl,
          publisherName: preview.template.publisherName,
          youtubeVideoId: preview.template.youtubeVideoId,
          testLink: preview.template.testLink,
          categoryCounts: preview.template.categoryCounts,
        },
        requiredInboxes: preview.requiredInboxes,
        requiredChannels: preview.requiredChannels,
        collisions,
        collisionSummary: summary,
        existingInstallation: preview.existingInstallation,
        publisherUninstallDisclosure: preview.publisherUninstallDisclosure,
      }
    }),
}
