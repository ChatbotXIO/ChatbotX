"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { useEdges, useNodes } from "@xyflow/react"
import {
  ChartNoAxesCombinedIcon,
  CopyIcon,
  EllipsisIcon,
  HistoryIcon,
  LinkIcon,
  Loader2Icon,
  RefreshCcwIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { publishFlowAction } from "../actions/publish-flow-action"
import { updateFlowVersionSchema } from "../schemas/update-flow-schema"

export function FlowEditToolbar({
  chatbotId,
  flowId,
}: {
  chatbotId: string
  flowId: string
}) {
  const t = useTranslations()
  const [isValidating, setIsValidating] = useState<boolean>(false)
  const nodes = useNodes()
  const edges = useEdges()

  const { execute: executePublish, isPending: isPendingPublish } = useAction(
    publishFlowAction.bind(null, chatbotId, flowId),
    {
      onSuccess: () => {
        toast.success("A new version has been published")
      },
    },
  )

  const onClickPublish = () => {
    setIsValidating(true)

    // validate nodes & edges
    const { success, error } = updateFlowVersionSchema.safeParse({
      nodes,
      edges,
    })

    console.log("error", error)
    if (success) {
      executePublish()
    } else {
      toast.error("Some configurations are incomplete")
    }
    setIsValidating(false)
  }

  return (
    <div className="flex gap-2">
      {/* <div>{isValidating}</div> */}
      <Button className="px-1.5" size="sm" variant="ghost">
        <RotateCcwIcon />
      </Button>
      <Button className="px-1.5" size="sm" variant="ghost">
        <RotateCwIcon />
      </Button>
      <Button
        className="ml-5"
        disabled={isValidating || isPendingPublish}
        onClick={onClickPublish}
        size="sm"
        variant="default"
      >
        {(isValidating || isPendingPublish) && (
          <Loader2Icon className="animate-spin" />
        )}
        Publish
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger className="px-1.5">
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <TypeIcon />
              {t("actions.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CopyIcon />
              {t("actions.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <LinkIcon />
              {t("actions.getDraftLink")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <LinkIcon />
              {t("actions.getPublishedLink")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <ChartNoAxesCombinedIcon />
              {t("actions.analytics")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HistoryIcon />
              {t("actions.flowVersions")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Trash2Icon />
              {t("actions.delete")}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <RefreshCcwIcon />
              {t("actions.revertToPublished")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
