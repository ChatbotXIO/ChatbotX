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

const answerBaseBlockSchema = z.object({
  actionType: z.enum([AnswerType.Number]),
  customFieldId: z.string().cuid2(),
  validationMessage: z.string().max(255).trim().nullable(),
  skipButtonLabel: z.string().max(255).trim().nullable(),
  autoSkipAfter: z.object({
    period: z.enum(["Second", "Minute", "Hour"]),
    unit: z.number().int().nullable(),
    failedAttemps: z.number().int().nonnegative().min(1).max(100),
  }),
})

export const answerNumberBlockSchema = answerBaseBlockSchema.extend({})
export type AnswerNumberBlockSchema = z.infer<typeof answerNumberBlockSchema>

export const answerTextBlockSchema = answerBaseBlockSchema.extend({})
export type AnswerTextBlockSchema = z.infer<typeof answerTextBlockSchema>

export const answerEmailBlockSchema = answerBaseBlockSchema.extend({})
export type AnswerEmailBlockSchema = z.infer<typeof answerEmailBlockSchema>
