"use client"

import type { SipProvisioningStatus } from "@chatbotx.io/database/partials"
import type { WhatsappCallingSettings } from "@chatbotx.io/integration-whatsapp/api/calling"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { fixWhatsappCallsSubscriptionAction } from "./actions/fix-whatsapp-calls-subscription.action"
import { updateWhatsappCallingSettingsAction } from "./actions/update-calling-settings.action"
import {
  deprovisionWhatsappSipAction,
  provisionWhatsappSipAction,
} from "./actions/whatsapp-sip-provisioning.action"
import type { WhatsappCallingPreflight } from "./get-whatsapp-calling-preflight"
import type { UpdateWhatsappCallingSettingsSchema } from "./schemas/update-calling-settings-schema"

type WhatsappCallsCardProps = {
  workspaceId: string
  integrationWhatsappId: string
  settings: WhatsappCallingSettings | null
  loadError?: string
  sipProvisioningStatus?: SipProvisioningStatus
  recordingEnabled?: boolean
  recordingRetentionDays?: number
  transcriptionEnabled?: boolean
  /** Eligibility preflight. `null` when the current user
   * could not be resolved against the workspace. */
  preflight?: WhatsappCallingPreflight | null
  isSuperAdmin?: boolean
}

type ToggleRowProps = {
  label: string
  helper: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (next: boolean) => void
}

const ToggleRow = ({
  label,
  helper,
  checked,
  disabled,
  onCheckedChange,
}: ToggleRowProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-sm">{label}</span>
      <span className="text-muted-foreground text-xs">{helper}</span>
    </div>
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    />
  </div>
)

const PROVISIONING_BADGE_VARIANT: Record<
  SipProvisioningStatus,
  "outline" | "secondary" | "default" | "destructive"
> = {
  none: "outline",
  provisioning: "secondary",
  provisioned: "secondary",
  enabled: "default",
  failed: "destructive",
}

