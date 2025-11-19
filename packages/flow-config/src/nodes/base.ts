import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const NodeType = {
  sendMessage: "N01",
  startFlow: "N02",
  performAction: "N03",
  condition: "N04",
  sendMail: "N05",
  splitTraffic: "N06",
  wait: "N07",
  landingPage: "N08",
  addNotes: "N09",
} as const
export type NodeType = (typeof NodeType)[keyof typeof NodeType]

export type NewNodeProps = {
  id?: string
  labelVersion: number
  position: { x: number; y: number }
  measured?: { width: number; height: number }
}

export const baseNodeSchema = z.object({
  id: z.cuid2(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  measured: z.object({
    width: z.number(),
    height: z.number(),
  }),
  data: z.object({
    name: z.string().trim().min(1).max(255),
    isStartNode: z.boolean(),
    beforeStep: z.any().nullish(),
    afterStep: z.any().nullish(),
    steps: z.array(z.any()).nullish(),
  }),
})

export type BaseNodeSchema = typeof baseNodeSchema
export type BaseNodeProps = z.infer<typeof baseNodeSchema> & {
  type: NodeType
}

export type NodePosition = { x: number; y: number }

export type NodeMeasured = { width: number; height: number }

export type DefaultNodeFnProps<T extends BaseNodeProps> = {
  id?: string
  position?: NodePosition
  measured?: NodeMeasured
  name: string
  type: T["type"]
  beforeStep?: T["data"]["beforeStep"] | undefined
  afterStep?: T["data"]["afterStep"] | undefined
  steps?: T["data"]["steps"] | undefined
}

export type NodeFnProps<T extends BaseNodeProps> = Pick<
  DefaultNodeFnProps<T>,
  "name" | "position" | "measured"
>

export const baseNodeDefaultFn = <T extends BaseNodeProps>(
  props: DefaultNodeFnProps<T>,
): T => {
  const {
    name,
    type,
    beforeStep = null,
    afterStep = null,
    steps = null,
    ...rest
  } = props

  return {
    id: createId(),
    type: props.type,
    position: { x: 100, y: 100 },
    measured: { width: 288, height: 100 },
    ...rest,
    data: {
      name: props.name,
      isStartNode: false,
      beforeStep,
      steps,
      afterStep,
    },
  } as T
}
