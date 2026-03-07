"use server"

import { and, db, eq } from "@aha.chat/database/client"
import { inboxTeamPlanModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { stripeInboxTeamPlanService } from "@/lib/stripe/inbox-team-plan-service"
import {
  type CreateInboxTeamPlanRequest,
  createInboxTeamPlanRequest,
} from "../schemas/create-inbox-team-plan.request"

export const createInboxTeamPlanAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createInboxTeamPlanRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: CreateInboxTeamPlanRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      try {
        // Create Stripe prices
        const stripePrices = await stripeInboxTeamPlanService.createPlanPrices(
          chatbotId,
          parsedInput.name,
          parsedInput.monthlyPrice,
          parsedInput.annualPrice,
        )

        // Create database record
        const planId = createId()
        await db.insert(inboxTeamPlanModel).values({
          id: planId,
          name: parsedInput.name,
          description: parsedInput.description,
          maxTeamMembers: parsedInput.maxTeamMembers,
          limits: parsedInput.limits || {},
          freeTrial: parsedInput.freeTrial,
          priceId: stripePrices.monthlyPriceId,
          annualPriceId: stripePrices.annualPriceId,
          organizationId: chatbotId,
        })

        revalidateCacheTags(`chatbots:${chatbotId}#inboxTeamPlans`)

        return {
          success: true,
          planId,
          stripePrices,
        }
      } catch (error) {
        console.error("Failed to create inbox team plan:", error)
        throw new Error(
          `Failed to create plan: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
      }
    },
  )
