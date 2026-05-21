"use client"

import type { OrganizationModel } from "@chatbotx.io/database/types"
import { fileTypes } from "@chatbotx.io/sdk"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { CodeEditorField } from "@/components/code-editor-field"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { themeOptions, updateOrganizationSchema } from "./schema"
import { updateOrganizationAction } from "./update-organization.action"

const THEME_SELECT_OPTIONS = themeOptions.map((theme) => ({
  value: theme,
  label: theme,
}))

type OrganizationSettingsProps = {
  organization: OrganizationModel
}

export function OrganizationSettings({
  organization,
}: OrganizationSettingsProps) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateOrganizationAction,
    zodResolver(updateOrganizationSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("organizationSettings.title"),
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
          name: organization.name,
          logo: {
            url: organization.logo ?? "",
            mode: "file" as const,
          },
          theme:
            themeOptions.find(
              (opt) =>
                opt.toLowerCase() === (organization.theme ?? "").toLowerCase(),
            ) ?? null,
          customJS: organization.customJS ?? "",
          customCSS: organization.customCSS ?? "",
        },
      },
    },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("organizationSettings.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmitWithAction}
          >
            <InputField
              label={t("fields.name.label")}
              name="name"
              placeholder={t("fields.name.placeholder")}
              required
            />

            <div className="flex flex-col gap-2">
              <Label>{t("fields.logo.label")}</Label>
              <Card>
                <CardContent>
                  <DirectUploadOrInsertLink
                    fileType={fileTypes.enum.image}
                    parentName="logo"
                    uploadPath={`public/organization/${organization.id}/logo`}
                  />
                </CardContent>
              </Card>
            </div>

            <SelectField
              allowClear
              label={t("fields.theme.label")}
              name="theme"
              options={THEME_SELECT_OPTIONS}
              placeholder={t("fields.theme.placeholder")}
            />

            <CodeEditorField
              label={t("fields.customJS.label")}
              language="javascript"
              name="customJS"
            />

            <CodeEditorField
              label={t("fields.customCSS.label")}
              language="css"
              name="customCSS"
            />

            <div className="flex justify-end">
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="size-4 animate-spin" />
                )}
                {t("actions.save")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
