"use client"

import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { Loader2Icon, SendIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useId, useState } from "react"
import { toast } from "sonner"
import { publishMiniAppWhatsappAction } from "../actions/publish-mini-app-whatsapp.action"
import type { WhatsappPublishTarget } from "../queries"

type MetaValidationError = { message?: string; error?: string }

export function PublishWhatsappDialog({
  workspaceId,
  miniAppId,
  targets,
  open,
  onOpenChange,
  hasUnsavedChanges = false,
}: {
  workspaceId: string
  miniAppId: string | null
  targets: WhatsappPublishTarget[]
  open: boolean
  onOpenChange: (open: boolean) => void
  hasUnsavedChanges?: boolean
}) {
  const t = useTranslations("miniApps.publish")
  const router = useRouter()
  const selectId = useId()
  const [targetId, setTargetId] = useState<string>(targets[0]?.id ?? "")
  const [metaErrors, setMetaErrors] = useState<MetaValidationError[]>([])

  const { execute, isPending } = useAction(
    publishMiniAppWhatsappAction.bind(null, workspaceId, miniAppId ?? ""),
    {
      onSuccess: ({ data }) => {
        if (data?.published) {
          toast.success(t("success"))
          setMetaErrors([])
          onOpenChange(false)
        } else {
          toast.error(t("draftOnly"))
          setMetaErrors((data?.validationErrors ?? []) as MetaValidationError[])
        }
        router.refresh()
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("failed"))
      },
    },
  )

  const items = targets.map((target) => ({
    value: target.id,
    label: target.label,
  }))

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {targets.length === 0 ? (
          <Alert>
            <AlertDescription>{t("noNumbers")}</AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor={selectId}>{t("number")}</Label>
            <Select
              items={items}
              onValueChange={(value) => setTargetId(String(value))}
              value={targetId}
            >
              <SelectTrigger className="w-full" id={selectId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {hasUnsavedChanges ? (
          <Alert>
            <AlertDescription>{t("unsavedChanges")}</AlertDescription>
          </Alert>
        ) : null}
        {metaErrors.length > 0 ? (
          <Alert variant="destructive">
            <AlertDescription>
              <ul className="list-disc ps-4">
                {metaErrors.map((error, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Meta errors have no id
                  <li key={index}>
                    {error.message ?? error.error ?? t("failed")}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            disabled={!(miniAppId && targetId) || isPending}
            onClick={() => execute({ integrationWhatsappId: targetId })}
          >
            {isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SendIcon className="size-4" />
            )}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
