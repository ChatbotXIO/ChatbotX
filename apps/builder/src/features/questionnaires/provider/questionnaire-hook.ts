import { useMemo } from "react"
import { useQuestionnaireStore } from "./questionnaire-store-context"

export const useQuestionnaireSelectOptions = (): {
  label: string
  value: string
}[] => {
  const questionnaires = useQuestionnaireStore((state) => state.questionnaires)

  return useMemo(
    () =>
      questionnaires.map((questionnaire) => ({
        label: questionnaire.name,
        value: questionnaire.id,
      })),
    [questionnaires],
  )
}
