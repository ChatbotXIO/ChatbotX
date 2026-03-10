export type TriggerSource =
  | "worker"
  | "api"
  | "webhook"
  | "scheduler"
  | "manual"

export interface TriggerContext {
  triggerHandler: string
  triggerSource: TriggerSource
  triggerType: string
}
