import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import type { FlowNode } from "./nodes"
import type { BaseStepSchema } from "./steps/base"
import type { ButtonStepProps } from "./steps/button"
import type { SendCardStepSchema } from "./steps/send-card"
import type { WhatsappOptionListItem } from "./steps/whatsapp-option-list"

export const extractMetadata = (
  key: string,
  metadata?: { [key: string]: string },
): string | undefined => {
  if (!metadata) {
    return
  }

  return metadata[key] || undefined
}

export const buttonPayloadSchema = z
  .object({
    f: zodBigintAsString(),
    fv: zodBigintAsString().optional(),
    b: zodBigintAsString().optional(),
    br: zodBigintAsString().optional(),
    ss: zodBigintAsString().optional(),
    cid: zodBigintAsString().optional(),
  })
  .transform((data) => ({
    flowId: data.f,
    ...(data.fv ? { flowVersionId: data.fv } : {}),
    ...(data.b ? { buttonId: data.b } : {}),
    ...(data.br ? { broadcastId: data.br } : {}),
    ...(data.ss ? { sequenceStepId: data.ss } : {}),
    ...(data.cid ? { contactInboxId: data.cid } : {}),
  }))
export type ButtonPayload = z.infer<typeof buttonPayloadSchema>

export const encodeButtonPayload = (props: ButtonPayload) =>
  btoa(
    JSON.stringify({
      f: props.flowId,
      fv: props.flowVersionId,
      b: props.buttonId,
      br: props.broadcastId,
      ss: props.sequenceStepId,
      cid: props.contactInboxId,
    }),
  )

export const decodeButtonPayload = (payload: string): ButtonPayload | null => {
  try {
    return buttonPayloadSchema.parse(JSON.parse(atob(payload)))
  } catch {
    return null
  }
}

const MAGIC_LINK_PATHNAME_REGEX = /^\/r\/[^/]+\/[^/]+/
export const isMagicLinkUrl = (url: string): boolean => {
  // TODO: get platform domain from config instead of hardcoding builder url
  const builderUrl = process.env.NEXT_PUBLIC_BUILDER_URL
  if (!builderUrl) {
    return false
  }

  try {
    const urlObj = new URL(url)
    const builderUrlObj = new URL(builderUrl)

    return (
      urlObj.host === builderUrlObj.host &&
      MAGIC_LINK_PATHNAME_REGEX.test(urlObj.pathname)
    )
  } catch {
    return false
  }
}

export const appendCodeToMagicLink = (url: string, code: string): string => {
  if (!isMagicLinkUrl(url)) {
    return url
  }

  const urlObj = new URL(url)
  urlObj.searchParams.set("code", code)
  return urlObj.toString()
}

export function getNodeFromButton(nodes: FlowNode[], buttonId: string) {
  let foundedButton: ButtonStepProps | null = null
  let foundedNodeId: string | null = null

  for (const node of nodes) {
    if (!("steps" in node.data.details && node.data.details.steps)) {
      continue
    }
    for (const step of node.data.details.steps as BaseStepSchema[]) {
      if (!("buttons" in step || "cards" in step || "options" in step)) {
        continue
      }

      let buttons: ButtonStepProps[] = []
      if ("buttons" in step) {
        buttons = step.buttons as ButtonStepProps[]
      } else if ("cards" in step) {
        const cards = step.cards as SendCardStepSchema[]
        buttons = cards.flatMap(
          (card) => (card.buttons ?? []) as ButtonStepProps[],
        )
      }

      const button = buttons.find((b) => b.id === buttonId)
      if (button) {
        foundedButton = button
        foundedNodeId = step.nodeId ?? node.id
        break
      }

      if ("options" in step) {
        const options = (step.options ?? []) as WhatsappOptionListItem[]
        const option = options.find((o) => o.id === buttonId)
        if (option) {
          foundedButton = {
            id: option.id,
            label: option.title,
            buttonType: null,
            beforeStep: null,
            steps: [],
          }
          foundedNodeId = step.nodeId ?? node.id
          break
        }
      }
    }
    if (foundedButton) {
      break
    }
  }

  return {
    button: foundedButton,
    nodeId: foundedNodeId,
  }
}
