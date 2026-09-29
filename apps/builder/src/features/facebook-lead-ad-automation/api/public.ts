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
import { createLeadAdAutomation } from "../lib/create-automation"
import { listEligibleLeadAdsPages, listPageLeadForms } from "../lib/pages"
import {
  createFacebookLeadAdPublicRequest,
  deleteFacebookLeadAdPublicRequest,
  facebookLeadAdPublicDetailResource,
  facebookLeadAdPublicResource,
  getFacebookLeadAdPublicRequest,
  listFacebookLeadAdsFormsPublicRequest,
  listFacebookLeadAdsFormsPublicResponse,
  listFacebookLeadAdsPagesPublicResponse,
  listFacebookLeadAdsPublicRequest,
  listFacebookLeadAdsPublicResponse,
  updateFacebookLeadAdPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const createMessages = {
  subscribeError: "Failed to subscribe the page to lead webhooks. Try again.",
  duplicateError: "An automation for this page and form already exists.",
}

export const facebookLeadAdsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/facebook-lead-ads",
      summary: "List Facebook Lead Ads automations",
      description:
        "Use this to find automation ids before inspecting one with `facebookLeadAds.get` or changing one with `facebookLeadAds.update`. Returns automations configured in this workspace.",
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
      summary: "Get Facebook Lead Ads automation",
      description:
        "Returns one automation's page, form, and reply configuration. Use `facebookLeadAds.list` to find its id first.",
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
      summary: "Create Facebook Lead Ads automation",
      description:
        "Subscribes a page to lead-form webhooks and configures the reply sent to new leads. Use `facebookLeadAds.listPages`/`facebookLeadAds.listForms` first to resolve valid page/form ids.",
      successStatus: 201,
      tags: ["Facebook Lead Ads"],
    })
    .input(createFacebookLeadAdPublicRequest)
    .output(facebookLeadAdPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await createLeadAdAutomation({
          workspaceId: context.workspace.id,
          data: input,
          messages: createMessages,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/facebook-lead-ads/{id}",
      summary: "Update Facebook Lead Ads automation",
      description:
        "Changes an existing automation's configuration. Call `facebookLeadAds.get` to inspect current values first.",
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
      summary: "Delete Facebook Lead Ads automation",
      description:
        "Permanently deletes an automation and stops replying to new leads for it. Use `facebookLeadAds.list` to find its id first.",
      successStatus: 204,
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

  listPages: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/facebook-lead-ads/pages",
      summary: "List Messenger pages eligible for Lead Ads",
      description:
        "Returns pages connected to this workspace that can be automated. Use `facebookLeadAds.listForms` to see a page's lead forms next.",
      tags: ["Facebook Lead Ads"],
    })
    .output(listFacebookLeadAdsPagesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => ({
      pages: await listEligibleLeadAdsPages(context.workspace.id),
    })),

  listForms: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/facebook-lead-ads/forms",
      summary: "List page lead forms",
      description:
        "Returns lead-generation forms configured on a Facebook page. Use `facebookLeadAds.listPages` to find `pageId` first.",
      tags: ["Facebook Lead Ads"],
    })
    .input(listFacebookLeadAdsFormsPublicRequest)
    .output(listFacebookLeadAdsFormsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => ({
      forms: await listPageLeadForms(context.workspace.id, input.pageId),
    })),
}
