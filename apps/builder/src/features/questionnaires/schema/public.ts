import {
  questionnaireQuestionImageSchema,
  questionnaireQuestionTypes,
  questionnaireSubmissionStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import {
  createQuestionnaireRequest,
  questionnaireOptionRequest,
  renameQuestionnaireRequest,
  updateQuestionnaireRequest,
} from "./action"

const questionnaireQuestionConfig = z
  .object({
    options: z.array(questionnaireOptionRequest).optional(),
  })
  .nullable()

const questionnaireQuestionResource = z.object({
  id: z.string(),
  title: z.string(),
  type: questionnaireQuestionTypes,
  active: z.boolean(),
  image: questionnaireQuestionImageSchema.nullable(),
  orderNo: z.number().int(),
  point: z.number().int(),
  retryMessage: z.string().nullable(),
  customFieldId: z.string().nullable(),
  systemFieldKey: z.string().nullable(),
  config: questionnaireQuestionConfig,
})

const questionnaireListItemResource = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  applicantsCount: z.number().int(),
})

export const listQuestionnairesPublicRequest = publicListRequest.extend({
  name: z.string().trim().min(1).max(255).optional(),
  sort: z
    .array(
      z.object({
        id: z.literal("name"),
        desc: z.boolean(),
      }),
    )
    .optional(),
})

export const listQuestionnairesPublicResponse = publicListResponse(
  questionnaireListItemResource,
)

export const getQuestionnairePublicRequest = z.object({
  id: zodBigintAsString(),
})

export const questionnairePublicResource = z.object({
  id: z.string(),
  name: z.string(),
  triggerFlowId: z.string().nullable(),
  enableScore: z.boolean(),
  enableRetryMessages: z.boolean(),
  enableCustomFieldMapping: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  questions: z.array(questionnaireQuestionResource),
})

export const createQuestionnairePublicRequest = createQuestionnaireRequest

export const updateQuestionnairePublicRequest =
  updateQuestionnaireRequest.extend({
    id: zodBigintAsString(),
  })

export const duplicateQuestionnairePublicRequest = z.object({
  id: zodBigintAsString(),
})

export const renameQuestionnairePublicRequest =
  renameQuestionnaireRequest.extend({ id: zodBigintAsString() })

const questionnaireSubmissionSort = z.object({
  id: z.enum(["name", "totalPoints", "status", "completedAt"]),
  desc: z.boolean(),
})

export const listQuestionnaireSubmissionsPublicRequest =
  publicListRequest.extend({
    id: zodBigintAsString(),
    name: z.string().trim().min(1).max(255).optional(),
    sort: z.array(questionnaireSubmissionSort).optional(),
  })

const questionnaireSubmissionContactResource = z.object({
  id: z.string(),
  fullName: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  avatar: z.string().nullable(),
})

const questionnaireSubmissionListItemResource = z.object({
  id: z.string(),
  status: questionnaireSubmissionStatuses,
  totalPoints: z.number().int().nullable(),
  completedAt: z.date().nullable(),
  conversationId: z.string().nullable(),
  contact: questionnaireSubmissionContactResource,
})

export const listQuestionnaireSubmissionsPublicResponse = z.object({
  enableScore: z.boolean(),
  ...publicListResponse(questionnaireSubmissionListItemResource).shape,
})

export const getQuestionnaireSubmissionPublicRequest = z.object({
  id: zodBigintAsString(),
  submissionId: zodBigintAsString(),
})

export const questionnaireSubmissionPublicResource = z.object({
  id: z.string(),
  contact: questionnaireSubmissionContactResource.pick({
    id: true,
    fullName: true,
  }),
  conversationId: z.string().nullable(),
  status: questionnaireSubmissionStatuses,
  totalPoints: z.number().int().nullable(),
  answers: z.array(
    z.object({
      questionId: z.string(),
      label: z.string(),
      value: z.union([
        z.string(),
        z.number(),
        z.object({
          optionId: z.string(),
          label: z.string(),
        }),
        z.null(),
      ]),
      pointsEarned: z.number().int().nullable(),
    }),
  ),
})
