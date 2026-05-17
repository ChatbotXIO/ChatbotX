import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { actionSteps } from "../shared"
import { uploadModes } from "../types"
import { buttonTypes } from "./button"
import { openWebsiteStepSchema } from "./open-website"
import { startAnotherNodeStepSchema } from "./start-another-node"
import { startExternalFlowStepSchema } from "./start-external-flow"
import { startExternalNodeStepSchema } from "./start-external-node"
import { stepTypes } from "./step-action"

export const pageElementTypes = z.enum([
  "heading",
  "text",
  "image",
  "button",
  "spacing",
  "code",
  "line",
])
export type PageElementType = z.infer<typeof pageElementTypes>

export const pageElementSchema = z.discriminatedUnion("type", [
  z.object({
    id: zodBigintAsString(),
    type: z.enum([
      pageElementTypes.enum.heading,
      pageElementTypes.enum.text,
      pageElementTypes.enum.code,
    ]),
    text: z.string(),
  }),
  z.object({
    id: zodBigintAsString(),
    type: z.enum([pageElementTypes.enum.image]),
    url: z.string().optional(),
    mode: z
      .union([
        z.literal(uploadModes.enum.file),
        z.literal(uploadModes.enum.url),
      ])
      .optional(),
  }),
  z.object({
    id: zodBigintAsString(),
    type: z.enum([pageElementTypes.enum.line, pageElementTypes.enum.spacing]),
  }),
  z.discriminatedUnion("buttonType", [
    z.object({
      id: zodBigintAsString(),
      type: z.literal(pageElementTypes.enum.button),
      label: z.string().min(1).max(20),
      buttonType: z.literal(buttonTypes.enum.sendMessage),
      beforeStep: startAnotherNodeStepSchema,
      steps: z.array(z.union(actionSteps)),
    }),
    z.object({
      id: zodBigintAsString(),
      type: z.literal(pageElementTypes.enum.button),
      label: z.string().min(1).max(20),
      buttonType: z.literal(buttonTypes.enum.openWebsite),
      beforeStep: openWebsiteStepSchema,
      steps: z.array(z.union(actionSteps)),
    }),
    z.object({
      id: zodBigintAsString(),
      type: z.literal(pageElementTypes.enum.button),
      label: z.string().min(1).max(20),
      buttonType: z.literal(buttonTypes.enum.performAction),
      beforeStep: startAnotherNodeStepSchema,
      steps: z.array(z.union(actionSteps)),
    }),
    z.object({
      id: zodBigintAsString(),
      type: z.literal(pageElementTypes.enum.button),
      label: z.string().min(1).max(20),
      buttonType: z.literal(buttonTypes.enum.startExternalFlow),
      beforeStep: startExternalFlowStepSchema,
      steps: z.array(z.union(actionSteps)),
    }),
    z.object({
      id: zodBigintAsString(),
      type: z.literal(pageElementTypes.enum.button),
      label: z.string().min(1).max(20),
      buttonType: z.literal(buttonTypes.enum.startExternalNode),
      beforeStep: startExternalNodeStepSchema,
      steps: z.array(z.union(actionSteps)),
    }),
    z.object({
      id: zodBigintAsString(),
      type: z.literal(pageElementTypes.enum.button),
      label: z.string().min(1).max(20),
      buttonType: z.literal(buttonTypes.enum.startAnotherNode),
      beforeStep: startAnotherNodeStepSchema,
      steps: z.array(z.union(actionSteps)),
    }),
    z.object({
      id: zodBigintAsString(),
      type: z.literal(pageElementTypes.enum.button),
      label: z.string().min(1).max(20),
      buttonType: z.literal(null),
      beforeStep: z.null(),
      steps: z.array(z.any()),
    }),
  ]),
])

export type PageElementSchema = z.infer<typeof pageElementSchema>

export const emailStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.email),
  integrationSmtpId: z.string().trim(),
  topicId: z.string().trim().optional(),
  from: z.string().trim(),
  to: z.string().trim(),
  subject: z.string().trim(),
  preheader: z.string().trim(),
  elements: z.array(pageElementSchema),
})
export type EmailStepSchema = z.infer<typeof emailStepSchema>

export const emailStepDefaultFn = (
  props: Partial<EmailStepSchema> = {},
): EmailStepSchema => ({
  integrationSmtpId: "",
  topicId: "",
  from: "{{email}}",
  to: "",
  subject: "",
  preheader: "",
  elements: [],
  ...props,
  id: createId(),
  stepType: stepTypes.enum.email,
})
