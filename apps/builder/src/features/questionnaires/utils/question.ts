import type { UpdateQuestionnaireRequest } from "../schema/action"

export const duplicateQuestionnaireQuestionDraft = (
  question: UpdateQuestionnaireRequest["questions"][number],
): UpdateQuestionnaireRequest["questions"][number] => ({
  ...question,
  id: undefined,
})
