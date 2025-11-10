"use client"

import type { OrganizationSettings } from "@aha.chat/database/types"
import type {
  WhatsappPhoneNumber,
  WhatsappPhoneNumberResponse,
} from "@aha.chat/integration-whatsapp/api/phone-number"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { RadioGroupField } from "@aha.chat/ui/components/form/radio-group-field"
import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import FacebookLogin, {
  type InitParams,
} from "@greatsumini/react-facebook-login"
import { zodResolver } from "@hookform/resolvers/zod"
import { SiWhatsapp, SiWhatsappHex } from "@icons-pack/react-simple-icons"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import ky from "ky"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useFormContext } from "react-hook-form"
import { toast } from "sonner"
import { clientErrorHandler } from "@/lib/errors/client-handler"
import { connectWhatsappAction } from "../actions/connect.action"
import { connectWhatsappSchema } from "../schemas"

// Constants
const API_ENDPOINT = "/api/whatsapp/phone-numbers/list"
const MAX_CARD_WIDTH = "max-w-md"
const CARD_MARGIN = "mx-auto mt-40"

// Form field names
const FORM_FIELDS = {
  WABA_ID: "wabaId",
  ACCESS_TOKEN: "accessToken",
  CONNECT_EXISTING: "connectExisting",
  TRANSFER_PHONE_NUMBER: "transferPhoneNumber",
  MANUAL_CONNECT: "manualConnect",
  MARKETING_MESSAGE_LITE: "marketingMessageLite",
  PHONE_NUMBER_ID: "phoneNumberId",
  BUSINESS_ID: "businessId",
  CODE: "code",
} as const

type FormVisibility = {
  connectExisting: boolean
  transferPhoneNumber: boolean
  manualConnect: boolean
  marketingMessageLite: boolean
}

// Custom hooks
function useFormVisibility() {
  const [visibility, setVisibility] = useState<FormVisibility>({
    connectExisting: true,
    transferPhoneNumber: true,
    manualConnect: false,
    marketingMessageLite: true,
  })

  const updateVisibility = useCallback((updates: Partial<FormVisibility>) => {
    setVisibility((prev) => ({ ...prev, ...updates }))
  }, [])

  return { visibility, updateVisibility }
}

function usePhoneNumbers() {
  const [phoneNumbers, setPhoneNumbers] = useState<WhatsappPhoneNumber[]>([])
  const [isLoading, startTransition] = useTransition()

  const clearPhoneNumbers = useCallback(() => {
    setPhoneNumbers([])
  }, [])

  return {
    phoneNumbers,
    setPhoneNumbers,
    isLoading,
    startTransition,
    clearPhoneNumbers,
  }
}

