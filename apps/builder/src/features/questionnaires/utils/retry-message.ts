import type { SupportedQuestionnaireQuestionType } from "@chatbotx.io/database/partials"

const defaultRetryMessageKeyByType = {
  text: "questionnaires.defaultRetryMessages.text",
  number: "questionnaires.defaultRetryMessages.number",
  email: "questionnaires.defaultRetryMessages.email",
  phone: "questionnaires.defaultRetryMessages.phone",
  multipleChoice: "questionnaires.defaultRetryMessages.multipleChoice",
} as const satisfies Record<SupportedQuestionnaireQuestionType, string>

type QuestionnaireRetryMessageKey =
  (typeof defaultRetryMessageKeyByType)[SupportedQuestionnaireQuestionType]

type QuestionnaireTranslator = (key: QuestionnaireRetryMessageKey) => string

export const getQuestionnaireDefaultRetryMessageKey = (
  type: SupportedQuestionnaireQuestionType,
) => defaultRetryMessageKeyByType[type]

export const getQuestionnaireDefaultRetryMessage = (
  type: SupportedQuestionnaireQuestionType,
  t: QuestionnaireTranslator,
) => t(getQuestionnaireDefaultRetryMessageKey(type))
