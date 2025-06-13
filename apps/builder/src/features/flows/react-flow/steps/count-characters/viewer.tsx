"use client"

import { T } from "@tolgee/react"
import { CalculatorIcon } from "lucide-react"
import { BaseStepViewer } from "../base/viewer"

export default function CountCharactersStepViewer() {
  return (
    <BaseStepViewer
      icon={CalculatorIcon}
      title={<T keyName="flows.StepType.CountCharacters" />}
    />
  )
}
