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
