"use server"

import { and, db, eq } from "@aha.chat/database/client"
import { inboxTeamPlanModel } from "@aha.chat/database/schema"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { stripeInboxTeamPlanService } from "@/lib/stripe/inbox-team-plan-service"
import {
  type UpdateInboxTeamPlanRequest,
  updateInboxTeamPlanRequest,
} from "../schemas/update-inbox-team-plan.request"

export const updateInboxTeamPlanAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateInboxTeamPlanRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: UpdateInboxTeamPlanRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      try {
        // Verify plan belongs to chatbot
        const plan = await db.query.inboxTeamPlanModel.findFirst({
          where: (model, { eq, and }) =>
            and(
              eq(model.id, parsedInput.planId),
              eq(model.organizationId, chatbotId),
            ),
        })

        if (!plan) {
          throw new Error("Plan not found")
        }

        // Update Stripe product if name changed
        if (parsedInput.name && parsedInput.name !== plan.name) {
          const product = await stripeInboxTeamPlanService.getProduct(
            plan.priceId,
          )
          if (product.id) {
            await stripeInboxTeamPlanService.updatePlanProduct(
              product.id,
              parsedInput.name,
            )
          }
        }

        // Update database record
        await db
          .update(inboxTeamPlanModel)
          .set({
            name: parsedInput.name ?? plan.name,
            description:
              parsedInput.description !== undefined
                ? parsedInput.description
                : plan.description,
            maxTeamMembers:
              parsedInput.maxTeamMembers ?? plan.maxTeamMembers,
            limits: parsedInput.limits || plan.limits,
            freeTrial: parsedInput.freeTrial ?? plan.freeTrial,
            updatedAt: new Date(),
          })
          .where(eq(inboxTeamPlanModel.id, parsedInput.planId))

        revalidateCacheTags(`chatbots:${chatbotId}#inboxTeamPlans`)

        return {
          success: true,
          planId: parsedInput.planId,
        }
      } catch (error) {
        console.error("Failed to update inbox team plan:", error)
        throw new Error(
          `Failed to update plan: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
      }
    },
  )
