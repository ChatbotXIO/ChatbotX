import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import type { FlowNode } from "./nodes"
import { findButtonInNodes } from "./routable-handle"
import type { ButtonStepProps } from "./steps/button"

export const extractMetadata = (
  key: string,
  metadata?: { [key: string]: string },
): string | undefined => {
  if (!metadata) {
    return
  }

  return metadata[key] || undefined
}

// Numeric snowflake ID (createId in @chatbotx.io/utils): every ID generated
// since the 2004 epoch is at least 13 digits. Length alone is not enough — a
// 19-digit string can exceed the signed bigint the flow ID column holds — so
// also cap the value at the bigint maximum.
const BARE_FLOW_ID_REGEX = /^\d{13,19}$/
const MAX_SIGNED_BIGINT = 9223372036854775807n

/**
 * `zodBigintAsString()` (`@chatbotx.io/utils`) only checks that a digit
 * appears somewhere in the string, not that the whole string is digits —
 * `/\d+/.test("x1:y1:z1")` is `true`. That gap lets a colon-delimited payload
 * segment like `"x1"` decode successfully here and then crash when bound to
 * a `bigint` column (`invalid input syntax for type bigint`) — reachable from
 * untrusted webhook content (a WhatsApp `button.payload`, for example) since
 * every segment of this payload is meant to be a real bigint ID.
 *
 * Tightened locally rather than in the shared helper: `zodBigintAsString` is
 * used in ~280 files across the repo (`apps/builder` schemas, analytics,
 * business), so a global regex change needs its own, separately-scoped
 * verification rather than riding along with this fix. This also closes the
 * same class of gap the bare-flow-ID branch below already guards against
 * (a value that's all digits but exceeds the signed bigint range).
 */
const STRICT_DIGITS_REGEX = /^\d+$/
const isWithinSignedBigintRange = (value: string): boolean => {
  try {
    return BigInt(value) <= MAX_SIGNED_BIGINT
  } catch {
    return false
  }
}
const strictBigintAsString = () =>
  zodBigintAsString()
    .regex(STRICT_DIGITS_REGEX)
    .refine(isWithinSignedBigintRange, "Value exceeds the signed bigint range")

export const buttonPayloadSchema = z
  .object({
    f: strictBigintAsString(),
    fv: strictBigintAsString().optional(),
    b: strictBigintAsString().optional(),
    br: strictBigintAsString().optional(),
    ss: strictBigintAsString().optional(),
    cid: strictBigintAsString().optional(),
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
  const found = findButtonInNodes(nodes, buttonId)

  return {
    button: found?.button ?? null,
    nodeId: found?.runtimeNodeId ?? null,
  }
}

export function getNodeFromQuickReply(nodes: FlowNode[], quickReplyId: string) {
  for (const node of nodes) {
    if (
      !("quickReplies" in node.data.details && node.data.details.quickReplies)
    ) {
      continue
    }

    const quickReply = node.data.details.quickReplies.find(
      (reply) => reply.id === quickReplyId,
    )
    if (quickReply) {
      return { quickReply, nodeId: node.id }
    }
  }

  return { quickReply: null, nodeId: null }
}

export const flowActionTargetTypes = {
  /** A reply owned by a step: step buttons, card buttons, list options. */
  button: "button",
  /** A reply owned by the node, shared by every step it renders. */
  quickReply: "quickReply",
} as const

export type FlowActionTargetType =
  (typeof flowActionTargetTypes)[keyof typeof flowActionTargetTypes]

export type FlowActionTarget = {
  details: ButtonStepProps
  nodeId: string | null
  targetType: FlowActionTargetType
}

/**
 * Resolves the reply a contact tapped, wherever the builder put it.
 *
 * Only Messenger and Instagram tell buttons and quick replies apart on the way
 * in; WhatsApp, Zalo, Telegram and TikTok deliver both through a single webhook
 * field. Since the two are encoded with the same payload, the click alone can
 * never say which one it was — the flow is the only authority. Searching both
 * places keeps those channels routing to the next node instead of stalling.
 *
 * Step buttons win a tie: they were the only resolvable target before quick
 * replies were searched, so existing flows keep their behavior exactly.
 */
export function resolveFlowActionTarget(
  nodes: FlowNode[],
  actionId: string,
): FlowActionTarget | null {
  const { button, nodeId } = getNodeFromButton(nodes, actionId)
  if (button) {
    return {
      details: button,
      nodeId,
      targetType: flowActionTargetTypes.button,
    }
  }

  const { quickReply, nodeId: quickReplyNodeId } = getNodeFromQuickReply(
    nodes,
    actionId,
  )
  if (quickReply) {
    return {
      details: quickReply,
      nodeId: quickReplyNodeId,
      targetType: flowActionTargetTypes.quickReply,
    }
  }

  return null
}
