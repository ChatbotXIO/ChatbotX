import {
  type ErrorStateSchema,
  type SkipStateSchema,
  type SuccessStateSchema,
  stateTypes,
} from "@aha.chat/flow-config"
import { cn } from "@aha.chat/ui/lib/utils"
import { Position } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { BaseHandle } from "@/components/base-handle"

export const BaseStateViewer = (props: {
  data: SuccessStateSchema | ErrorStateSchema | SkipStateSchema
}) => {
  const { data } = props
  const t = useTranslations()

  const variants = {
    [stateTypes.success]: "green",
    [stateTypes.error]: "red",
    [stateTypes.skip]: "yellow",
  }

  const labelVariants = {
    [stateTypes.success]: t("states.success"),
    [stateTypes.error]: t("states.error"),
    [stateTypes.skip]: t("states.skip"),
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-end gap-2 text-xs",
        `text-${variants[data.stateType]}-500!`,
      )}
    >
      <div className="mr-4">{labelVariants[data.stateType]}</div>
      <BaseHandle
        className={cn(
          "transform-none! top-0.5!",
          `border-${variants[data.stateType]}-500!`,
        )}
        id={data.id}
        onConnectedClassName={cn(`bg-${variants[data.stateType]}-500!`)}
        position={Position.Right}
        type="source"
      />
    </div>
  )
}
