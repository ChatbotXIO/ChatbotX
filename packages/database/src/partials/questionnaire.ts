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
  mode: z
    .enum(["file", "url"])
    .describe(
      'How the image was provided: "file" for an uploaded file, "url" for an external link. The image is read from `url` in both cases.',
    ),
  url: z
    .url()
    .or(z.literal(""))
    .describe("Absolute image URL, or an empty string for no image."),
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
