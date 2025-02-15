"use client"

import type { Flow } from "@ahachat.ai/database"
import { T, useTranslate } from "@tolgee/react"
import { useMemo } from "react"
import type { StartFlowBlockSchema } from "./schema"

export const StartFlowBlockViewer = ({
  flows,
  data,
  id,
}: {
  flows: Flow[]
  data: StartFlowBlockSchema
  id: string
}) => {
  const { t } = useTranslate()
  const flow = useMemo(() => {
    return flows.find((obj) => obj.id === data.flowId)
  }, [data, flows])

  return (
    <div className="w-full p-2 text-center break-all border-dashed border rounded">
      <div className="font-bold">
        <T keyName="flows.sendFlow" />
      </div>
      {flow && <div>{flow.title}</div>}
      {!flow && <div>{t("flows.clickToSelectFlow")}</div>}
    </div>
  )
}
