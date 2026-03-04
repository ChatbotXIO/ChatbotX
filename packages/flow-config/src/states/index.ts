import { createId } from "@paralleldrive/cuid2"
import z from "zod"

export const stateTypes = {
  success: "success",
  error: "error",
  skip: "skip",
} as const
export type StateType = (typeof stateTypes)[keyof typeof stateTypes]

const baseStateSchema = z.object({
  id: z.cuid2(),
  stateType: z.string().pipe(z.enum(stateTypes)),
})
export type BaseStateSchema = z.infer<typeof baseStateSchema>

export const successStateSchema = baseStateSchema.extend({
  stateType: z.literal(stateTypes.success),
})
export type SuccessStateSchema = z.infer<typeof successStateSchema>

export const successStateDefaultFn = () => ({
  id: createId(),
  stateType: stateTypes.success,
})

export const errorStateSchema = baseStateSchema.extend({
  stateType: z.literal(stateTypes.error),
})
export type ErrorStateSchema = z.infer<typeof errorStateSchema>

export const errorStateDefaultFn = () => ({
  id: createId(),
  stateType: stateTypes.error,
})

export const skipStateSchema = baseStateSchema.extend({
  stateType: z.literal(stateTypes.skip),
})
export type SkipStateSchema = z.infer<typeof skipStateSchema>

export const skipStateDefaultFn = () => ({
  id: createId(),
  stateType: stateTypes.skip,
})