function SipProvisioningControls({
  workspaceId,
  integrationWhatsappId,
  status,
  isSuperAdmin,
}: {
  workspaceId: string
  integrationWhatsappId: string
  status: SipProvisioningStatus
  isSuperAdmin: boolean
}) {
  const t = useTranslations()
  const provision = useAction(
    provisionWhatsappSipAction.bind(null, workspaceId, integrationWhatsappId),
    {
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )
  const deprovision = useAction(
    deprovisionWhatsappSipAction.bind(null, workspaceId, integrationWhatsappId),
    {
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">
          {t("whatsapp.calls.sip.provisioningLabel")}
        </span>
        <Badge variant={PROVISIONING_BADGE_VARIANT[status]}>
          {t(`whatsapp.calls.sip.status.${status}`)}
        </Badge>
      </div>
      {isSuperAdmin && (
        <div className="flex gap-2">
          {(status === "none" || status === "failed") && (
            <Button
              disabled={provision.isPending}
              onClick={() => provision.execute()}
              size="sm"
              type="button"
              variant="outline"
            >
              {provision.isPending && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              {t("whatsapp.calls.sip.provisionButton")}
            </Button>
          )}
          {(status === "provisioned" || status === "enabled") && (
            <Button
              disabled={deprovision.isPending}
              onClick={() => deprovision.execute()}
              size="sm"
              type="button"
              variant="outline"
            >
              {deprovision.isPending && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              {t("whatsapp.calls.sip.deprovisionButton")}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function WhatsappCallingPreflightNotices({
  preflight,
  isSuperAdmin,
  workspaceId,
  integrationWhatsappId,
}: {
  preflight: WhatsappCallingPreflight
  isSuperAdmin: boolean
  workspaceId: string
  integrationWhatsappId: string
}) {
  const t = useTranslations()
  const { execute, isPending } = useAction(
    fixWhatsappCallsSubscriptionAction.bind(
      null,
      workspaceId,
      integrationWhatsappId,
    ),
    {
      onSuccess: () => {
        toast.success(t("whatsapp.calls.preflight.fixSuccess"))
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("messages.unknownError"))
      },
    },
  )

  if (preflight.isManual) {
    return (
      <Alert>
        <AlertCircleIcon className="size-4" />
        <AlertDescription>
          {t("whatsapp.calls.preflight.manualIntegrationNotice")}
        </AlertDescription>
      </Alert>
    )
  }

  const notices: string[] = []
  if (preflight.hasAppCredential && preflight.callsSubscribed === false) {
    notices.push(t("whatsapp.calls.preflight.callsNotSubscribed"))
  }
  if (preflight.isCloudApiPlatform === false) {
    notices.push(t("whatsapp.calls.preflight.coexistenceWarning"))
  }
  if (preflight.messagingLimitSufficient === false) {
    notices.push(t("whatsapp.calls.preflight.messagingLimitTooLow"))
  }

  if (notices.length === 0) {
    return null
  }

  const showFixButton =
    isSuperAdmin &&
    preflight.hasAppCredential &&
    preflight.callsSubscribed === false

  return (
    <Alert variant="destructive">
      <AlertCircleIcon className="size-4" />
      <AlertTitle>{t("whatsapp.calls.preflight.title")}</AlertTitle>
      <AlertDescription>
        <ul className="list-inside list-disc">
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
        {showFixButton && (
          <Button
            className="mt-2"
            disabled={isPending}
            onClick={() => execute()}
            size="sm"
            type="button"
            variant="outline"
          >
            {isPending && <Loader2Icon className="size-4 animate-spin" />}
            {t("whatsapp.calls.preflight.fixButton")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function WhatsappCallsCard({
  workspaceId,
  integrationWhatsappId,
  settings,
  loadError,
  sipProvisioningStatus = "none",
  recordingEnabled = false,
  recordingRetentionDays = 90,
  transcriptionEnabled = false,
  preflight,
  isSuperAdmin = false,
}: WhatsappCallsCardProps) {
  const t = useTranslations()
  const [current, setCurrent] = useState<WhatsappCallingSettings>(
    settings ?? { status: "DISABLED" },
  )
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(recordingEnabled)
  const [retentionDays, setRetentionDays] = useState(recordingRetentionDays)
  const [isTranscriptionEnabled, setIsTranscriptionEnabled] =
    useState(transcriptionEnabled)
  // Meta's refusal stays readable in the card after the toast is gone — the
  // reason (messaging tier, coexistence number, …) is what the operator acts on.
  const [updateError, setUpdateError] = useState<string>()
  // Snapshot for rolling back the optimistic update when Meta rejects the
  // change — without it the switches would keep showing a state that was
  // never applied remotely.
  const previousRef = useRef(current)
  const previousRecordingRef = useRef(recordingEnabled)
  const previousTranscriptionRef = useRef(transcriptionEnabled)

  const { execute, isPending } = useAction(
    updateWhatsappCallingSettingsAction.bind(
      null,
      workspaceId,
      integrationWhatsappId,
    ),
    {
      onSuccess: () => {
        setUpdateError(undefined)
        toast.success(t("messages.savedSuccessfully"))
      },
      onError: ({ error }) => {
        setCurrent(previousRef.current)
        setIsRecordingEnabled(previousRecordingRef.current)
        setIsTranscriptionEnabled(previousTranscriptionRef.current)
        const message = error.serverError ?? t("messages.unknownError")
        setUpdateError(message)
        toast.error(message)
      },
    },
  )

  const apply = (
    input: UpdateWhatsappCallingSettingsSchema,
    next: WhatsappCallingSettings,
  ) => {
    previousRef.current = current
    setCurrent(next)
    execute(input)
  }

  const isCallingEnabled = current.status === "ENABLED"
  const isSipProvisioned =
    sipProvisioningStatus === "provisioned" ||
    sipProvisioningStatus === "enabled"

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("whatsapp.calls.title")}</CardTitle>
          <CardDescription>{t("whatsapp.calls.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircleIcon className="size-4" />
            <AlertDescription>
              {t("whatsapp.calls.loadFailed")}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("whatsapp.calls.title")}</CardTitle>
        <CardDescription>{t("whatsapp.calls.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {preflight && (
          <WhatsappCallingPreflightNotices
            integrationWhatsappId={integrationWhatsappId}
            isSuperAdmin={isSuperAdmin}
            preflight={preflight}
            workspaceId={workspaceId}
          />
        )}
        {updateError && (
          <Alert variant="destructive">
            <AlertCircleIcon className="size-4" />
            <AlertTitle>{t("whatsapp.calls.updateFailedTitle")}</AlertTitle>
            <AlertDescription>{updateError}</AlertDescription>
          </Alert>
        )}
        <ToggleRow
          checked={isCallingEnabled}
          disabled={isPending}
          helper={t("whatsapp.calls.enableHelper")}
          label={t("whatsapp.calls.enableLabel")}
          onCheckedChange={(next) =>
            apply(
              { status: next ? "ENABLED" : "DISABLED" },
              { ...current, status: next ? "ENABLED" : "DISABLED" },
            )
          }
        />
        <ToggleRow
          checked={current.call_icon_visibility !== "DISABLE_ALL"}
          disabled={isPending || !isCallingEnabled}
          helper={t("whatsapp.calls.iconVisibilityHelper")}
          label={t("whatsapp.calls.iconVisibilityLabel")}
          onCheckedChange={(next) =>
            apply(
              { callIconVisibility: next ? "DEFAULT" : "DISABLE_ALL" },
              {
                ...current,
                call_icon_visibility: next ? "DEFAULT" : "DISABLE_ALL",
              },
            )
          }
        />
        <ToggleRow
          checked={current.callback_permission_status === "ENABLED"}
          disabled={isPending || !isCallingEnabled}
          helper={t("whatsapp.calls.callbackPermissionHelper")}
          label={t("whatsapp.calls.callbackPermissionLabel")}
          onCheckedChange={(next) =>
            apply(
              { callbackPermissionStatus: next ? "ENABLED" : "DISABLED" },
              {
                ...current,
                callback_permission_status: next ? "ENABLED" : "DISABLED",
              },
            )
          }
        />

        <SipProvisioningControls
          integrationWhatsappId={integrationWhatsappId}
          isSuperAdmin={isSuperAdmin}
          status={sipProvisioningStatus}
          workspaceId={workspaceId}
        />

        <ToggleRow
          checked={current.sip?.status === "ENABLED"}
          disabled={isPending || !isCallingEnabled || !isSipProvisioned}
          helper={
            isSipProvisioned
              ? t("whatsapp.calls.inAppCallingHelper")
              : t("whatsapp.calls.sip.errors.notProvisioned")
          }
          label={t("whatsapp.calls.inAppCallingLabel")}
          onCheckedChange={(next) =>
            apply(
              { sipEnabled: next },
              {
                ...current,
                sip: {
                  ...current.sip,
                  status: next ? "ENABLED" : "DISABLED",
                },
              },
            )
          }
        />
        <ToggleRow
          checked={isRecordingEnabled}
          disabled={isPending || !isCallingEnabled}
          helper={t("whatsapp.calls.recordingHelper")}
          label={t("whatsapp.calls.recordingLabel")}
          onCheckedChange={(next) => {
            previousRef.current = current
            previousRecordingRef.current = isRecordingEnabled
            setIsRecordingEnabled(next)
            execute({ recordingEnabled: next })
          }}
        />
        {isRecordingEnabled && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-sm">
                {t("whatsapp.calls.retentionLabel")}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("whatsapp.calls.retentionHelper")}
              </span>
            </div>
            <Input
              className="w-24"
              disabled={isPending}
              max={3650}
              min={1}
              onBlur={() =>
                execute({ callRecordingRetentionDays: retentionDays })
              }
              onChange={(event) => {
                const next = Number(event.target.value)
                if (Number.isInteger(next) && next >= 1 && next <= 3650) {
                  setRetentionDays(next)
                }
              }}
              type="number"
              value={retentionDays}
            />
          </div>
        )}
        <ToggleRow
          checked={isTranscriptionEnabled}
          disabled={isPending || !isCallingEnabled}
          helper={t("whatsapp.calls.transcriptionHelper")}
          label={t("whatsapp.calls.transcriptionLabel")}
          onCheckedChange={(next) => {
            previousTranscriptionRef.current = isTranscriptionEnabled
            setIsTranscriptionEnabled(next)
            execute({ callTranscriptionEnabled: next })
          }}
        />
        <p className="text-muted-foreground text-xs">
          {t("whatsapp.calls.propagationNote")}
        </p>
      </CardContent>
    </Card>
  )
}
