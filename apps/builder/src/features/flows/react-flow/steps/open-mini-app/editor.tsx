"use client"

import { AppWindowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { MiniAppSelect } from "@/features/mini-apps/components/mini-app-select"
import { BaseStepEditor } from "../base/editor"

type OpenMiniAppStepEditorProps = {
  parentName: string
}

const OpenMiniAppStepEditor = ({ parentName }: OpenMiniAppStepEditorProps) => {
  const t = useTranslations()

  return (
    <BaseStepEditor icon={AppWindowIcon} title={t("flows.actions.openMiniApp")}>
      <MiniAppSelect name={`${parentName}.miniAppId`} />
    </BaseStepEditor>
  )
}

export default OpenMiniAppStepEditor
