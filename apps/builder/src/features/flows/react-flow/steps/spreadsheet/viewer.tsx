"use client"

import type { SpreadsheetSchema } from "@chatbotx.io/flow-config"
import { Handle, Position } from "@xyflow/react"
import { FileSpreadsheetIcon } from "lucide-react"
import { useTranslations } from "next-intl"

type SpreadsheetViewerProps = {
  data: SpreadsheetSchema
}

export const SpreadsheetViewer = ({ data }: SpreadsheetViewerProps) => {
  const t = useTranslations()

  return (
    <div className="mb-2 flex flex-col rounded-md border border-dashed p-4">
      <div className="mb-3 flex flex-col items-center capitalize">
        <div className="flex items-center justify-center gap-2 text-sm">
          <FileSpreadsheetIcon className="text-gray-500" size={20} />
          <p className="font-bold">{t("fields.googleSheets.label")}</p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="relative flex items-center gap-2 text-xs">
          {t("messages.success")}
          <div className="h-4 w-4 rounded-full border-2 border-green-500">
            <Handle
              className="right-[8px]! h-4! w-4! opacity-0!"
              id={data.successNodeId}
              position={Position.Right}
              type="source"
            />
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-xs">
          {t("messages.failed")}
          <div className="h-4 w-4 rounded-full border-2 border-red-500">
            <Handle
              className="right-[8px]! h-4! w-4! opacity-0!"
              id={data.errorNodeId}
              position={Position.Right}
              type="source"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
