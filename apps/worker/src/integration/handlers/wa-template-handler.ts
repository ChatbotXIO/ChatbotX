import { prisma } from "@aha.chat/database"
import type { SendWaTemplateMessageStepSchema } from "@aha.chat/flow-config"
import { replaceCustomFieldAttributes } from "./automated-response/replies"

export async function replaceWhatsappTemplateVariables(
  templateParams: SendWaTemplateMessageStepSchema["template"]["params"],
  conversationId: string,
): Promise<SendWaTemplateMessageStepSchema["template"]["params"]> {
  const replacedParams = { ...templateParams }

  if (templateParams.header) {
    replacedParams.header = await Promise.all(
      templateParams.header.map(async (param) => {
        if (param.type === "text" && param.text) {
          return {
            ...param,
            text: await replaceCustomFieldAttributes(
              param.text,
              conversationId,
            ),
          }
        }
        return param
      }),
    )
  }

  if (templateParams.body) {
    replacedParams.body = await Promise.all(
      templateParams.body.map(async (param) => ({
        ...param,
        text: await replaceCustomFieldAttributes(param.text, conversationId),
      })),
    )
  }

  if (templateParams.button) {
    replacedParams.button = await Promise.all(
      templateParams.button.map(async (param) => ({
        ...param,
        text: await replaceCustomFieldAttributes(param.text, conversationId),
      })),
    )
  }

  return replacedParams
}

export async function validateWhatsappTemplate(
  template: SendWaTemplateMessageStepSchema["template"],
  inboxId: string,
): Promise<boolean> {
  const inbox = await prisma.inbox.findFirst({
    where: { id: inboxId },
    include: { integrationWhatsapp: true },
  })

  if (!inbox?.integrationWhatsapp) {
    return false
  }

  const whatsappTemplate = await prisma.whatsappMessageTemplate.findFirst({
    where: {
      id: template.id,
      integrationWhatsappId: inbox.integrationWhatsapp.id,
      status: "APPROVED",
    },
  })

  if (!whatsappTemplate) {
    return false
  }

  return true
}