export default function WhatsappCreate({
  chatbotId,
  settings,
}: {
  chatbotId: string | null | undefined
  settings: NonNullable<OrganizationSettings["whatsapp"]>
}) {
  const t = useTranslations()
  const { visibility, updateVisibility } = useFormVisibility()
  const router = useRouter()
  // Form setup
  const { form, handleSubmitWithAction } = useHookFormAction(
    connectWhatsappAction,
    zodResolver(connectWhatsappSchema),
    {
      actionProps: {
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
        onSuccess: ({ data }) => {
          toast.success(t("messages.connectSuccess", { feature: "Whatsapp" }))
          router.push(data.redirectUrl)
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          // UI
          connectExisting: false,
          transferPhoneNumber: false,
          manualConnect: false,
          marketingMessageLite: false,
          chatbotId: chatbotId ?? "",

          // Main fields
          wabaId: "",
          businessId: "",
          phoneNumberId: "",
          accessToken: "",
          code: "",
        },
      },
    },
  )

  const { watch, setValue } = form
  const watchConnectExisting = watch(FORM_FIELDS.CONNECT_EXISTING)
  const watchTransferPhoneNumber = watch(FORM_FIELDS.TRANSFER_PHONE_NUMBER)
  const watchManualConnect = watch(FORM_FIELDS.MANUAL_CONNECT)

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) {
        return
      }

      try {
        const data = JSON.parse(event.data)
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          /*
           * {
           *     "data": {
           *         "phone_number_id": "111598575218611",
           *         "waba_id": "119496914420376",
           *         "business_id": "553355495727951"
           *     },
           *     "type": "WA_EMBEDDED_SIGNUP",
           *     "event": "FINISH",
           *     "version": "3"
           * }
           */
          if (data.event === "FINISH") {
            setValue(FORM_FIELDS.BUSINESS_ID, data.data.business_id)
            setValue(FORM_FIELDS.WABA_ID, data.data.waba_id)
            setValue(FORM_FIELDS.PHONE_NUMBER_ID, data.data.phone_number_id)
          } else if (data.event === "CANCEL") {
            setValue(FORM_FIELDS.BUSINESS_ID, "")
            setValue(FORM_FIELDS.WABA_ID, "")
            setValue(FORM_FIELDS.PHONE_NUMBER_ID, "")
          }
        }
      } catch {
        // biome-ignore lint/suspicious/noConsole: debug
        console.log("handle message event error: ", event)
      }
    }

    // Add the event listener
    window.addEventListener("message", handleMessage)

    // Cleanup function to remove the event listener
    return () => {
      window.removeEventListener("message", handleMessage)
    }
  }, [setValue]) // Empty dependency array ensures the effect runs only once on mount and unmount

  // Form visibility effects
  useEffect(() => {
    updateVisibility({
      transferPhoneNumber: !watchConnectExisting,
      manualConnect: watchConnectExisting,
    })

    if (!watchConnectExisting) {
      setValue(FORM_FIELDS.MANUAL_CONNECT, false)
    }
  }, [watchConnectExisting, setValue, updateVisibility])

  useEffect(() => {
    if (watchTransferPhoneNumber) {
      updateVisibility({
        connectExisting: false,
        manualConnect: false,
        marketingMessageLite: false,
      })
      setValue(FORM_FIELDS.MANUAL_CONNECT, false)
      setValue(FORM_FIELDS.MARKETING_MESSAGE_LITE, false)
    } else {
      updateVisibility({
        connectExisting: true,
        transferPhoneNumber: true,
        manualConnect: false,
        marketingMessageLite: true,
      })
    }
  }, [watchTransferPhoneNumber, setValue, updateVisibility])

  return (
    <Card className={`${CARD_MARGIN} ${MAX_CARD_WIDTH}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-bold text-2xl">
          <SiWhatsapp fill={SiWhatsappHex} />
          {t("whatsapp.title")}
        </CardTitle>
        <CardDescription />
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            {watchManualConnect ? (
              <ManualConnectSection watchManualConnect={watchManualConnect} />
            ) : (
              <SdkConnectSection
                settings={settings}
                visibility={visibility}
                watchManualConnect={watchManualConnect}
              />
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

type SdkConnectSectionProps = {
  visibility: FormVisibility
  watchManualConnect: boolean
  settings: NonNullable<OrganizationSettings["whatsapp"]>
}

function SdkConnectSection({
  visibility,
  watchManualConnect,
  settings,
}: SdkConnectSectionProps) {
  const t = useTranslations()
  const { setValue, watch, formState, trigger } = useFormContext()

  const switchFieldClassName =
    "flex items-center gap-2 flex-row-reverse justify-end"

  const finalSubmitRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      {visibility.connectExisting && (
        <SwitchField
          formItemClassName={switchFieldClassName}
          label={t("whatsapp.connectExisting")}
          name={FORM_FIELDS.CONNECT_EXISTING}
          required
        />
      )}

      {visibility.transferPhoneNumber && (
        <SwitchField
          formItemClassName={switchFieldClassName}
          label={t("whatsapp.transferPhoneNumber")}
          name={FORM_FIELDS.TRANSFER_PHONE_NUMBER}
          required
        />
      )}

      {visibility.manualConnect && (
        <ManualConnectSection watchManualConnect={watchManualConnect} />
      )}

      {visibility.marketingMessageLite && (
        <SwitchField
          formItemClassName={switchFieldClassName}
          label={t("whatsapp.marketingMessageLite")}
          name={FORM_FIELDS.MARKETING_MESSAGE_LITE}
          required
        />
      )}

      <div className="flex items-center justify-end gap-2">
        {!(watchManualConnect || watch(FORM_FIELDS.CODE)) && (
          <FacebookLogin
            appId={settings.clientId}
            className="inline-flex h-8 items-center justify-start gap-2 whitespace-nowrap rounded-md bg-secondary px-4 py-2 font-medium text-secondary-foreground text-sm shadow-xs transition-all hover:bg-secondary/80 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
            initParams={{
              version: (settings.version as InitParams["version"]) ?? "v18.0",
            }}
            loginOptions={
              {
                config_id: settings.configId,
                response_type: "code",
                override_default_response_type: true,
                return_scopes: true,
                extras: {
                  sessionInfoVersion: 3,
                  setup: {},
                  features: [],
                  featureType: "whatsapp_business_app_onboarding",
                },
                // biome-ignore lint/suspicious/noExplicitAny: some types are not supported
              } as any
            }
            onFail={(error) => {
              // biome-ignore lint/suspicious/noConsole: debug
              console.log("error", error)
              toast.error(t("messages.connectFailed", { feature: "Whatsapp" }))
            }}
            // biome-ignore lint/suspicious/noExplicitAny: this library does not support code returned
            onSuccess={async (res: any) => {
              if (res.code) {
                setValue(FORM_FIELDS.CODE, res.code)
                await trigger()

                if (formState.isValid) {
                  finalSubmitRef.current?.click()
                }
              }
            }}
            scope=""
          >
            {t("actions.continue")}
          </FacebookLogin>
        )}

        {watch(FORM_FIELDS.CODE) && (
          <div className="flex items-center justify-end gap-2">
            <Button
              disabled={formState.isSubmitting}
              ref={finalSubmitRef}
              size="sm"
              type="submit"
              variant="secondary"
            >
              {formState.isSubmitting && (
                <Loader2Icon className="animate-spin" />
              )}
              {t("actions.continue")}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

type ManualConnectSectionProps = {
  watchManualConnect: boolean
}

function ManualConnectSection({
  watchManualConnect,
}: ManualConnectSectionProps) {
  const t = useTranslations()
  const switchFieldClassName =
    "flex items-center gap-2 flex-row-reverse justify-end"

  const { setValue, getValues, formState } = useFormContext()

  const {
    phoneNumbers,
    setPhoneNumbers,
    isLoading: isLoadingPhoneNumbers,
    startTransition: startTransitionPhoneNumbers,
    clearPhoneNumbers,
  } = usePhoneNumbers()

  useEffect(() => {
    if (!watchManualConnect) {
      clearPhoneNumbers()

      setValue(FORM_FIELDS.WABA_ID, "")
      setValue(FORM_FIELDS.ACCESS_TOKEN, "")
      setValue(FORM_FIELDS.PHONE_NUMBER_ID, "")
    }
  }, [watchManualConnect, clearPhoneNumbers, setValue])

  // Event handlers
  const handleListPhoneNumbers = useCallback(() => {
    if (!(getValues().wabaId && getValues().accessToken)) {
      toast.error("Please fill in all required fields")
      return
    }

    startTransitionPhoneNumbers(async () => {
      try {
        const formData = getValues()
        const response = await ky
          .post<WhatsappPhoneNumberResponse>(API_ENDPOINT, {
            json: {
              wabaId: formData.wabaId ?? "",
              accessToken: formData.accessToken ?? "",
            },
          })
          .json()

        setPhoneNumbers(response.data)

        if (response.data.length === 0) {
          toast.error(t("fields.phoneNumberId.noPhoneNumbersFound"))
        }
      } catch (error) {
        await clientErrorHandler(error)
      }
    })
  }, [getValues, startTransitionPhoneNumbers, setPhoneNumbers, t])

  return (
    <>
      <SwitchField
        formItemClassName={switchFieldClassName}
        label={t("whatsapp.manualConnect")}
        name={FORM_FIELDS.MANUAL_CONNECT}
        required
      />

      {watchManualConnect && (
        <>
          {phoneNumbers.length === 0 && (
            <>
              <InputField
                label={t("fields.wabaId.label")}
                name={FORM_FIELDS.WABA_ID}
                required
              />

              <InputField
                label={t("fields.accessToken.label")}
                name={FORM_FIELDS.ACCESS_TOKEN}
                required
              />

              <div className="flex items-center justify-end gap-2">
                <Button
                  onClick={handleListPhoneNumbers}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {isLoadingPhoneNumbers && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.continue")}
                </Button>
              </div>
            </>
          )}

          {phoneNumbers.length > 0 && (
            <>
              <RadioGroupField
                label={t("fields.phoneNumberId.label")}
                name={FORM_FIELDS.PHONE_NUMBER_ID}
                options={phoneNumbers.map((pn) => ({
                  value: pn.id,
                  label: pn.display_phone_number,
                }))}
                required
              />

              <div className="flex items-center justify-end gap-2">
                <Button
                  disabled={!formState.isValid || formState.isSubmitting}
                  size="sm"
                  type="submit"
                  variant="secondary"
                >
                  {formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.continue")} manual connect
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
