"use client"

import { CalculatorIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const CountCharactersStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={CalculatorIcon}
      title={t("flows.actions.countCharacters")}
    />
  )
}

export default CountCharactersStepViewer
