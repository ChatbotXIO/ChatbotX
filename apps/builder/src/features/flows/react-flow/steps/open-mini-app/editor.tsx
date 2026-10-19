"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { useQuery } from "@tanstack/react-query"
import { AppWindowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { BaseStepEditor } from "../base/editor"

type OpenMiniAppStepEditorProps = {
  parentName: string
}

const OpenMiniAppStepEditor = ({ parentName }: OpenMiniAppStepEditorProps) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { data } = useQuery(
    orpc.miniAppsAPI.listMiniAppOptionsAPI.queryOptions({
      input: { workspaceId },
    }),
  )
  const options = (data ?? []).map((miniApp) => ({
    label: miniApp.name,
    value: miniApp.id,
  }))

  return (
    <BaseStepEditor icon={AppWindowIcon} title={t("flows.actions.openMiniApp")}>
      <ComboboxField
        emptyText={t("actions.noRecordFound")}
        label={t("fields.miniApp.label")}
        name={`${parentName}.miniAppId`}
        options={options}
        placeholder={t("actions.pleaseSelect")}
        required
      />
    </BaseStepEditor>
  )
}

export default OpenMiniAppStepEditor
