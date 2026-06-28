import type {
  ButtonStepProps,
  MessengerTemplateParams,
  MetadataPayload,
  SendMessengerTemplateMessageStepSchema,
} from "@chatbotx.io/flow-config"
import {
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import type {
  FacebookSendMessageRequest,
  MessengerAuthValue,
  MessengerIntegrationDetail,
} from "../../../schema"
import { MESSENGER_MESSAGE_METADATA } from "../../../schema"
import { resolveMessengerPersonaId } from "./persona"

type MessengerTemplateComponentParameter =
  | { type: "text"; text: string; parameter_name?: string }
  | { type: "image"; image: { link: string } }
  | { type: "POSTBACK"; payload: string }
  | { type: "URL"; url: string }
  | { type: "PHONE_NUMBER" }

type MessengerTemplateComponent = {
  type: "header" | "body" | "buttons"
  parameters: MessengerTemplateComponentParameter[]
}

/**
 * Builds a complete Facebook Send API request for a Messenger utility template.
 *
 * Correct structure per docs (Mar 2026):
 *   messaging_type = "UTILITY"
 *   message.template.name / language.code / components
 *
 * NOT message.attachment.payload — that is the old generic-template shape.
 *
 * Button parameters come from two sources and are merged in template order:
 *   - URL / PHONE_NUMBER buttons: built from template.params.button
 *   - POSTBACK buttons: built from step.buttons[] with encoded flow payloads
 */
export function buildMessengerTemplateSendRequest(
  props: Parameters<
    MessageHandlers<
      MessengerAuthValue,
      SendMessengerTemplateMessageStepSchema
    >["sendFlowStep"]
  >[0],
): FacebookSendMessageRequest {
  const {
    ctx,
    data: { contact, flowId, flowVersionId, metadata, step },
  } = props
  const { template } = step

  const components = buildMessengerTemplateComponents(
    template.params,
    template.parameterFormat,
    {
      flowId,
      flowVersionId,
      metadata,
      flowButtons: step.buttons,
    },
  )

  const personaId = resolveMessengerPersonaId(
    ctx.integrationDetail as MessengerIntegrationDetail | undefined,
    contact,
  )

  return {
    recipient: { id: contact.sourceId },
    messaging_type: "UTILITY",
    persona_id: personaId,
    message: {
      template: {
        name: template.name,
        language: { code: template.language },
        components,
      },
      metadata: MESSENGER_MESSAGE_METADATA,
    },
  }
}

export function buildMessengerTemplateComponents(
  params: MessengerTemplateParams,
  parameterFormat: "POSITIONAL" | "NAMED",
  flowContext?: {
    flowId?: string
    flowVersionId?: string
    metadata?: MetadataPayload
    flowButtons?: ButtonStepProps[]
  },
): MessengerTemplateComponent[] {
  const components: MessengerTemplateComponent[] = []

  if (params.header && params.header.length > 0) {
    // Messenger utility image headers are fixed at template creation via
    // header_handle — no image parameter is sent at send-time. Only text
    // placeholders within the header require a parameter here.
    const headerParameters: MessengerTemplateComponentParameter[] =
      params.header
        .filter((param) => param.type === "text")
        .map((param) => {
          const textParam: MessengerTemplateComponentParameter = {
            type: "text" as const,
            text: param.text ?? "",
          }
          if (parameterFormat === "NAMED" && param.parameter_name) {
            textParam.parameter_name = param.parameter_name
          }
          return textParam
        })
    if (headerParameters.length > 0) {
      components.push({ type: "header", parameters: headerParameters })
    }
  }

  if (params.body && params.body.length > 0) {
    const bodyParameters: MessengerTemplateComponentParameter[] =
      params.body.map((param) => {
        const textParam: MessengerTemplateComponentParameter = {
          type: "text" as const,
          text: param.text,
        }
        if (parameterFormat === "NAMED" && param.parameter_name) {
          textParam.parameter_name = param.parameter_name
        }
        return textParam
      })
    components.push({ type: "body", parameters: bodyParameters })
  }

  const buttonParameters = buildButtonParameters(params, flowContext)
  if (buttonParameters.length > 0) {
    components.push({ type: "buttons", parameters: buttonParameters })
  }

  return components
}

function buildButtonParameters(
  params: MessengerTemplateParams,
  flowContext?: {
    flowId?: string
    flowVersionId?: string
    metadata?: MetadataPayload
    flowButtons?: ButtonStepProps[]
  },
): MessengerTemplateComponentParameter[] {
  const indexedParameters: Array<{
    index: number
    parameter: MessengerTemplateComponentParameter
  }> = []

  for (const [fallbackIndex, button] of (params.button ?? []).entries()) {
    const index = button.index ?? fallbackIndex

    if (button.sub_type === "url") {
      indexedParameters.push({
        index,
        parameter: { type: "URL", url: button.text ?? "" },
      })
    }

    if (button.sub_type === "phone_number") {
      indexedParameters.push({
        index,
        parameter: { type: "PHONE_NUMBER" },
      })
    }
  }

  const usedIndexes = new Set(
    indexedParameters.map((indexedParameter) => indexedParameter.index),
  )
  let nextPostbackIndex = 0
  const { flowId = "", flowVersionId, metadata } = flowContext ?? {}
  const broadcastId = extractMetadata("broadcastId", metadata)
  const sequenceStepId = extractMetadata("sequenceStepId", metadata)

  for (const button of flowContext?.flowButtons ?? []) {
    while (usedIndexes.has(nextPostbackIndex)) {
      nextPostbackIndex += 1
    }

    const payload =
      button.buttonType === buttonTypes.enum.startExternalFlow
        ? encodeButtonPayload({
            flowId: button.beforeStep.flowId,
            broadcastId,
            sequenceStepId,
          })
        : encodeButtonPayload({
            flowId,
            flowVersionId,
            buttonId: button.id,
            broadcastId,
            sequenceStepId,
          })

    indexedParameters.push({
      index: nextPostbackIndex,
      parameter: { type: "POSTBACK", payload },
    })
    usedIndexes.add(nextPostbackIndex)
  }

  return indexedParameters
    .sort((left, right) => left.index - right.index)
    .map((indexedParameter) => indexedParameter.parameter)
}
