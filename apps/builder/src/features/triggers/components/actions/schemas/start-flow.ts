import { TriggerAction } from "@aha.chat/database/enums"
import z from "zod"

export const startFlow = z.object({
  type: z.literal(TriggerAction.startAnotherFlow),
  flowId: z.cuid2(),
})
export type StartFlow = z.infer<typeof startFlow>

export const defaultFn = (): StartFlow => ({
  type: TriggerAction.startAnotherFlow,
  flowId: "",
})
