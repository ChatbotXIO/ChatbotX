"use client"

import type { ValidateIngestFailureCode } from "@chatbotx.io/business"
import {
  type GoogleAdsClickIdType,
  googleAdsClickIdTypeValues,
} from "@chatbotx.io/database/partials"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { isSendableConversionAction } from "@chatbotx.io/utils/google-click"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useId, useState } from "react"
import { toast } from "sonner"
import { validateGoogleAdsRequestAction } from "../actions/validate-request.action"
import { useInvalidateGoogleAds } from "../hooks/use-invalidate-google-ads"
import { clickIdTypeLabelKey, validateReasonLabelKey } from "../lib/status"
import type { GoogleAdsSettingsConversionAction } from "../lib/to-settings-view"
import { validateGoogleAdsRequest } from "../schema/actions"
import {
  ValidateConsentLines,
  type ValidateConsentResult,
} from "./validate-consent-summary"

type ValidateRequestDialogProps = {
  workspaceId: string
  actions: GoogleAdsSettingsConversionAction[]
}

type ValidationOutcome =
  | ({ kind: "ok" } & ValidateConsentResult)
  | { kind: "failed"; code: ValidateIngestFailureCode; detail?: string }
  | { kind: "invalid" }

export const ValidateRequestDialog = ({
  workspaceId,
  actions,
}: ValidateRequestDialogProps) => {
  const t = useTranslations()
  const router = useRouter()
  const invalidate = useInvalidateGoogleAds()
  const ids = useId()
  const [open, setOpen] = useState(false)
  const [conversionActionId, setConversionActionId] = useState("")
  const [clickIdType, setClickIdType] = useState<GoogleAdsClickIdType>("gclid")
  const [clickId, setClickId] = useState("")
  const [outcome, setOutcome] = useState<ValidationOutcome | null>(null)

  const selectable = actions.filter(isSendableConversionAction)

  /** Validation can refresh tokens or mark the connection needs_reauth, so re-read whichever way it settled. */
  const refreshReads = async () => {
    await invalidate()
    router.refresh()
  }

  const { execute, isPending } = useAction(
    validateGoogleAdsRequestAction.bind(null, workspaceId),
    {
      onSuccess: async ({ data }) => {
        setOutcome(
          data?.ok
            ? {
                kind: "ok",
                consentSummary: data.consentSummary,
                variableSkipped: data.variableSkipped,
                withheldAdPersonalization: data.withheldAdPersonalization,
              }
            : {
                kind: "failed",
                code: data?.ok === false ? data.code : "rejected",
                detail: data?.ok === false ? data.detail : undefined,
              },
        )
        await refreshReads()
      },
      onError: async ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
        await refreshReads()
      },
    },
  )

  const submit = () => {
    const parsed = validateGoogleAdsRequest.safeParse({
      conversionActionId,
      clickIdType,
      clickId: clickId.trim(),
    })
    if (!parsed.success) {
      setOutcome({ kind: "invalid" })
      return
    }
    setOutcome(null)
    execute(parsed.data)
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setOutcome(null)
          setClickId("")
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button
            disabled={selectable.length === 0}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("googleAds.validate.open")}
          </Button>
        }
      />
      <DialogContent className="max-h-screen max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("googleAds.validate.title")}</DialogTitle>
          <DialogDescription>
            {t("googleAds.validate.description")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label id={`${ids}-action`}>
              {t("googleAds.validate.conversionAction")}
            </Label>
            <Select
              items={selectable.map((action) => ({
                value: action.id,
                label: action.name,
              }))}
              onValueChange={(value) => setConversionActionId(String(value))}
              value={conversionActionId}
            >
              <SelectTrigger
                aria-labelledby={`${ids}-action`}
                className="w-full"
              >
                <SelectValue placeholder={t("actions.pleaseSelect")} />
              </SelectTrigger>
              <SelectContent>
                {selectable.map((action) => (
                  <SelectItem key={action.id} value={action.id}>
                    {action.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label id={`${ids}-type`}>
              {t("googleAds.validate.clickIdType")}
            </Label>
            <Select
              items={googleAdsClickIdTypeValues.map((type) => ({
                value: type,
                label: t(clickIdTypeLabelKey[type]),
              }))}
              onValueChange={(value) =>
                setClickIdType(String(value) as GoogleAdsClickIdType)
              }
              value={clickIdType}
            >
              <SelectTrigger aria-labelledby={`${ids}-type`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {googleAdsClickIdTypeValues.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(clickIdTypeLabelKey[type])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-click`}>
              {t("googleAds.validate.clickId")}
            </Label>
            <Input
              autoComplete="off"
              id={`${ids}-click`}
              onChange={(event) => setClickId(event.target.value)}
              spellCheck={false}
              value={clickId}
            />
          </div>
          <div aria-live="polite" className="min-w-0" role="status">
            {outcome?.kind === "ok" ? (
              <Alert>
                <AlertDescription>
                  {t("googleAds.validate.ok")}
                  <ValidateConsentLines result={outcome} />
                </AlertDescription>
              </Alert>
            ) : null}
            {outcome?.kind === "invalid" ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {t("googleAds.validate.invalid")}
                </AlertDescription>
              </Alert>
            ) : null}
            {outcome?.kind === "failed" ? (
              <Alert variant="destructive">
                <AlertDescription className="wrap-anywhere min-w-0">
                  {t(validateReasonLabelKey[outcome.code])}
                  {outcome.detail ? `: ${outcome.detail}` : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button size="sm" type="button" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              }
            />
            <Button disabled={isPending} size="sm" type="submit">
              {isPending ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : null}
              {t("googleAds.validate.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
