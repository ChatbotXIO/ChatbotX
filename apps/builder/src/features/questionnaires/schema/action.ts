import {
  questionnaireQuestionImageSchema,
  supportedQuestionnaireQuestionTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const questionnaireNameSchema = z.string().trim().min(1).max(255)

export const createQuestionnaireRequest = z.object({
  name: questionnaireNameSchema,
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
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(255),
  points: z.coerce.number().int().min(0).default(0),
})

export const questionnaireQuestionRequest = z.object({
  id: zodBigintAsString().optional(),
  title: z.string().trim().min(1).max(1000),
  type: supportedQuestionnaireQuestionTypes,
  active: z.boolean(),
  image: questionnaireQuestionImageSchema.optional().nullable(),
  point: z.coerce.number().int().min(0).default(1),
  retryMessage: z.string().trim().max(1000).optional().nullable(),
  customFieldId: z.string().trim().optional().nullable(),
  systemFieldKey: z.string().trim().optional().nullable(),
  config: z
    .object({
      options: z.array(questionnaireOptionRequest).default([]),
    })
    .optional()
    .nullable(),
})

export const updateQuestionnaireRequest = z.object({
  triggerFlowId: z.preprocess(
    (value) => (value === noQuestionnaireTriggerFlowValue ? null : value),
    zodBigintAsString().optional().nullable(),
  ),
  enableScore: z.boolean(),
  enableRetryMessages: z.boolean(),
  enableCustomFieldMapping: z.boolean(),
  questions: z.array(questionnaireQuestionRequest).max(100),
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
