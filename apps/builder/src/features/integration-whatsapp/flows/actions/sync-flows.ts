"use server"

import { prisma, type WhatsappFlowStatus } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import type {
  ListFlowsResponse,
  WhatsappAuthValue,
} from "@aha.chat/integration-whatsapp"
import type { Context } from "@aha.chat/sdk"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { chatbotActionClient } from "@/lib/safe-action"

export const syncWhatsappFlowAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationWhatsapp =
        await prisma.integrationWhatsapp.findFirstOrThrow({
          where: {
            chatbotId,
          },
        })
      const ctx: Context<WhatsappAuthValue> = {
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
        uploader,
      }

      const res = (await integrations.WHATSAPP.runAction("getFlows", {
        ctx,
        params: {
          limit: 1000,
        },
      })) as unknown as ListFlowsResponse
      await prisma.$transaction(async (tx) => {
        await tx.whatsappFlow.deleteMany({
          where: {
            integrationWhatsappId: integrationWhatsapp.id,
          },
        })
        const data = res.data.map((flow) => {
          return {
            name: flow.name,
            integrationWhatsappId: integrationWhatsapp.id,
            status: flow.status as WhatsappFlowStatus,
            sourceId: flow.id,
            isCompleted: false,
          }
        })
        await tx.whatsappFlow.createMany({
          data,
        })
      })

      revalidateTag(`chatbots:${chatbotId}#whatsapp#flows`)
    },
  )
