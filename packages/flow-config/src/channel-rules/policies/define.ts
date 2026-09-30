import type { ChannelType } from "@chatbotx.io/utils/channel"
import { type StepType, stepTypes } from "../../steps/step-action"

export const CHANNEL_POLICY_VERSION = 1

export const stepSupport = {
  full: "full",
  noButtons: "noButtons",
  unsupported: "unsupported",
} as const

export type StepSupport = (typeof stepSupport)[keyof typeof stepSupport]

export type ChannelFlowPolicy = {
  limits: {
    buttonCount: number
    buttonLabel: number
    cardTitle?: number
    text: number
  }
  quickRepliesShareButtonSlots: boolean
  steps: Record<StepType, StepSupport>
}

type ChannelFlowPolicyDefinition = {
  limits: ChannelFlowPolicy["limits"]
  quickRepliesShareButtonSlots?: boolean
  noButtons?: readonly StepType[]
  unsupported?: readonly StepType[]
}

const createDefaultStepSupport = (): Record<StepType, StepSupport> =>
  Object.fromEntries(
    stepTypes.options.map((stepType) => [stepType, stepSupport.full]),
  ) as Record<StepType, StepSupport>

export const defineChannelFlowPolicy = (
  definition: ChannelFlowPolicyDefinition,
): ChannelFlowPolicy => {
  const steps = createDefaultStepSupport()

  for (const stepType of definition.noButtons ?? []) {
    steps[stepType] = stepSupport.noButtons
  }

  for (const stepType of definition.unsupported ?? []) {
    steps[stepType] = stepSupport.unsupported
  }

  return {
    limits: definition.limits,
    quickRepliesShareButtonSlots:
      definition.quickRepliesShareButtonSlots ?? false,
    steps,
  }
}

export const whatsappOnlyStepTypes = [
  stepTypes.enum.sendWaTemplateMessage,
  stepTypes.enum.whatsappOptionList,
  stepTypes.enum.whatsappCallButton,
  stepTypes.enum.whatsappFlow,
] as const satisfies readonly StepType[]

export type ChannelFlowPolicyMap = Record<ChannelType, ChannelFlowPolicy>
