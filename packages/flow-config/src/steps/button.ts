import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { actionSteps } from "../shared"
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
])
export type ButtonType = z.infer<typeof buttonTypes>

export const BUTTON_LABEL_MAX = 20

export const buttonStepSchema = z
  .object({
    id: zodBigintAsString(),
    label: z.string().min(1).max(BUTTON_LABEL_MAX),
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
