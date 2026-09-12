import { facebookLeadAdsAutomationService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createFacebookLeadAdPublicRequest,
  deleteFacebookLeadAdPublicRequest,
  facebookLeadAdPublicDetailResource,
  facebookLeadAdPublicResource,
  getFacebookLeadAdPublicRequest,
  listFacebookLeadAdsPublicRequest,
  listFacebookLeadAdsPublicResponse,
  updateFacebookLeadAdPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const facebookLeadAdsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/facebook-lead-ads",
      summary: "List Facebook Lead Ads automations",
      tags: ["Facebook Lead Ads"],
    })
    .input(listFacebookLeadAdsPublicRequest)
    .output(listFacebookLeadAdsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await facebookLeadAdsAutomationService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/facebook-lead-ads/{id}",
      summary: "Get a Facebook Lead Ads automation",
      tags: ["Facebook Lead Ads"],
    })
    .input(getFacebookLeadAdPublicRequest)
    .output(facebookLeadAdPublicDetailResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const automation = await facebookLeadAdsAutomationService.findById({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      if (!automation) {
        throw notFoundException("Facebook Lead Ads automation not found")
      }
      return automation
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/facebook-lead-ads",
      summary: "Create a Facebook Lead Ads automation",
      tags: ["Facebook Lead Ads"],
    })
    .input(createFacebookLeadAdPublicRequest)
    .output(facebookLeadAdPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await facebookLeadAdsAutomationService.create({
          workspaceId: context.workspace.id,
          name: input.name,
          pageId: input.pageId,
          pageName: input.pageName ?? null,
          formId: input.formId,
          formName: input.formName ?? null,
          fieldMapping: input.fieldMapping,
          flowId: input.flowId ?? null,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/facebook-lead-ads/{id}",
      summary: "Update a Facebook Lead Ads automation",
      tags: ["Facebook Lead Ads"],
    })
    .input(updateFacebookLeadAdPublicRequest)
    .output(facebookLeadAdPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...update } = input
      const automation = await facebookLeadAdsAutomationService.update(
        { workspaceId: context.workspace.id, id },
        update,
      )
      if (!automation) {
        throw notFoundException("Facebook Lead Ads automation not found")
      }
      return automation
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/facebook-lead-ads/{id}",
      summary: "Delete a Facebook Lead Ads automation",
      tags: ["Facebook Lead Ads"],
    })
    .input(deleteFacebookLeadAdPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await facebookLeadAdsAutomationService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
