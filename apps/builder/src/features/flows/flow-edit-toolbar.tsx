"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { publishFlowAction } from "./actions/publish-flow-action"

export function FlowEditToolbar({ flowId }: { flowId: string }) {
  const { execute: executePublish, isPending: isPendingPublish } = useAction(
    publishFlowAction.bind(null, flowId),
  )

  return (
    <div className="flex gap-2">
      <Button variant="ghost" size="sm" className="px-1.5">
        <RotateCcwIcon />
      </Button>
      <Button variant="ghost" size="sm" className="px-1.5">
        <RotateCwIcon />
      </Button>
      <Button
        variant="default"
        size="sm"
        className="ml-5"
        onClick={() => executePublish()}
        disabled={isPendingPublish}
      >
        {isPendingPublish && <Loader2Icon className="animate-spin" />}
        Publish
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="px-1.5">
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
