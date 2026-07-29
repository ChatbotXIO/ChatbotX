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

export function WhatsappPhoneVerificationPanel({
  workspaceId,
  integrationId,
  displayPhoneNumber,
  verifiedName,
  registrationError,
  initialCodeRequestedAt = null,
  onVerified,
}: WhatsappPhoneVerificationPanelProps) {
  const t = useTranslations()
  const router = useRouter()
  const [codeMethod, setCodeMethod] =
    useState<WhatsappVerificationCodeMethod>("SMS")
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

  const requestCodeAction = useAction(
    requestWhatsappVerificationCodeAction.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
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

  const { form, handleSubmitWithAction } = useHookFormAction(
    verifyWhatsappPhoneCodeAction.bind(null, workspaceId),
    zodResolver(verifyWhatsappPhoneCodeSchema),
    {
      actionProps: {
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
        onSuccess: () => {
          toast.success(t("whatsapp.phoneVerification.messages.verified"))
          router.refresh()
          onVerified?.()
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          integrationId,
          code: "",
        },
      },
    },
  )

  const isRequestDisabled = requestCodeAction.isPending || remainingSeconds > 0
  const errorMessage =
    registrationError?.userMessage ??
    registrationError?.userTitle ??
    registrationError?.message

  return (
    <Card className="my-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-medium text-base">
          <ShieldCheckIcon className="size-4" />
          {t("whatsapp.phoneVerification.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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

        <div className="grid grid-cols-2 gap-2">
          {VERIFICATION_METHODS.map((method) => {
            const Icon = method.icon
            const isSelected = method.value === codeMethod

            return (
              <Button
                aria-pressed={isSelected}
                key={method.value}
                onClick={() => setCodeMethod(method.value)}
                type="button"
                variant={isSelected ? "secondary" : "outline"}
              >
                <Icon className="size-4" />
                {t(method.translationKey)}
              </Button>
            )
          })}
        </div>

        <div className="flex justify-end">
          <Button
            disabled={isRequestDisabled}
            onClick={() =>
              requestCodeAction.execute({
                integrationId,
                codeMethod,
              })
            }
            size="sm"
            type="button"
            variant="secondary"
          >
            {requestCodeAction.isPending ? (
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
            <div className="flex justify-end">
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("whatsapp.phoneVerification.actions.verify")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
