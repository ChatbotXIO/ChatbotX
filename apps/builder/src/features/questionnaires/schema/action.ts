import {
  questionnaireQuestionImageSchema,
  supportedQuestionnaireQuestionTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const questionnaireNameSchema = z.string().trim().min(1).max(255)

export const createQuestionnaireRequest = z.object({
  name: questionnaireNameSchema.describe("Questionnaire name."),
})
export type CreateQuestionnaireRequest = z.infer<
  typeof createQuestionnaireRequest
>

export const renameQuestionnaireRequest = createQuestionnaireRequest
export type RenameQuestionnaireRequest = z.infer<
  typeof renameQuestionnaireRequest
>

export const noQuestionnaireTriggerFlowValue = "__none__"

export const questionnaireOptionRequest = z.object({
  id: z.string().trim().min(1).describe("Option id, stable across edits."),
  label: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe("Option label shown to the respondent."),
  points: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Points awarded when this option is chosen."),
})

export const questionnaireQuestionRequest = z.object({
  id: zodBigintAsString()
    .optional()
    .describe("Existing question id to update, or omit to add a new question."),
  title: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .describe("Question text shown to the respondent."),
  type: supportedQuestionnaireQuestionTypes.describe(
    "Question type, e.g. single/multiple choice or free text.",
  ),
  active: z.boolean().describe("Whether the question is shown to respondents."),
  image: questionnaireQuestionImageSchema
    .optional()
    .nullable()
    .describe("Optional image shown with the question."),
  point: z.coerce
    .number()
    .int()
    .min(0)
    .default(1)
    .describe("Points awarded for a correct/matching answer."),
  retryMessage: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .describe(
      "Message shown when a retry is required, or null for the default.",
    ),
  customFieldId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .describe("Custom field to store the answer in, or null for none."),
  systemFieldKey: z
    .string()
    .trim()
    .optional()
    .nullable()
    .describe("System contact field to store the answer in, or null for none."),
  config: z
    .object({
      options: z.array(questionnaireOptionRequest).default([]),
    })
    .optional()
    .nullable()
    .describe("Choice options, required for choice-type questions."),
})

export const updateQuestionnaireRequest = z.object({
  triggerFlowId: z
    .preprocess(
      (value) => (value === noQuestionnaireTriggerFlowValue ? null : value),
      zodBigintAsString().optional().nullable(),
    )
    .describe("Flow to trigger on submission, or null for none."),
  enableScore: z.boolean().describe("Whether respondent answers are scored."),
  enableRetryMessages: z
    .boolean()
    .describe("Whether incorrect answers show a retry message."),
  enableCustomFieldMapping: z
    .boolean()
    .describe("Whether answers are written to mapped custom fields."),
  questions: z
    .array(questionnaireQuestionRequest)
    .max(100)
    .describe("Ordered list of questions."),
})
export type UpdateQuestionnaireRequest = z.infer<
  typeof updateQuestionnaireRequest
>

export const deleteQuestionnaireSubmissionRequest = z.object({
  questionnaireId: zodBigintAsString(),
  submissionId: zodBigintAsString(),
})

export const deleteQuestionnaireSubmissionsRequest = z.object({
  questionnaireId: zodBigintAsString(),
  submissionIds: z.array(zodBigintAsString()).min(1),
})
