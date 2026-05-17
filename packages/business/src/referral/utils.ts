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
    case "reflink": {
      return params.name // keep the name as is
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

    return { type: "reflink", name: ref }
  } catch (error) {
    logger.error(error, `Unable to decode ref: ${ref}`)
    return
  }
}
