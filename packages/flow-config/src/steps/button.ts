import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { actionSteps } from "../shared"
import { openWebsiteStepSchema } from "./open-website"
import { startAnotherNodeStepSchema } from "./start-another-node"
import { startExternalFlowStepSchema } from "./start-external-flow"
import { startExternalNodeStepSchema } from "./start-external-node"

export const ButtonType = {
  SendMessage: "BT1",
  OpenWebsite: "BT2",
  PerformAction: "BT3",
  StartExternalFlow: "BT4",
  StartExternalNode: "BT5",
  StartAnotherNode: "BT6",
} as const
export type ButtonType = (typeof ButtonType)[keyof typeof ButtonType]

export const buttonStepSchema = z
  .object({
    id: z.cuid2(),
    label: z.string().min(1).max(20),
  })
  .and(
    z.discriminatedUnion("buttonType", [
      z.object({
        buttonType: z.literal(ButtonType.SendMessage),
        beforeStep: startAnotherNodeStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(ButtonType.OpenWebsite),
        beforeStep: openWebsiteStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(ButtonType.PerformAction),
        beforeStep: startAnotherNodeStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(ButtonType.StartExternalFlow),
        beforeStep: startExternalFlowStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(ButtonType.StartExternalNode),
        beforeStep: startExternalNodeStepSchema,
        steps: z.array(z.union(actionSteps)),
      }),
      z.object({
        buttonType: z.literal(ButtonType.StartAnotherNode),
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
