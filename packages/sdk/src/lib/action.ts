import type { AuthValue } from "./auth"
import type { SendFlowStepData } from "./flow-step-data"
import type { ChannelSendFlowStepProps } from "./integration"

export type SendFlowStepProps<
  TAuth extends AuthValue,
  S extends SendFlowStepData = SendFlowStepData,
> = ChannelSendFlowStepProps<TAuth> & { data: { step: S } }
