"use client"

import type { IntegrationWhatsappRegistrationError } from "@chatbotx.io/database/schema"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import {
  Loader2Icon,
  type LucideIcon,
  MessageSquareTextIcon,
  PhoneCallIcon,
  SendIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  requestWhatsappVerificationCodeAction,
  verifyWhatsappPhoneCodeAction,
} from "./actions"
import {
  verifyWhatsappPhoneCodeSchema,
  WHATSAPP_VERIFICATION_COOLDOWN_SECONDS,
  type WhatsappVerificationCodeMethod,
} from "./schema"

type WhatsappPhoneVerificationPanelProps = {
  workspaceId: string
  integrationId: string
  displayPhoneNumber?: string
  verifiedName?: string
  registrationError?: IntegrationWhatsappRegistrationError | null
  initialCodeRequestedAt?: string | null
  onVerified?: () => void
  /**
   * When given, a "Skip" sits left of the submit button and lets the operator
   * leave this number unverified for now; the number keeps its verification
   * state and this panel can be reopened from its account-health page.
   */
  onSkip?: () => void
}

type VerificationMethodConfig = {
  value: WhatsappVerificationCodeMethod
  translationKey: string
  icon: LucideIcon
}

const VERIFICATION_METHODS: readonly VerificationMethodConfig[] = [
  {
    value: "SMS",
    translationKey: "whatsapp.phoneVerification.methods.sms",
    icon: MessageSquareTextIcon,
  },
  {
    value: "VOICE",
    translationKey: "whatsapp.phoneVerification.methods.voice",
    icon: PhoneCallIcon,
  },
] as const

function calculateRemainingSeconds(requestedAt: string | null): number {
  if (!requestedAt) {
    return 0
  }

  const requestedTime = new Date(requestedAt).getTime()
  const nextAllowedTime =
    requestedTime + WHATSAPP_VERIFICATION_COOLDOWN_SECONDS * 1000

  return Math.max(0, Math.ceil((nextAllowedTime - Date.now()) / 1000))
}

/** Both actions surface a server error the same way. */
const toastServerError = ({ error }: { error: { serverError?: string } }) => {
  if (error.serverError) {
    toast.error(error.serverError)
  }
}

/**
 * The "send code" action together with the cooldown countdown it drives — the
 * server owns the cooldown, so a `cooldown` response overrides the local
 * count rather than the other way round.
 */
function useVerificationCodeRequest({
  workspaceId,
  integrationId,
  initialCodeRequestedAt,
  codeMethod,
}: {
  workspaceId: string
  integrationId: string
  initialCodeRequestedAt: string | null
  codeMethod: WhatsappVerificationCodeMethod
}) {
  const t = useTranslations()
  const [codeRequestedAt, setCodeRequestedAt] = useState<string | null>(
    initialCodeRequestedAt,
  )
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    calculateRemainingSeconds(initialCodeRequestedAt),
  )

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingSeconds(calculateRemainingSeconds(codeRequestedAt))
    }, 1000)

    return () => window.clearInterval(interval)
  }, [codeRequestedAt])

  const selectedMethodLabel = useMemo(
    () =>
      t(
        VERIFICATION_METHODS.find((method) => method.value === codeMethod)
          ?.translationKey ?? VERIFICATION_METHODS[0].translationKey,
      ),
    [codeMethod, t],
  )

  const action = useAction(
    requestWhatsappVerificationCodeAction.bind(null, workspaceId),
    {
      onError: toastServerError,
      onSuccess: ({ data }) => {
        if (!data) {
          return
        }

        setCodeRequestedAt(data.requestedAt)
        if (data.status === "cooldown") {
          setRemainingSeconds(data.remainingSeconds)
          toast.error(
            t("whatsapp.phoneVerification.messages.cooldown", {
              seconds: data.remainingSeconds,
            }),
          )
          return
        }

        setRemainingSeconds(WHATSAPP_VERIFICATION_COOLDOWN_SECONDS)
        toast.success(
          t("whatsapp.phoneVerification.messages.codeSent", {
            method: selectedMethodLabel,
          }),
        )
      },
    },
  )

  return {
    remainingSeconds,
    isPending: action.isPending,
    requestCode: () => action.execute({ integrationId, codeMethod }),
  }
}

