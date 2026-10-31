import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { countMessageCharacters } from "../channel-rules/characters"
import { actionSteps } from "../shared"
import {
  type FlowValidationCode,
  flowValidationCodes,
} from "../validation-codes"
import { BUTTON_LABEL_MAX } from "./button-limits"
import { callPhoneNumberStepSchema } from "./call-phone-number"
import { openMiniAppStepSchema } from "./open-mini-app"
import { openWebsiteStepSchema } from "./open-website"
import { startAnotherNodeStepSchema } from "./start-another-node"
import { startExternalFlowStepSchema } from "./start-external-flow"
import { startExternalNodeStepSchema } from "./start-external-node"

export const buttonTypes = z.enum([
  "sendMessage",
  "openWebsite",
  "performAction",
  "startExternalFlow",
  "startExternalNode",
  "startAnotherNode",
  "whatsappOptionList",
  "openMiniApp",
  "callPhoneNumber",
])
export type ButtonType = z.infer<typeof buttonTypes>

export { BUTTON_LABEL_MAX } from "./button-limits"

export const buttonStepSchema = z
  .object({
    id: zodBigintAsString().describe(
      "Button id (numeric string). Also the `sourceHandle` of the edge that routes the button to its next node.",
    ),
    label: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => countMessageCharacters(value) <= BUTTON_LABEL_MAX,
        flowValidationCodes.constraintExceeded,
      )
      .meta({
        description: `Button label shown to the contact (max ${BUTTON_LABEL_MAX} characters).`,
        maxLength: BUTTON_LABEL_MAX,
      }),
  })
  .and(
    z.discriminatedUnion("buttonType", [
      z.object({
        buttonType: z.literal(buttonTypes.enum.sendMessage),
        beforeStep: startAnotherNodeStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(buttonTypes.enum.openWebsite),
        beforeStep: openWebsiteStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(buttonTypes.enum.performAction),
        beforeStep: startAnotherNodeStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(buttonTypes.enum.startExternalFlow),
        beforeStep: startExternalFlowStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(buttonTypes.enum.startExternalNode),
        beforeStep: startExternalNodeStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(buttonTypes.enum.whatsappOptionList),
        beforeStep: z.null(),
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(buttonTypes.enum.startAnotherNode),
        beforeStep: startAnotherNodeStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(buttonTypes.enum.openMiniApp),
        beforeStep: openMiniAppStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      // A call button is answered on the contact's device and never reaches
      // the bot on a native channel, so it can neither continue the flow nor
      // run follow-up steps.
      z.object({
        buttonType: z.literal(buttonTypes.enum.callPhoneNumber),
        beforeStep: callPhoneNumberStepSchema,
        steps: z.array(z.union(actionSteps)).max(0),
      }),
      z.object({
        buttonType: z.literal(null),
        beforeStep: z.null(),
        steps: z.array(z.any()),
      }),
    ]),
  )
export type ButtonStepProps = z.infer<typeof buttonStepSchema>
export type ButtonStepInput = z.input<typeof buttonStepSchema>

/**
 * The URL an `openWebsite` button opens, or `undefined` for every other
 * button type. Channel-neutral on purpose — WhatsApp's cta_url message and
 * the carousel card link both narrow the same discriminated union to decide
 * whether a button carries a link instead of a reply.
 */
export const getButtonLinkUrl = (
  button: ButtonStepProps,
): string | undefined =>
  button.buttonType === buttonTypes.enum.openWebsite
    ? button.beforeStep.url
    : undefined

/**
 * Whether the contact sees this button as a link. `openMiniApp` has no URL
 * until the worker turns it into an `openWebsite` link at send time, so rules
 * checked at publish must count it as a link too — or publish and send would
 * classify the same button differently.
 */
export const isLinkButton = (button: Pick<ButtonStepProps, "buttonType">) =>
  button.buttonType === buttonTypes.enum.openWebsite ||
  button.buttonType === buttonTypes.enum.openMiniApp

/**
 * Rejects one button type on a step whose buttons are sent in a form that
 * cannot carry it (e.g. a WhatsApp message template step sends its buttons as
 * the template's own quick replies and never passes through the worker's Mini
 * App link rewrite, so an `openMiniApp` button would continue the flow on tap
 * without opening anything). Each step picks its own refiners — a Messenger
 * template step, for instance, allows Open Mini App.
 */
const refineDisallowedButtonType =
  (
    disallowedType: ButtonType,
    message: FlowValidationCode,
  ): ((
    buttons: Pick<ButtonStepProps, "buttonType">[],
    ctx: z.RefinementCtx,
  ) => void) =>
  (buttons, ctx) => {
    for (const [index, button] of buttons.entries()) {
      if (button.buttonType === disallowedType) {
        ctx.addIssue({
          code: "custom",
          message,
          path: [index, "buttonType"],
        })
      }
    }
  }

/** WhatsApp template step: its buttons never pass the Mini App link rewrite. */
export const refineNoOpenMiniAppButtons = refineDisallowedButtonType(
  buttonTypes.enum.openMiniApp,
  flowValidationCodes.templateButtonOpenMiniAppUnsupported,
)

/** Surfaces whose buttons are sent as replies, which cannot dial. */
export const refineNoCallPhoneNumberButtons = refineDisallowedButtonType(
  buttonTypes.enum.callPhoneNumber,
  flowValidationCodes.buttonCallPhoneNumberUnsupported,
)

export const buttonStepDefaultFn = (
  props?: Pick<ButtonStepProps, "label">,
): ButtonStepProps => ({
  id: createId(),
  label: "",
  buttonType: null,
  beforeStep: null,
  steps: [],
  ...props,
})

/**
 * Reconciles template-derived buttons with the buttons a user already
 * configured on the step, pairing by position. The existing button always
 * keeps its id and configured action (buttonType/beforeStep/steps) so edges
 * and behavior survive template edits; only the label follows the template.
 * Returns the existing object untouched when nothing changes, so callers can
 * detect a no-op reseed by reference equality.
 */
export function mergeTemplateButtonsWithExisting(
  templateButtons: ButtonStepProps[],
  existingButtons: ButtonStepProps[] = [],
): ButtonStepProps[] {
  return templateButtons.map((templateButton, index) => {
    const existingButton = existingButtons[index]

    if (!existingButton) {
      return templateButton
    }
    if (existingButton.label === templateButton.label) {
      return existingButton
    }

    return {
      ...existingButton,
      label: templateButton.label,
    }
  })
}
