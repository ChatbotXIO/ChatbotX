"use client"

import { waitStepDelayTypes } from "@chatbotx.io/flow-config"
import { useWatch } from "react-hook-form"
import { DateDelayEditor } from "./components/date-delay-editor"
import DelayTypeSelect from "./components/delay-type-select"
import { DurationDelayEditor } from "./components/duration-delay-editor"
import { RandomDelayEditor } from "./components/random-delay-editor"

type WaitStepEditorProps = {
  parentName: string
}

const WaitStepEditor = ({ parentName }: WaitStepEditorProps) => {
  const delayType = useWatch({ name: `${parentName}.delayType` })

  return (
    <div className="flex flex-col gap-4">
      <DelayTypeSelect name={`${parentName}.delayType`} />

      {delayType === waitStepDelayTypes.enum.duration && (
        <DurationDelayEditor parentName={parentName} />
      )}

      {delayType === waitStepDelayTypes.enum.date && (
        <DateDelayEditor parentName={parentName} />
      )}

      {delayType === waitStepDelayTypes.enum.random && (
        <RandomDelayEditor parentName={parentName} />
      )}
    </div>
  )
}

export default WaitStepEditor
