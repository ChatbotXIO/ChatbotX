import { rootFolderId } from "@chatbotx.io/database/partials"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFolderStore } from "./folder-store-context"

export const useFolderSelectOptions = (props?: {
  ignoreIds?: string[]
}): SelectOption[] => {
  const { ignoreIds = [] } = props ?? {}
  const folders = useFolderStore((state) => state.folders)
  const t = useTranslations()
  const rootLabel = t("folders.rootOption")

  return useMemo(() => {
    const result = folders.map((folder) => ({
      label: folder.name,
      value: folder.id,
    }))

    result.unshift({
      label: rootLabel,
      value: rootFolderId,
    })

    return Object.values(
      result.filter((folder) => !ignoreIds.includes(folder.value)),
    )
  }, [folders, ignoreIds, rootLabel])
}
