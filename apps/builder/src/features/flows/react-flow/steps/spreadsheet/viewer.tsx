"use client"

import { FileSpreadsheetIcon } from "lucide-react"

type SpreadsheetViewerProps = {
  name: string
  data: Record<string, unknown>
}

export const SpreadsheetViewer = ({ name }: SpreadsheetViewerProps) => {
  return (
    <div className="mb-2 flex flex-col rounded-md border border-dashed p-4">
      <div className="mb-3 flex flex-col items-center capitalize">
        <div className="flex items-center justify-center gap-2 text-sm">
          <FileSpreadsheetIcon className="text-gray-500" size={20} />
          <p className="font-bold">Google Sheets</p>
        </div>
        <div className="break-all text-gray-500 text-xs">{name}</div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2 text-xs">
          Success
          <div className="h-4 w-4 rounded-full border-2 border-green-500" />
        </div>
        <div className="flex items-center gap-2 text-xs">
          Failed
          <div className="h-4 w-4 rounded-full border-2 border-red-500" />
        </div>
      </div>
    </div>
  )
}
