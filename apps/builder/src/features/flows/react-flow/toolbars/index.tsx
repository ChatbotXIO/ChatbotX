import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTranslate } from "@tolgee/react"
import { NodeToolbar, Position } from "@xyflow/react"
import {
  CopyIcon,
  EyeIcon,
  FingerprintIcon,
  LinkIcon,
  PlayIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"
import type { ReactElement } from "react"

const FlowFlowNodeToolbarOptions = {
  previewBtn: true,
  setAsStartingStepBtn: true,
  getPublishedLinkBtn: true,
  getStepIdBtn: true,
  renameBtn: true,
  duplicateBtn: true,
  deleteBtn: true,
}
export type ToolbarOptions = Partial<typeof FlowFlowNodeToolbarOptions>
export type ToolbarOptionKey = keyof typeof FlowFlowNodeToolbarOptions

export function FlowFlowNodeToolbar({
  toolbarOptions,
  visible = false,
}: { toolbarOptions?: ToolbarOptions; visible: boolean }) {
  const { t } = useTranslate()

  const options = { ...FlowFlowNodeToolbarOptions, ...toolbarOptions }

  const configs: Record<
    ToolbarOptionKey,
    { icon: ReactElement; label: string; onClick: () => void }
  > = {
    previewBtn: {
      icon: <EyeIcon />,
      label: t("flows.previewBtn"),
      onClick: () => {},
    },
    setAsStartingStepBtn: {
      icon: <PlayIcon />,
      label: t("flows.setAsStartingStepBtn"),
      onClick: () => {},
    },
    getPublishedLinkBtn: {
      icon: <LinkIcon />,
      label: t("flows.getPublishedLinkBtn"),
      onClick: () => {},
    },
    getStepIdBtn: {
      icon: <FingerprintIcon />,
      label: t("flows.getStepIdBtn"),
      onClick: () => {},
    },
    renameBtn: {
      icon: <TypeIcon />,
      label: t("flows.renameBtn"),
      onClick: () => {},
    },
    duplicateBtn: {
      icon: <CopyIcon />,
      label: t("flows.duplicateBtn"),
      onClick: () => {},
    },
    deleteBtn: {
      icon: <Trash2Icon />,
      label: t("flows.deleteBtn"),
      onClick: () => {},
    },
  }

  return (
    <NodeToolbar isVisible={visible} position={Position.Top}>
      <div className="flex gap-2 border bg-card p-1 rounded-lg">
        {Object.keys(options).map((option) => {
          return options[option as ToolbarOptionKey] ? (
            <Tooltip key={option}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={configs[option as ToolbarOptionKey].onClick}
                >
                  {configs[option as ToolbarOptionKey].icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{configs[option as ToolbarOptionKey].label}</p>
              </TooltipContent>
            </Tooltip>
          ) : undefined
        })}
      </div>
    </NodeToolbar>
  )
}
