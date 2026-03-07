"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { inboxTeamPlanModel } from "@aha.chat/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { stripeInboxTeamPlanService } from "@/lib/stripe/inbox-team-plan-service"

export const deleteInboxTeamPlanAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: BulkUpdateIdsRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      try {
        // Fetch plans to get Stripe product IDs
        const plans = await db.query.inboxTeamPlanModel.findMany({
          where: (model) =>
            and(
              inArray(model.id, parsedInput.ids),
              eq(model.organizationId, chatbotId),
            ),
        })

        // Archive Stripe products
        for (const plan of plans) {
          try {
            const product = await stripeInboxTeamPlanService.getProduct(
              plan.priceId,
            )
            if (product.id) {
              await stripeInboxTeamPlanService.archiveProduct(product.id)
            }
          } catch (err) {
            console.error(
              `Failed to archive Stripe product for plan ${plan.id}:`,
              err,
            )
          }
        }

        // Delete database records
        await db
          .delete(inboxTeamPlanModel)
          .where(
            and(
              inArray(inboxTeamPlanModel.id, parsedInput.ids),
              eq(inboxTeamPlanModel.organizationId, chatbotId),
            ),
          )

        revalidateCacheTags(`chatbots:${chatbotId}#inboxTeamPlans`)

        return {
          success: true,
          deletedCount: plans.length,
        }
      } catch (error) {
        console.error("Failed to delete inbox team plans:", error)
        throw new Error(
          `Failed to delete plans: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
      }
    },
  )
