import { useMemo } from "react"
import { useSequenceStore } from "./sequence-store-context"

export const useSequenceOptions = (): { id: string; name: string }[] => {
  const sequences = useSequenceStore((state) => state.sequences)

  return useMemo(
    () =>
      sequences.map((sequence) => ({
        id: sequence.id,
        name: sequence.name,
      })),
    [sequences],
  )
}
