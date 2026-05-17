import { db } from "@chatbotx.io/database/client"
import type { SendWaTemplateMessageStepSchema } from "@chatbotx.io/flow-config"
import {
  contactVariableService,
  type ReplaceVariableProps,
} from "@chatbotx.io/variables"

export async function replaceWhatsappTemplateVariables(props: {
  templateParams: SendWaTemplateMessageStepSchema["template"]["params"]
  variables: ReplaceVariableProps
}): Promise<SendWaTemplateMessageStepSchema["template"]["params"]> {
  const { variables, templateParams } = props
  const replacedParams = { ...templateParams }

  if (templateParams.header) {
    replacedParams.header = await Promise.all(
      templateParams.header.map(async (param) => {
        if (param.type === "text" && param.text) {
          return {
            ...param,
            text: await contactVariableService.replaceAll({
              variables,
              text: param.text,
            }),
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
        text: await contactVariableService.replaceAll({
          text: param.text,
          variables,
        }),
      })),
    )
  }

  if (templateParams.button) {
    replacedParams.button = await Promise.all(
      templateParams.button.map(async (param) => ({
        ...param,
        text: await contactVariableService.replaceAll({
          text: param.text || "",
          variables,
        }),
      })),
    )
  }

  return replacedParams
}

export async function validateWhatsappTemplate(
  template: SendWaTemplateMessageStepSchema["template"],
  inboxId: string,
): Promise<boolean> {
  const inbox = await db.query.inboxModel.findFirst({
    where: { id: inboxId },
    with: { integrationWhatsapp: true },
  })

  if (!inbox?.integrationWhatsapp) {
    return false
  }

  const whatsappTemplate =
    await db.query.whatsappMessageTemplateModel.findFirst({
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
