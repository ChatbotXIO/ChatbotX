import {
  type ButtonStepProps,
  buttonStepDefaultFn,
  buttonTypes,
  countMessageCharacters,
  isNativeButtonType,
  normalizeDialablePhoneNumber,
  resolveSendTextLengthLimits,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepData } from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"
import { mapStepButtons, readStepButtons } from "./step-buttons"

type CallPhoneNumberButton = Extract<
  ButtonStepProps,
  { buttonType: "callPhoneNumber" }
>

const isCallPhoneNumberButton = (
  button: ButtonStepProps,
): button is CallPhoneNumberButton =>
  button.buttonType === buttonTypes.enum.callPhoneNumber

/** "{label} {number}" when it fits the channel's button label limit, else the number alone. */
const toFallbackLabel = (
  label: string,
  number: string,
  labelLimit: number,
): string => {
  const withNumber = `${label} ${number}`
  return countMessageCharacters(withNumber) <= labelLimit ? withNumber : number
}

type CallButtonContext = {
  workspaceId: string
  flowId: string
  isNative: boolean
  labelLimit: number
}

/**
 * One call button ready to send: the number normalised to E.164 and, on a
 * channel without a native call control, shown in the title because tapping
 * only replies with it (see the `callPhoneNumber` step handler). An invalid or
 * empty number degrades to an inert button instead of being dropped, so card
 * button counts and carousel signatures stay equal.
 */
const prepareCallButton = (
  button: CallPhoneNumberButton,
  context: CallButtonContext,
): ButtonStepProps => {
  const number = normalizeDialablePhoneNumber(button.beforeStep.phoneNumber)
  if (!number) {
    logger.warn(
      {
        workspaceId: context.workspaceId,
        flowId: context.flowId,
        buttonId: button.id,
      },
      "Sending a Call Phone Number button without an action: its number is not a valid international number",
    )
    return { ...buttonStepDefaultFn({ label: button.label }), id: button.id }
  }

  return {
    ...button,
    label: context.isNative
      ? button.label
      : toFallbackLabel(button.label, number, context.labelLimit),
    beforeStep: { ...button.beforeStep, phoneNumber: number },
  }
}

/**
 * Prepares every Call Phone Number button of a step (its own and its cards')
 * for sending. Runs after variables are resolved, so the number is final.
 * Does nothing — no copy — when the step has no such button.
 */
export const resolveCallPhoneButtons = async (props: {
  workspaceId: string
  flowId: string
  channel: string
  step: SendFlowStepData
}): Promise<SendFlowStepData> => {
  if (!readStepButtons(props.step).some(isCallPhoneNumberButton)) {
    return props.step
  }

  const context: CallButtonContext = {
    workspaceId: props.workspaceId,
    flowId: props.flowId,
    isNative: isNativeButtonType(
      props.channel,
      buttonTypes.enum.callPhoneNumber,
    ),
    labelLimit: resolveSendTextLengthLimits({ channel: props.channel })
      .buttonLabel,
  }

  return await mapStepButtons(props.step, (buttons) =>
    buttons.map((button) =>
      isCallPhoneNumberButton(button)
        ? prepareCallButton(button, context)
        : button,
    ),
  )
}
