import { db } from "@chatbotx.io/database/client"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import {
  extractTemplateParams,
  type SendWaTemplateMessageStepSchema,
  type TemplateComponent,
} from "@chatbotx.io/flow-config"
import {
  contactVariableService,
  type ReplaceVariableProps,
} from "@chatbotx.io/variables"

export async function replaceWhatsappTemplateVariables(props: {
  templateParams: SendWaTemplateMessageStepSchema["template"]["params"]
  variables: ReplaceVariableProps
  components?: TemplateComponent[]
}): Promise<SendWaTemplateMessageStepSchema["template"]["params"]> {
  const { variables, templateParams, components } = props
  // The template is the source of truth for whether a placeholder is NAMED
  // ({{order_id}}) or POSITIONAL ({{1}}). Re-derive parameter names here so
  // NAMED templates work even when the stored params predate named-parameter
  // support; positional placeholders yield none, so their payload is unchanged.
  const namedParams = components ? extractTemplateParams(components) : undefined
  const replacedParams = { ...templateParams }

  if (templateParams.header) {
    replacedParams.header = await Promise.all(
      templateParams.header.map(async (param, index) => {
        if (param.type === "text" && param.text) {
          const parameterName = namedParams?.header?.[index]?.parameter_name
          return {
            ...param,
            ...(parameterName && { parameter_name: parameterName }),
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
      templateParams.body.map(async (param, index) => {
        const parameterName = namedParams?.body?.[index]?.parameter_name
        return {
          ...param,
          ...(parameterName && { parameter_name: parameterName }),
          text: await contactVariableService.replaceAll({
            text: param.text,
            variables,
          }),
        }
      }),
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

export type ValidatedWhatsappTemplate = {
  inbox: NonNullable<
    Awaited<ReturnType<typeof db.query.inboxModel.findFirst>>
  > & {
    integrationWhatsapp: IntegrationWhatsappModel
  }
  template: NonNullable<
    Awaited<ReturnType<typeof db.query.whatsappMessageTemplateModel.findFirst>>
  >
}

export async function validateWhatsappTemplate(
  templateId: string,
  inboxId: string,
): Promise<ValidatedWhatsappTemplate | null> {
  const inbox = await db.query.inboxModel.findFirst({
    where: { id: inboxId },
    with: { integrationWhatsapp: true },
  })

  if (!inbox?.integrationWhatsapp) {
    return null
  }

  const template = await db.query.whatsappMessageTemplateModel.findFirst({
    where: {
      id: templateId,
      integrationWhatsappId: inbox.integrationWhatsapp.id,
      status: "APPROVED",
    },
  })

  if (!template) {
    return null
  }

  return {
    inbox: { ...inbox, integrationWhatsapp: inbox.integrationWhatsapp },
    template,
  }
}
