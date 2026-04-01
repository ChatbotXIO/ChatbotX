import { TriggerAction } from "@chatbotx.io/database/enums"
import z from "zod"

export const startFlow = z.object({
  type: z.literal(TriggerAction.startAnotherFlow),
  flowId: z.bigint(),
})
export type StartFlow = z.infer<typeof startFlow>

export const defaultFn = (): StartFlow => ({
  type: TriggerAction.startAnotherFlow,
  flowId: "",
})
