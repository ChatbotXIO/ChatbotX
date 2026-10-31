"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { CopyIcon, Loader2Icon, RefreshCwIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useTenantSettings } from "@/features/tenant"
import { useClipboard } from "@/hooks/use-clipboard"
import { rotateShareTokenAction } from "../actions/rotate-share-token.action"
import { updateShareSettingsAction } from "../actions/update-share-settings.action"

type ShareableTemplate = {
  id: string
  shareEnabled: boolean
  shareToken: string
  shareExpiresAt: Date | null
}

type ShareSettingsPanelProps = {
  workspaceId: string
  template: ShareableTemplate
  /** Called after a change lands, for hosts that hold the settings in state rather than props. */
  onChanged?: () => void
}

/** `<input type="datetime-local">` takes local time without a zone or seconds. */
const toLocalInputValue = (date: Date | null): string => {
  if (!date) {
    return ""
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/**
 * The share controls — switch, link, expiry, rotation — shared by the
 * template list's dialog and the edit page's card, so the two can never drift.
 * Every change goes through the server actions and ends with a router refresh,
 * which re-reads the template (a rotated token only exists server-side).
 */
export function ShareSettingsPanel({
  workspaceId,
  template,
  onChanged,
}: ShareSettingsPanelProps) {
  const t = useTranslations()
  const router = useRouter()
  const { appUrl } = useTenantSettings()
  const { handleCopy } = useClipboard()
  const [shareEnabled, setShareEnabled] = useState(template.shareEnabled)
  const [expiry, setExpiry] = useState(
    toLocalInputValue(template.shareExpiresAt),
  )
  const [confirmingRotate, setConfirmingRotate] = useState(false)

  // The server is the source of truth once a refresh brings new props.
  useEffect(() => {
    setShareEnabled(template.shareEnabled)
    setExpiry(toLocalInputValue(template.shareExpiresAt))
  }, [template.shareEnabled, template.shareExpiresAt])

  const onError = ({ error }: { error: { serverError?: string } }) => {
    if (error.serverError) {
      toast.error(error.serverError)
    }
    setShareEnabled(template.shareEnabled)
    setExpiry(toLocalInputValue(template.shareExpiresAt))
  }

  const refresh = () => {
    router.refresh()
    onChanged?.()
  }

  const share = useAction(updateShareSettingsAction.bind(null, workspaceId), {
    onSuccess: refresh,
    onError,
  })
  const rotate = useAction(
    rotateShareTokenAction.bind(null, workspaceId, template.id),
    {
      onSuccess: () => {
        toast.success(t("templates.share.rotated"))
        setConfirmingRotate(false)
        refresh()
      },
      onError,
    },
  )

  const shareUrl = `${appUrl}/t/${template.shareToken}`
  const isExpired =
    template.shareExpiresAt !== null &&
    template.shareExpiresAt.getTime() < Date.now()

  const saveExpiry = (value: string) => {
    setExpiry(value)
    share.execute({
      templateId: template.id,
      shareEnabled,
      shareExpiresAt: value ? new Date(value).toISOString() : null,
    })
  }

  // The field reports "" while a date is half-typed, so leaving it never
  // clears the expiry: only a complete, changed value saves (the clear button
  // is the explicit way to remove one).
  const commitExpiry = () => {
    if (expiry === toLocalInputValue(template.shareExpiresAt)) {
      return
    }
    if (expiry) {
      saveExpiry(expiry)
    } else {
      setExpiry(toLocalInputValue(template.shareExpiresAt))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="template-share-enabled">
          {t("templates.share.enableLabel")}
        </Label>
        <div className="flex items-center gap-2">
          {share.isPending && (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          )}
          <Switch
            checked={shareEnabled}
            disabled={share.isPending}
            id="template-share-enabled"
            onCheckedChange={(checked) => {
              setShareEnabled(checked)
              share.execute({ templateId: template.id, shareEnabled: checked })
            }}
          />
        </div>
      </div>

      {shareEnabled && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="template-share-url">
              {t("templates.share.linkLabel")}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                className="truncate"
                id="template-share-url"
                readOnly
                value={shareUrl}
              />
              <Button
                aria-label={t("actions.copy")}
                className="flex-none"
                onClick={() => handleCopy(shareUrl)}
                size="icon"
                type="button"
                variant="outline"
              >
                <CopyIcon className="size-4" />
              </Button>
              <Button
                aria-label={t("templates.share.rotateLabel")}
                className="flex-none"
                onClick={() => setConfirmingRotate(true)}
                size="icon"
                title={t("templates.share.rotateLabel")}
                type="button"
                variant="outline"
              >
                <RefreshCwIcon className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="template-share-expiry">
              {t("templates.share.expiryLabel")}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="template-share-expiry"
                onBlur={commitExpiry}
                onChange={(event) => setExpiry(event.target.value)}
                type="datetime-local"
                value={expiry}
              />
              {expiry && (
                <Button
                  aria-label={t("templates.share.clearExpiry")}
                  className="flex-none"
                  disabled={share.isPending}
                  onClick={() => saveExpiry("")}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <XIcon className="size-4" />
                </Button>
              )}
            </div>
            <p
              className={
                isExpired
                  ? "text-destructive text-sm"
                  : "text-muted-foreground text-sm"
              }
            >
              {isExpired
                ? t("templates.share.expiredNotice")
                : t("templates.share.expiryHint")}
            </p>
          </div>
        </>
      )}

      <AlertDialog onOpenChange={setConfirmingRotate} open={confirmingRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("templates.share.rotateTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("templates.share.rotateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={rotate.isPending}
              onClick={() => rotate.execute()}
            >
              {rotate.isPending && (
                <Loader2Icon className="me-2 h-4 w-4 animate-spin" />
              )}
              {t("actions.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
