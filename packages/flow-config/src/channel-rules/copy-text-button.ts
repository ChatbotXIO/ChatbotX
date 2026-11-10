import { type ButtonStepProps, buttonTypes } from "../steps/button"
import { isCopyableText } from "../steps/copy-text"
import { isNativeButtonType } from "./policies"

type CopyTextButton = Extract<ButtonStepProps, { buttonType: "copyText" }>

export const isCopyTextButton = (
  button: Pick<ButtonStepProps, "buttonType">,
): button is CopyTextButton => button.buttonType === buttonTypes.enum.copyText

/**
 * Whether a Copy Text button goes out as the channel's own copy control. Read
 * after variables are resolved: a channel that cannot copy, or a resolved text
 * that is empty or longer than the channel copies, sends the button as a reply
 * instead, and the tap answers with the text (see the `copyText` step
 * handler). Every encoder and the stored message decide through this one
 * check, so what is sent and what is stored never disagree.
 */
export const sendsAsNativeCopyButton = (
  channel: string | null | undefined,
  button: ButtonStepProps,
): button is CopyTextButton =>
  isCopyTextButton(button) &&
  isNativeButtonType(channel, buttonTypes.enum.copyText) &&
  isCopyableText(button.beforeStep.text)
