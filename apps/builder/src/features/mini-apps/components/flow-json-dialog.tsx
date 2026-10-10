"use client"

import { type FlowJson, hasContactVariable } from "@chatbotx.io/mini-app"
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
import { CopyIcon, TriangleAlertIcon } from "lucide-react"
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
  // Flow JSON has no `{{...}}` syntax, so any token is a custom field that
  // WhatsApp would show to every recipient as written.
  const showsContactVariables = hasContactVariable(text)
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {showsContactVariables ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-amber-700 text-xs">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>{t("contactVariablesWarning")}</span>
          </div>
        ) : null}
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
