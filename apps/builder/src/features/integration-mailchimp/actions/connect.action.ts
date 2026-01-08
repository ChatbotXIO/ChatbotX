"use server"

import { HandleRequestType } from "@aha.chat/sdk"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { findOrganizationSettings } from "@/features/organization/queries"
import { integrations } from "@/integration"
import { chatbotActionClient } from "@/lib/safe-action"
import { connectMailchimpSchema } from "../schemas"

export const connectMailchimp = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(connectMailchimpSchema)
  .action(async ({ ctx, parsedInput }) => {
    const headersList = await headers()
    const { chatbot } = ctx
    const { referer } = parsedInput

    const organizationSettings = await findOrganizationSettings({
      id: chatbot.organizationId,
    })

    if (!organizationSettings.mailchimp) {
      throw new Error("Mailchimp credentials are not configured")
    }

    const callbackUrl = new URL(
      "/integrations/mailchimp/callback",
      referer,
    ).toString()

    const authBaseUrl = headersList.get("x-url") ?? referer

    const redirectUrl = await integrations.mailchimp.handleRequest?.({
      config: {
        clientId: organizationSettings.mailchimp.clientId,
        clientSecret: organizationSettings.mailchimp.clientSecret,
        redirectUrl: callbackUrl,
        stateParams: {
          chatbotId: chatbot.id,
          referer,
        },
      },
      req: new Request(new URL(HandleRequestType.generateAuthUrl, authBaseUrl)),
    })

    if (typeof redirectUrl !== "string") {
      throw new Error("Failed to generate Mailchimp connection URL")
    }

    return redirect(redirectUrl)
  })
