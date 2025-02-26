"use client"

import { useTranslate } from "@tolgee/react"
import { BracesIcon } from "lucide-react"

export const GetDataFromJsonViewer = ({ name }: { name: string }) => {
  const { t } = useTranslate()

  return (
    <div className="flex flex-col border border-dashed rounded-md p-4 mb-2">
      <div className="flex flex-col items-center mb-3 capitalize">
        <div className="flex items-center justify-center gap-2 text-sm break-all">
          <BracesIcon size={20} className="text-yellow-500" />
          <p className="font-bold">{t("flows.ActionType.GetDataFromJson")}</p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2 text-xs">
          Success
          <div className="w-4 h-4 rounded-full border-2 border-green-500" />
        </div>
        <div className="flex items-center gap-2 text-xs">
          Failed
          <div className="w-4 h-4 rounded-full border-2 border-red-500" />
        </div>
      </div>
    </div>
  )
}
