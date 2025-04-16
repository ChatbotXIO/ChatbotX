"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type CreateMessageTemplateRequest,
  createMessageTemplateRequest,
} from "../schemas/create-message-templates-schema"
import { getLogger } from "@/lib/log"
import { uploader } from "@ahachat.ai/filesystem"
import type {
  CreateMessageTemplateProps,
  WhatsappAuthValue,
} from "@ahachat.ai/integration-whatsapp"
import { integrations } from "@/integration"
import { parseComponents, slugify } from "./utils"

export const createMessageTemplateAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(createMessageTemplateRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateMessageTemplateRequest
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
      const body: CreateMessageTemplateProps = {
        name: slugify(parsedInput.name),
        category: parsedInput.category,
        language: parsedInput.language,
        components: await parseComponents(
          ctx,
          parsedInput.templateType,
          parsedInput.content,
        ),
      }

      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      const res: any = await integrations.WHATSAPP.integration.runAction(
        "createMessageTemplate",
        {
          ctx,
          data: body,
        },
      )

      await prisma.whatsappMessageTemplate.create({
        data: {
          name: parsedInput.name,
          integrationWhatsappId: integrationWhatsapp.id,
          language: parsedInput.language,
          category: parsedInput.category,
          status: res.status,
          sourceId: res.id,
        },
      })

      revalidateTag(`chatbots:${chatbotId}#whatsapp#messageTemplates`)
    },
  )
