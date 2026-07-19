import { z } from "zod"

export const questionnaireQuestionTypes = z.enum([
  "text",
  "number",
  "email",
  "phone",
  "multipleChoice",
  "date",
  "datetime",
  "image",
  "file",
  "location",
  "websiteLink",
])
export type QuestionnaireQuestionType = z.infer<
  typeof questionnaireQuestionTypes
>

export const supportedQuestionnaireQuestionTypes =
  questionnaireQuestionTypes.extract([
    "text",
    "number",
    "email",
    "phone",
    "multipleChoice",
  ])
export type SupportedQuestionnaireQuestionType = z.infer<
  typeof supportedQuestionnaireQuestionTypes
>

export const questionnaireQuestionImageSchema = z.object({
  mode: z.enum(["file", "url"]),
  url: z.url().or(z.literal("")),
})
export type QuestionnaireQuestionImage = z.infer<
  typeof questionnaireQuestionImageSchema
>

export const questionnaireSubmissionStatuses = z.enum([
  "inProgress",
  "completed",
  "cancelled",
  "failed",
  "timeout",
])
export type QuestionnaireSubmissionStatus = z.infer<
  typeof questionnaireSubmissionStatuses
>
