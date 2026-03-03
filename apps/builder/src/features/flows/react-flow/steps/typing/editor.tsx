"use client"

import { InputNumberField } from "@aha.chat/ui/components/form/input-number-field"

type TypingStepEditorProps = {
  parentName: string
}

export default function TypingStepEditor(props: TypingStepEditorProps) {
  const { parentName } = props

  return (
    <div className="flex flex-col gap-3">
      <InputNumberField
        label="Typing for (seconds)"
        max={60}
        min={1}
        name={`${parentName}.seconds`}
        required
        stepper={1}
      />
    </div>
  )
}