/** The code-entry form, wired to the verify action. */
function useVerifyPhoneCodeForm({
  workspaceId,
  integrationId,
  onVerified,
}: {
  workspaceId: string
  integrationId: string
  onVerified?: () => void
}) {
  const t = useTranslations()
  const router = useRouter()

  return useHookFormAction(
    verifyWhatsappPhoneCodeAction.bind(null, workspaceId),
    zodResolver(verifyWhatsappPhoneCodeSchema),
    {
      actionProps: {
        onError: toastServerError,
        onSuccess: () => {
          toast.success(t("whatsapp.phoneVerification.messages.verified"))
          router.refresh()
          onVerified?.()
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: { integrationId, code: "" },
      },
    },
  )
}

/** The number this panel is verifying, plus what Meta said went wrong. */
function VerificationSummary({
  verifiedName,
  displayPhoneNumber,
  registrationError,
}: Pick<
  WhatsappPhoneVerificationPanelProps,
  "verifiedName" | "displayPhoneNumber" | "registrationError"
>) {
  const t = useTranslations()
  const errorMessage =
    registrationError?.userMessage ??
    registrationError?.userTitle ??
    registrationError?.message

  return (
    <>
      <div className="flex flex-col gap-1 text-sm">
        {verifiedName && <p className="font-medium">{verifiedName}</p>}
        {displayPhoneNumber && (
          <p className="text-muted-foreground">{displayPhoneNumber}</p>
        )}
        <p className="text-muted-foreground">
          {t("whatsapp.phoneVerification.description")}
        </p>
      </div>

      {errorMessage && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            {registrationError?.userTitle ??
              t("whatsapp.phoneVerification.errorTitle")}
          </AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </>
  )
}

/** SMS / voice-call picker. */
function VerificationMethodPicker({
  codeMethod,
  onSelect,
}: {
  codeMethod: WhatsappVerificationCodeMethod
  onSelect: (method: WhatsappVerificationCodeMethod) => void
}) {
  const t = useTranslations()
  return (
    <div className="grid grid-cols-2 gap-2">
      {VERIFICATION_METHODS.map((method) => {
        const Icon = method.icon
        const isSelected = method.value === codeMethod

        return (
          <Button
            aria-pressed={isSelected}
            key={method.value}
            onClick={() => onSelect(method.value)}
            type="button"
            variant={isSelected ? "secondary" : "outline"}
          >
            <Icon className="size-4" />
            {t(method.translationKey)}
          </Button>
        )
      })}
    </div>
  )
}

/** "Send code" / "Resend in Ns", with its own pending spinner. */
function SendCodeButton({
  disabled,
  isPending,
  onSend,
  remainingSeconds,
}: {
  disabled: boolean
  isPending: boolean
  onSend: () => void
  remainingSeconds: number
}) {
  const t = useTranslations()
  return (
    <div className="flex justify-end">
      <Button
        disabled={disabled}
        onClick={onSend}
        size="sm"
        type="button"
        variant="secondary"
      >
        {isPending ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <SendIcon className="size-4" />
        )}
        {remainingSeconds > 0
          ? t("whatsapp.phoneVerification.actions.resendIn", {
              seconds: remainingSeconds,
            })
          : t("whatsapp.phoneVerification.actions.sendCode")}
      </Button>
    </div>
  )
}

/**
 * Verify, plus Skip when the caller offers one. Skip belongs to the connect
 * dialog's OTP queue (it advances to the next number); the account-health page
 * passes no `onSkip`, so no button renders there.
 */
function VerifyFormActions({
  isSubmitting,
  isValid,
  onSkip,
}: {
  isSubmitting: boolean
  isValid: boolean
  onSkip?: () => void
}) {
  const t = useTranslations()
  return (
    <div className="flex justify-end gap-2">
      {onSkip ? (
        <Button
          disabled={isSubmitting}
          onClick={onSkip}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("whatsapp.phoneVerification.actions.skip")}
        </Button>
      ) : null}
      <Button disabled={!isValid || isSubmitting} size="sm" type="submit">
        {isSubmitting && <Loader2Icon className="animate-spin" />}
        {t("whatsapp.phoneVerification.actions.verify")}
      </Button>
    </div>
  )
}

export function WhatsappPhoneVerificationPanel({
  workspaceId,
  integrationId,
  displayPhoneNumber,
  verifiedName,
  registrationError,
  initialCodeRequestedAt = null,
  onVerified,
  onSkip,
}: WhatsappPhoneVerificationPanelProps) {
  const t = useTranslations()
  const [codeMethod, setCodeMethod] =
    useState<WhatsappVerificationCodeMethod>("SMS")

  const { remainingSeconds, isPending, requestCode } =
    useVerificationCodeRequest({
      workspaceId,
      integrationId,
      initialCodeRequestedAt,
      codeMethod,
    })
  const { form, handleSubmitWithAction } = useVerifyPhoneCodeForm({
    workspaceId,
    integrationId,
    onVerified,
  })

  const isRequestDisabled = isPending || remainingSeconds > 0

  return (
    <Card className="my-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-medium text-base">
          <ShieldCheckIcon className="size-4" />
          {t("whatsapp.phoneVerification.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <VerificationSummary
          displayPhoneNumber={displayPhoneNumber}
          registrationError={registrationError}
          verifiedName={verifiedName}
        />

        <VerificationMethodPicker
          codeMethod={codeMethod}
          onSelect={setCodeMethod}
        />

        <SendCodeButton
          disabled={isRequestDisabled}
          isPending={isPending}
          onSend={requestCode}
          remainingSeconds={remainingSeconds}
        />

        <Form {...form}>
          <form
            className="flex flex-col gap-3"
            onSubmit={handleSubmitWithAction}
          >
            <InputField name="integrationId" type="hidden" />
            <InputField
              label={t("whatsapp.phoneVerification.fields.code.label")}
              name="code"
              placeholder={t(
                "whatsapp.phoneVerification.fields.code.placeholder",
              )}
              required
            />
            <VerifyFormActions
              isSubmitting={form.formState.isSubmitting}
              isValid={form.formState.isValid}
              onSkip={onSkip}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
