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

    // biome-ignore lint/suspicious/noConsole: debug
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
        <DropdownMenuTrigger asChild>
          <Button className="px-1.5" size="sm" variant="outline">
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <TypeIcon />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CopyIcon />
              <span>Duplicate</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <LinkIcon />
              <span>Get draft link</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <LinkIcon />
              <span>Get published link</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <ChartNoAxesCombinedIcon />
              <span>Analytics</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HistoryIcon />
              <span>Flow Versions</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Trash2Icon />
              <span>Delete</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <RefreshCcwIcon />
              <span>Revert to published</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
