import type {
  QuestionnaireQuestionImage,
  SupportedQuestionnaireQuestionType,
} from "@chatbotx.io/database/partials"
import type {
  QuestionnaireAnswerValue,
  QuestionnaireChoiceOption,
} from "@chatbotx.io/database/schema"

export type QuestionnaireQuestionInput = {
  id?: string
  title: string
  type: SupportedQuestionnaireQuestionType
  active: boolean
  image?: QuestionnaireQuestionImage | null
  point?: number | null
  retryMessage?: string | null
  customFieldId?: string | null
  systemFieldKey?: string | null
  config?: {
    options?: QuestionnaireChoiceOption[]
  } | null
}

export type UpdateQuestionnaireInput = {
  workspaceId: string
  id: string
  triggerFlowId?: string | null
  enableScore: boolean
  enableRetryMessages: boolean
  enableCustomFieldMapping: boolean
  questions: QuestionnaireQuestionInput[]
}

export type QuestionnaireAnswerInput = {
  workspaceId: string
  contactId: string
  conversationId?: string | null
  questionnaireId: string
  submissionId?: string
  value: QuestionnaireAnswerValue
}
