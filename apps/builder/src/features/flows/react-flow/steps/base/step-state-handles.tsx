"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { Handle, Position, useNodeConnections } from "@xyflow/react"
import { useTranslations } from "next-intl"

type StepState = { id: string; stateType: string }

type StepStateHandlesProps = {
  states?: StepState[]
}

type StateHandleProps = {
  stateId: string
  label: string
  borderClass: string
  fillClass: string
}

export function StateHandle({
  stateId,
  label,
  borderClass,
  fillClass,
}: StateHandleProps) {
  const connections = useNodeConnections({
    handleType: "source",
    handleId: stateId,
  })
  const isConnected = connections.length > 0

  return (
    <div className="relative flex items-center gap-2 text-xs">
      {label}
      <div
        className={cn(
          "h-4 w-4 rounded-full border-2",
          borderClass,
          isConnected && fillClass,
        )}
      >
        <Handle
          className="right-[8px]! h-4! w-4! opacity-0!"
          id={stateId}
          position={Position.Right}
          type="source"
        />
      </div>
    </div>
  )
}

export function StepStateHandles({ states }: StepStateHandlesProps) {
  const t = useTranslations()

  const successState = states?.find((s) => s.stateType === "success")
  const errorState = states?.find((s) => s.stateType === "error")
  const skipState = states?.find((s) => s.stateType === "skip")

  if (!(successState || errorState || skipState)) {
    return null
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {successState && (
        <StateHandle
          borderClass="border-green-500"
          fillClass="bg-green-500"
          label={t("states.success")}
          stateId={successState.id}
        />
      )}
      {errorState && (
        <StateHandle
          borderClass="border-red-500"
          fillClass="bg-red-500"
          label={t("states.error")}
          stateId={errorState.id}
        />
      )}
      {skipState && (
        <StateHandle
          borderClass="border-yellow-500"
          fillClass="bg-yellow-500"
          label={t("states.skip")}
          stateId={skipState.id}
        />
      )}
    </div>
  )
}
