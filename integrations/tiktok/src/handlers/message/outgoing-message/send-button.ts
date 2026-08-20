import {
  appendCodeToMagicLink,
  BUTTON_LABEL_MAX,
  type ButtonStepProps,
  buttonTypes,
  encodeButtonPayload,
  extractMetadata,
  type MetadataPayload,
  TIKTOK_CARD_TITLE_MAX,
} from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { chunk } from "remeda"
import { logger } from "../../../lib/logger"
import type {
  TiktokMessageTemplate,
  TiktokTemplateButton,
} from "../../../schema"

export const MAX_TEMPLATE_BUTTONS = 3

// TIKTOK_CARD_TITLE_MAX (shared with the flow editor via @chatbotx.io/flow-config)
// bounds the card `title` (the message text) — a different field from the
// button label, which is always clamped to BUTTON_LABEL_MAX instead. Labels
// from ButtonStepProps are already bounded to BUTTON_LABEL_MAX by the
// flow-config button schema; labels from a canonical MessageButtonTemplate
// (SDK-driven sends) have no such enforcement, so they're clamped here too,
// as a safety net.

// String#slice cuts by UTF-16 code unit, which can split a surrogate pair
// (e.g. an emoji) in half and send TikTok a malformed title/label. Skip the
// code-point split entirely when the UTF-16 length already fits — a string
// can only need trimming when it's longer than that to begin with.
function truncateText(text: string, max: number): string {
  return text.length <= max ? text : Array.from(text).slice(0, max).join("")
}

const CARD_TYPES = ["QA_BUTTON_CARD", "QA_LINK_CARD"] as const

// TikTok rejects the whole send once the title is over-length, so truncating
// is what makes the message go out at all — but the tail is still silently
// lost, and this log is the only place that loss is visible.
function warnIfTitleTruncated(
  title: string,
  context: Record<string, unknown>,
): void {
  if (Array.from(title).length > TIKTOK_CARD_TITLE_MAX) {
    logger.warn(
      context,
      `TikTok message text exceeds ${TIKTOK_CARD_TITLE_MAX} chars with buttons attached; truncating card title`,
    )
  }
}

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
      title: truncateText(button.label, BUTTON_LABEL_MAX),
      id: appendCodeToMagicLink(button.beforeStep.url, buttonPayload),
    }
  }

  return {
    type: "REPLY",
    title: truncateText(button.label, BUTTON_LABEL_MAX),
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

  if (buttons.length > 0) {
    warnIfTitleTruncated(title, {
      flowId: rest.flowId,
      flowVersionId: rest.flowVersionId,
    })
  }
  const truncatedTitle = truncateText(title, TIKTOK_CARD_TITLE_MAX)

  const buttonsByCardType: Record<
    (typeof CARD_TYPES)[number],
    ButtonStepProps[]
  > = {
    QA_BUTTON_CARD: buttons.filter(
      (b) => b.buttonType !== buttonTypes.enum.openWebsite,
    ),
    QA_LINK_CARD: buttons.filter(
      (b) => b.buttonType === buttonTypes.enum.openWebsite,
    ),
  }

  const templates: TiktokMessageTemplate[] = []

  for (const type of CARD_TYPES) {
    for (const group of chunk(buttonsByCardType[type], MAX_TEMPLATE_BUTTONS)) {
      templates.push({
        type,
        title: truncatedTitle,
        buttons: group.map((button) => getButtonTemplate({ ...rest, button })),
      })
    }
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
      title: truncateText(button.label, BUTTON_LABEL_MAX),
      id: button.url,
    }
  }

  return {
    type: "REPLY",
    title: truncateText(button.label, BUTTON_LABEL_MAX),
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
  if (props.groups.length > 0) {
    warnIfTitleTruncated(props.title, { buttonCount: props.groups.length })
  }
  const truncatedTitle = truncateText(props.title, TIKTOK_CARD_TITLE_MAX)

  const templates: TiktokMessageTemplate[] = []

  for (const templateType of CARD_TYPES) {
    const buttons = props.groups
      .filter((group) => group.templateType === templateType)
      .map((group) => group.button)

    for (const group of chunk(buttons, MAX_TEMPLATE_BUTTONS)) {
      templates.push({
        type: templateType,
        title: truncatedTitle,
        buttons: group,
      })
    }
  }

  return templates
}
