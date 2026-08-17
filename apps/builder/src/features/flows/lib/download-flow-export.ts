import type { useTranslations } from "next-intl"
import { toast } from "sonner"

const CONTENT_DISPOSITION_FILENAME_REGEX = /filename="([^"]+)"/

type ExportableFlow = {
  id: string
  workspaceId: string
  name: string
}

export async function downloadFlowExport(
  flow: ExportableFlow,
  t: ReturnType<typeof useTranslations>,
): Promise<void> {
  try {
    const response = await fetch(
      `/space/${flow.workspaceId}/flows/${flow.id}/export`,
    )
    if (!response.ok) {
      if (response.status === 409) {
        toast.error(t("flows.export.notPublished"))
      } else {
        toast.error(t("flows.export.failed"))
      }
      return
    }

    const disposition = response.headers.get("Content-Disposition") ?? ""
    const fileNameMatch = CONTENT_DISPOSITION_FILENAME_REGEX.exec(disposition)
    const fileName = fileNameMatch?.[1] ?? `${flow.name}.chatbotx-flow.json`

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.error(t("flows.export.failed"))
  }
}
