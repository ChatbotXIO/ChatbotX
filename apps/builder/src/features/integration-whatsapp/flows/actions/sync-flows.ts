"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma, type WhatsappFlowStatus } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import { getLogger } from "@/lib/log"
import { uploader } from "@ahachat.ai/filesystem"
import type { WhatsappAuthValue } from "@ahachat.ai/integration-whatsapp"
import { integrations } from "@/integration"

export const syncFlowAction = chatbotActionClient
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
      const ctx = {
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
        logger: getLogger("whatsapp"),
        uploader,
      }

      const res = await integrations.WHATSAPP.integration.actions?.getFlows({
        ctx,
        params: {
          limit: 1000,
        },
      })
      await prisma.$transaction(async (tx) => {
        await tx.whatsappFlow.deleteMany({
          where: {
            integrationWhatsappId: integrationWhatsapp.id,
          },
        })
        const data = res.map((flow) => {
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
