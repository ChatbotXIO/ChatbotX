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

export const encodeButtonPayload = (props: ButtonPayload): string => {
  const parts = [
    props.flowId,
    props.flowVersionId ?? "",
    props.buttonId ?? "",
    props.broadcastId ?? "",
    props.sequenceStepId ?? "",
    props.contactInboxId ?? "",
  ]
  while (parts.length > 2 && parts.at(-1) === "") {
    parts.pop()
  }
  return parts.join(":")
}

// Numeric snowflake ID (createId in @chatbotx.io/utils): every ID generated
// since the 2004 epoch is at least 13 digits. Length alone is not enough — a
// 19-digit string can exceed the signed bigint the flow ID column holds — so
// also cap the value at the bigint maximum.
const BARE_FLOW_ID_REGEX = /^\d{13,19}$/
const MAX_SIGNED_BIGINT = 9223372036854775807n

export const decodeButtonPayload = (
  payload: string,
  options?: { allowBareFlowId?: boolean },
): ButtonPayload | null => {
  try {
    // Bare numeric flow ID (Messenger ad payloads) — opt-in only, so every
    // other call site keeps rejecting plain numbers.
    if (
      options?.allowBareFlowId &&
      BARE_FLOW_ID_REGEX.test(payload) &&
      BigInt(payload) <= MAX_SIGNED_BIGINT
    ) {
      return buttonPayloadSchema.parse({ f: payload })
    }
    if (payload.includes(":")) {
      const [f, fv, b, br, ss, cid] = payload.split(":")
      return buttonPayloadSchema.parse({
        f,
        fv: fv || undefined,
        b: b || undefined,
        br: br || undefined,
        ss: ss || undefined,
        cid: cid || undefined,
      })
    }
    // Legacy format: base64+JSON (payloads encoded before the colon format)
    return buttonPayloadSchema.parse(JSON.parse(atob(payload)))
  } catch {
    return null
  }
}

const MAGIC_LINK_PATHNAME_REGEX = /^\/r\/[^/]+\/[^/]+/
export const isMagicLinkUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url)

    return MAGIC_LINK_PATHNAME_REGEX.test(urlObj.pathname)
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
