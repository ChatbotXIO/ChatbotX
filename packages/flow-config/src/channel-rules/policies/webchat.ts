import { stepTypes } from "../../steps/step-action"
import {
  channelDeliverableStepTypes,
  defineChannelFlowPolicy,
  whatsappOnlyStepTypes,
} from "./define"
// Webchat retains the 6,000-character platform message limit.

export const webchatFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 6000,
  },
  supported: channelDeliverableStepTypes.filter(
    (stepType) =>
      stepType !== stepTypes.enum.sendMessengerTemplateMessage &&
      !whatsappOnlyStepTypes.includes(stepType as never),
  ),
  unsupported: [
    stepTypes.enum.sendMessengerTemplateMessage,
    ...whatsappOnlyStepTypes,
  ],
})
