"use client"

import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { useSequenceSelectOptions } from "@/features/sequences/provider/sequence-hook"

/**
 * Sequence picker shared by the add/remove sequence trigger actions. A
 * component of its own so the sequence list is only fetched when one of these
 * actions is actually on screen. Paused sequences are listed too: a trigger can
 * subscribe to or unsubscribe from them, and a saved one must keep its label.
 */
export const SequenceActionEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const options = useSequenceSelectOptions({ includeInactive: true })

  return (
    <MultiSelectField
      label=""
      name={`${parentName}.sequenceIds`}
      options={options}
    />
  )
}
