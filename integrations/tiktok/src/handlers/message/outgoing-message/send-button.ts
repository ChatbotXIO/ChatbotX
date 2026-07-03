import {
  appendCodeToMagicLink,
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { chunk } from "remeda"
import type {
  TiktokMessageTemplate,
  TiktokTemplateButton,
} from "../../../schema"

export const MAX_TEMPLATE_BUTTONS = 3
export const BUTTON_CARD_TITLE_MAX = 20
export const LINK_CARD_TITLE_MAX = 40

type TiktokTemplateType = TiktokMessageTemplate["type"]

type TiktokButtonTemplateGroup = {
  templateType: TiktokTemplateType
  button: TiktokTemplateButton
}

export function getButtonTemplate(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
  metadata?: MetadataPayload
  contactInboxId?: string
}): TiktokTemplateButton {
  const { flowId, flowVersionId, button, metadata, contactInboxId } = props

  const buttonPayload = encodeButtonPayload({
    flowId,
    flowVersionId,
    buttonId: button.id,
    broadcastId: extractMetadata("broadcastId", metadata),
    sequenceStepId: extractMetadata("sequenceStepId", metadata),
    contactInboxId,
  })

  if (button.buttonType === buttonTypes.enum.openWebsite) {
    return {
      type: "REPLY",
      title: button.label.slice(0, LINK_CARD_TITLE_MAX),
      id: appendCodeToMagicLink(button.beforeStep.url, buttonPayload),
    }
  }

  return {
    type: "REPLY",
    title: button.label.slice(0, BUTTON_CARD_TITLE_MAX),
    id: buttonPayload,
  }
}

export function buildTiktokTemplates(props: {
  title: string
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  metadata?: MetadataPayload
  contactInboxId?: string
}): TiktokMessageTemplate[] {
  const { title, buttons, ...rest } = props

  const replyButtons = buttons.filter(
    (b) => b.buttonType !== buttonTypes.enum.openWebsite,
  )
  const linkButtons = buttons.filter(
    (b) => b.buttonType === buttonTypes.enum.openWebsite,
  )

  const templates: TiktokMessageTemplate[] = []

  for (const group of chunk(replyButtons, MAX_TEMPLATE_BUTTONS)) {
    templates.push({
      type: "QA_BUTTON_CARD",
      title,
      buttons: group.map((button) => getButtonTemplate({ ...rest, button })),
    })
  }

  for (const group of chunk(linkButtons, MAX_TEMPLATE_BUTTONS)) {
    templates.push({
      type: "QA_LINK_CARD",
      title,
      buttons: group.map((button) => getButtonTemplate({ ...rest, button })),
    })
  }

  return templates
}

export function getButtonTemplateGroup(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
  metadata?: MetadataPayload
  contactInboxId?: string
}): TiktokButtonTemplateGroup {
  return {
    templateType:
      props.button.buttonType === buttonTypes.enum.openWebsite
        ? "QA_LINK_CARD"
        : "QA_BUTTON_CARD",
    button: getButtonTemplate(props),
  }
}

export function getCanonicalButtonTemplate(
  button: MessageButtonTemplate,
): TiktokTemplateButton {
  if (button.buttonType === "url") {
    return {
      type: "REPLY",
      title: button.label.slice(0, LINK_CARD_TITLE_MAX),
      id: button.url,
    }
  }

  return {
    type: "REPLY",
    title: button.label.slice(0, BUTTON_CARD_TITLE_MAX),
    id: button.postback,
  }
}

export function getCanonicalButtonTemplateGroup(
  button: MessageButtonTemplate,
): TiktokButtonTemplateGroup {
  return {
    templateType:
      button.buttonType === "url" ? "QA_LINK_CARD" : "QA_BUTTON_CARD",
    button: getCanonicalButtonTemplate(button),
  }
}

export function buildTiktokTemplatesFromGroups(props: {
  title: string
  groups: TiktokButtonTemplateGroup[]
}): TiktokMessageTemplate[] {
  const templates: TiktokMessageTemplate[] = []

  for (const templateType of ["QA_BUTTON_CARD", "QA_LINK_CARD"] as const) {
    const buttons = props.groups
      .filter((group) => group.templateType === templateType)
      .map((group) => group.button)

    for (const group of chunk(buttons, MAX_TEMPLATE_BUTTONS)) {
      templates.push({
        type: templateType,
        title: props.title,
        buttons: group,
      })
    }
  }

  return templates
}
