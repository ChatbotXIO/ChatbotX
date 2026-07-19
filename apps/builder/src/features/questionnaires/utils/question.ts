import type { UpdateQuestionnaireRequest } from "../schemas/action"

export const duplicateQuestionnaireQuestionDraft = (
  question: UpdateQuestionnaireRequest["questions"][number],
): UpdateQuestionnaireRequest["questions"][number] => ({
  ...question,
  id: undefined,
})
