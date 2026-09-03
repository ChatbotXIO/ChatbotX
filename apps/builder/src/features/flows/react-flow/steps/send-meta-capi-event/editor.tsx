"use client"

import { MegaphoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { MetaCapiEventDialog } from "@/features/meta-conversions/components/meta-capi-event-dialog"
import { BaseStepEditor } from "../base/editor"

type SendMetaCapiEventEditorProps = {
  parentName: string
}

export const SendMetaCapiEventEditor = ({
  parentName,
}: SendMetaCapiEventEditorProps) => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={MegaphoneIcon}
      title={t("flows.actions.sendMetaCapiEvent")}
    >
      <MetaCapiEventDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
