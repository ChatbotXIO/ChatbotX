import { decodeBase62, encodeBase62 } from "@chatbotx.io/utils"
import { z } from "zod"
import { logger } from "../logger"

const configs = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("flow"),
    flowId: z.string(),
    nodeId: z.string().optional(),
  }),
  z.object({
    type: z.literal("draft"),
    flowId: z.string(),
  }),
  z.object({
    type: z.literal("minigame-share"),
    minigameId: z.string(),
    referrerContactId: z.string(),
  }),
  z.object({
    type: z.literal("qr-code"),
    name: z.string(),
  }),
  z.object({
    type: z.literal("reflink"),
    name: z.string(),
  }),
])
export type RefConfig = z.infer<typeof configs>

export function encodeRef(params: RefConfig): string {
  switch (params.type) {
    case "flow": {
      return `f_${encodeBase62(params.flowId)}${params.nodeId ? `_${encodeBase62(params.nodeId)}` : ""}`
    }
    case "draft": {
      const { flowId } = params
      return `d_${encodeBase62(flowId)}`
    }
    case "minigame-share": {
      return `mg_${encodeBase62(params.minigameId)}_${encodeBase62(params.referrerContactId)}`
    }
    case "qr-code": {
      return `qr_${params.name}`
    }
    case "reflink": {
      return params.name
    }
    default:
      return ""
  }
}

export function decodeRef(ref: string): RefConfig | undefined {
  try {
    if (ref.startsWith("f_")) {
      const [flowId, nodeId] = ref.slice(2).split("_")
      return {
        type: "flow",
        flowId: decodeBase62(flowId),
        nodeId: nodeId ? decodeBase62(nodeId) : undefined,
      }
    }

    if (ref.startsWith("d_")) {
      return { type: "draft", flowId: decodeBase62(ref.slice(2)) }
    }

    if (ref.startsWith("mg_")) {
      const [minigameId, referrerContactId] = ref.slice(3).split("_")
      // `decodeBase62("")` returns "0" WITHOUT throwing (the loop never runs,
      // so `0n.toString()` falls out), which would silently resolve "mg__x"
      // to minigame "0". The `f_` branch above has the same latent bug — do
      // not copy it here.
      if (!(minigameId && referrerContactId)) {
        return
      }
      return {
        type: "minigame-share",
        minigameId: decodeBase62(minigameId),
        referrerContactId: decodeBase62(referrerContactId),
      }
    }

    if (ref.startsWith("qr_")) {
      return { type: "qr-code", name: ref.slice(3) }
    }

    return { type: "reflink", name: ref }
  } catch (error) {
    logger.error(error, `Unable to decode ref: ${ref}`)
    return
  }
}
