import { z } from "zod"

export const decisionProviderKinds = z.enum([
  "typesafe",
  "systemOneCompatible",
  "openrouterDecision",
])
export type DecisionProviderKind = z.infer<typeof decisionProviderKinds>

export const decisionConnectionStatuses = z.enum(["enabled", "disabled"])
export type DecisionConnectionStatus = z.infer<
  typeof decisionConnectionStatuses
>

export const decisionConnectionTestStatuses = z.enum(["passed", "failed"])
export type DecisionConnectionTestStatus = z.infer<
  typeof decisionConnectionTestStatuses
>

export const decisionProfileStatuses = z.enum(["enabled", "disabled"])
export type DecisionProfileStatus = z.infer<typeof decisionProfileStatuses>

export type DecisionProfileContractJsonValue =
  | boolean
  | null
  | number
  | string
  | DecisionProfileContractJson
  | DecisionProfileContractJsonValue[]

export type DecisionProfileContractJson = {
  [key: string]: DecisionProfileContractJsonValue
}
