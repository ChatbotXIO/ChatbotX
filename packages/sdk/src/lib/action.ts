import type { AuthValue } from "./auth"
import type { SendFlowStepData } from "./flow-step-data"
import type { ChannelSendFlowStepProps } from "./integration"

export type SendFlowStepProps<
  TAuth extends AuthValue,
  S extends SendFlowStepData = SendFlowStepData,
> = Omit<ChannelSendFlowStepProps<TAuth>, "data"> & {
  data: Omit<ChannelSendFlowStepProps<TAuth>["data"], "step"> & { step: S }
}
