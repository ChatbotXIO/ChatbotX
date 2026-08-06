import type { KeyboardEvent } from "react"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"

type KeywordFieldValues = FieldValues & {
  keywords: { value: string }[]
}

export function useKeywordFieldNavigation<T extends KeywordFieldValues>(
  form: UseFormReturn<T>,
  keywordsCount: number,
  appendKeyword: () => void,
) {
  return (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()

    if (index === keywordsCount - 1) {
      appendKeyword()
    }
    requestAnimationFrame(() => {
      form.setFocus(`keywords.${index + 1}.value` as Path<T>)
    })
  }
}
