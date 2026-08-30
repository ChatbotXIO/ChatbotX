import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listEligibleLeadAdsPages, listPageLeadForms } from "../lib/pages"

const leadFormQuestion = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  id: z.string(),
})

export const facebookLeadAdsAuthenticatedAPI = {
  listLeadAdsPagesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-lead-ads/pages",
      summary: "List Messenger pages eligible for Lead Ads",
      tags: ["FB Lead Ads"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        pages: z.array(
          z.object({
            pageId: z.string(),
            pageName: z.string(),
            eligible: z.boolean(),
          }),
        ),
      }),
    )
    .handler(async ({ input }) => ({
      pages: await listEligibleLeadAdsPages(input.workspaceId),
    })),

  listLeadAdsFormsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-lead-ads/forms",
      summary: "List a page's lead forms",
      tags: ["FB Lead Ads"],
    })
    .input(withWorkspaceIdSchema.and(z.object({ pageId: z.string() })))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        forms: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            status: z.string(),
            questions: z.array(leadFormQuestion).optional(),
          }),
        ),
      }),
    )
    .handler(async ({ input }) => ({
      forms: await listPageLeadForms(input.workspaceId, input.pageId),
    })),
}
