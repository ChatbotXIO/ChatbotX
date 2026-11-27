"use client"

import type { TenantDefaultTemplateConfig } from "@chatbotx.io/business"
import type { TenantDefaultTemplateStatus } from "@chatbotx.io/database/partials"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
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
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import {
  type DefaultTemplateRejectionReason,
  updateDefaultTemplateSchema,
} from "./schema"
import {
  clearDefaultTemplateAction,
  clearRootDefaultTemplateAction,
  updateDefaultTemplateAction,
  updateRootDefaultTemplateAction,
} from "./update-default-template.action"

type DefaultTemplateScopeKind = "tenant" | "platform"

type DefaultTemplateSettingsProps = {
  /** `"tenant"`: a reseller's own white-label. `"platform"`: the root tenant. */
  scope: DefaultTemplateScopeKind
  settings: TenantDefaultTemplateConfig | null
}

type BadgeVariant = "default" | "secondary" | "destructive"

/** How each status reads in the badge; `null` (nothing configured) is its own entry. */
const STATUS_BADGE = {
  ready: {
    variant: "default",
    labelKey: "platformDefaultTemplate.status.ready",
  },
  notConfigured: {
    variant: "secondary",
    labelKey: "platformDefaultTemplate.status.notConfigured",
  },
  templateUnavailable: {
    variant: "destructive",
    labelKey: "platformDefaultTemplate.status.templateUnavailable",
  },
  shareDisabled: {
    variant: "destructive",
    labelKey: "platformDefaultTemplate.status.shareDisabled",
  },
  keyRotated: {
    variant: "destructive",
    labelKey: "platformDefaultTemplate.status.keyRotated",
  },
} as const satisfies Record<
  TenantDefaultTemplateStatus | "notConfigured",
  { variant: BadgeVariant; labelKey: string }
>

const REJECTION_MESSAGE_KEY = {
  unavailable: "platformDefaultTemplate.errors.unavailable",
  shareDisabled: "platformDefaultTemplate.errors.shareDisabled",
} as const satisfies Record<DefaultTemplateRejectionReason, string>

const ACTIONS: Record<
  DefaultTemplateScopeKind,
  {
    save: typeof updateDefaultTemplateAction
    clear: typeof clearDefaultTemplateAction
  }
> = {
  tenant: {
    save: updateDefaultTemplateAction,
    clear: clearDefaultTemplateAction,
  },
  platform: {
    save: updateRootDefaultTemplateAction,
    clear: clearRootDefaultTemplateAction,
  },
}

export function DefaultTemplateSettings({
  scope,
  settings,
}: DefaultTemplateSettingsProps) {
  const t = useTranslations()
  const router = useRouter()
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [isKeyVisible, setIsKeyVisible] = useState(false)
  const actions = ACTIONS[scope]
  const badgeStatus = settings?.status ?? "notConfigured"

  const { form, handleSubmitWithAction } = useHookFormAction(
    actions.save,
    zodResolver(updateDefaultTemplateSchema),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          if (data?.status === "rejected") {
            form.setError("templateKey", {
              message: t(REJECTION_MESSAGE_KEY[data.reason]),
            })
            return
          }
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("platformDefaultTemplate.title"),
            }),
          )
          router.refresh()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        defaultValues: {
          templateId: settings?.templateId ?? "",
          templateKey: settings?.templateKey ?? "",
        },
      },
    },
  )

  const { execute: executeClear, isPending: isClearing } = useAction(
    actions.clear,
    {
      onSuccess: () => {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("platformDefaultTemplate.title"),
          }),
        )
        form.reset({ templateId: "", templateKey: "" })
        setConfirmClearOpen(false)
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        method="post"
        onSubmit={handleSubmitWithAction}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("platformDefaultTemplate.title")}
              <Badge variant={STATUS_BADGE[badgeStatus].variant}>
                {t(STATUS_BADGE[badgeStatus].labelKey)}
              </Badge>
            </CardTitle>
            <CardDescription>
              {t("platformDefaultTemplate.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <InputField
              autoComplete="off"
              inputMode="numeric"
              label={t("templates.share.templateId")}
              name="templateId"
              required
            />
            <FormFieldWrapper
              label={t("templates.share.templateKey")}
              name="templateKey"
              required
            >
              {(field) => (
                <div className="relative">
                  <Input
                    {...field}
                    autoComplete="new-password"
                    className="pe-10"
                    data-1p-ignore
                    data-lpignore="true"
                    type={isKeyVisible ? "text" : "password"}
                    value={String(field.value ?? "")}
                  />
                  <Button
                    aria-label={
                      isKeyVisible
                        ? t("templates.share.hideKey")
                        : t("templates.share.showKey")
                    }
                    className="absolute end-0 top-0 h-full px-3 text-muted-foreground"
                    onClick={() => setIsKeyVisible((visible) => !visible)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {isKeyVisible ? (
                      <EyeOffIcon aria-hidden className="size-4" />
                    ) : (
                      <EyeIcon aria-hidden className="size-4" />
                    )}
                  </Button>
                </div>
              )}
            </FormFieldWrapper>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            {settings && (
              <Button
                disabled={isClearing}
                onClick={() => setConfirmClearOpen(true)}
                type="button"
                variant="outline"
              >
                {t("actions.clear")}
              </Button>
            )}
            <Button disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              {t("actions.save")}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <AlertDialog onOpenChange={setConfirmClearOpen} open={confirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("platformDefaultTemplate.clearTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("platformDefaultTemplate.clearDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isClearing}
              onClick={() => executeClear()}
            >
              {isClearing && (
                <Loader2Icon className="me-2 size-4 animate-spin" />
              )}
              {t("actions.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  )
}
