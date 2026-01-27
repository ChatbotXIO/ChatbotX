import { rootFolderId } from "@aha.chat/database/enums"
import type { SelectOption } from "@aha.chat/ui/components/form/select-field"
import { useMemo } from "react"
import { useFolderStore } from "./folder-store-context"

export const useFolderSelectOptions = (props?: {
  ignoreIds?: string[]
}): SelectOption[] => {
  const { ignoreIds = [] } = props ?? {}
  const folders = useFolderStore((state) => state.folders)

  return useMemo(() => {
    const result = folders.map((folder) => ({
      label: folder.name,
      value: folder.id,
    }))

    result.unshift({
      label: "-- Root --",
      value: rootFolderId,
    })

    return Object.values(
      result.filter((folder) => !ignoreIds.includes(folder.value)),
    )
  }, [folders, ignoreIds])
}
