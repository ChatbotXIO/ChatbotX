import { useMemo } from "react"
import { useTagStore } from "./tag-store-context"

export const useTagOptions = (): string[] => {
  const tags = useTagStore((state) => state.tags)

  return useMemo(() => tags.map((tag) => tag.name), [tags])
}

export const useTagSelectOptions = (): { label: string; value: string }[] => {
  const tags = useTagStore((state) => state.tags)

  return useMemo(
    () =>
      tags.map((tag) => ({
        label: tag.name,
        value: tag.id,
      })),
    [tags],
  )
}
