import { z } from "zod"

export enum AnswerType {
  Number = "Number",
  SendText = "SendText",
  Email = "Email",
  PhoneNumber = "PhoneNumber",
  Image = "Image",
  File = "File",
  Url = "Url",
  Location = "Location",
  Date = "Date",
  DateTime = "DateTime",
  Others = "Others",
}

const answerBaseStepSchema = z.object({
  stepType: z.literal(AnswerType.Number),
  customFieldId: z.string().cuid2(),
  validationMessage: z.string().trim().max(255).nullable(),
  skipButtonLabel: z.string().trim().max(255).nullable(),
  autoSkipAfter: z.object({
    period: z.enum(["Second", "Minute", "Hour"]),
    unit: z.number().int().nullable(),
    failedAttemps: z.number().int().nonnegative().min(1).max(100),
  }),
})

export const answerNumberStepSchema = answerBaseStepSchema.extend({})
export type AnswerNumberStepSchema = z.infer<typeof answerNumberStepSchema>

export const answerTextStepSchema = answerBaseStepSchema.extend({})
export type AnswerTextStepSchema = z.infer<typeof answerTextStepSchema>

export const answerEmailStepSchema = answerBaseStepSchema.extend({})
export type AnswerEmailStepSchema = z.infer<typeof answerEmailStepSchema>
