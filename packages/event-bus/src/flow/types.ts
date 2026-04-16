import type { z } from "zod"
import type { BaseEventListener, BaseEventType, InferEventMap } from "../types"
import type { clickedPayloadSchema, flowEventSchemas } from "./schemas"

export const FlowEventType: BaseEventType = {
  CLICKED: "flow:clicked",
} as const

export type FlowEventType = (typeof FlowEventType)[keyof typeof FlowEventType]

export type FlowEventMap = InferEventMap<typeof flowEventSchemas>
export type FlowPayload = FlowEventMap[FlowEventType]

export type FlowClickedPayload = z.infer<typeof clickedPayloadSchema>

export interface FlowEventListener extends BaseEventListener<FlowPayload> {}

export type FlowEvenTypeMap = Record<FlowEventType, FlowEventListener[]>
