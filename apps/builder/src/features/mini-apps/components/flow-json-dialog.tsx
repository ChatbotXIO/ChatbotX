"use client"

import type { FlowJson } from "@chatbotx.io/mini-app"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { CopyIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { useClipboard } from "@/hooks/use-clipboard"

const JsonViewer = dynamic(() => import("./json-viewer"), {
  ssr: false,
  loading: () => <Skeleton className="h-[60vh] w-full" />,
})

export const formatFlowJson = (flowJson: FlowJson) =>
  JSON.stringify(flowJson, null, 2)

export function FlowJsonDialog({
  flowJson,
  open,
  onOpenChange,
}: {
  flowJson: FlowJson | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("miniApps.json")
  const { handleCopy } = useClipboard()
  const text = flowJson ? formatFlowJson(flowJson) : ""
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {open ? <JsonViewer value={text} /> : null}
        <DialogFooter>
          <Button onClick={() => handleCopy(text)} size="sm">
            <CopyIcon className="size-4" />
            {t("copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
