"use client"

import type { TenantModel } from "@chatbotx.io/database/types"
import { fileTypes } from "@chatbotx.io/sdk"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@chatbotx.io/ui/components/ui/tabs"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { CodeEditorField } from "@/components/code-editor-field"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { themeOptions, updatePlatformBrandingSchema } from "./schema"
import { updatePlatformBrandingAction } from "./update-platform-branding.action"

const THEME_COLORS: Record<(typeof themeOptions)[number], string> = {
  Amber: "#f59e0b",
  Blue: "#3b82f6",
  Cyan: "#06b6d4",
  Emerald: "#10b981",
  Fuchsia: "#d946ef",
  Green: "#22c55e",
  Indigo: "#6366f1",
  Lime: "#84cc16",
  Orange: "#f97316",
  Pink: "#ec4899",
  Purple: "#a855f7",
  Red: "#ef4444",
  Rose: "#f43f5e",
  Sky: "#0ea5e9",
  Stone: "#1c1917",
  Teal: "#14b8a6",
  Violet: "#8b5cf6",
  Yellow: "#eab308",
}

type PlatformBrandingSettingsProps = {
  setting: TenantModel | null | undefined
}

export function PlatformBrandingSettings({
  setting,
}: PlatformBrandingSettingsProps) {
  const t = useTranslations()
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(
    updatePlatformBrandingAction,
    zodResolver(updatePlatformBrandingSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: t("platformBranding.title"),
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
          brandName: setting?.brandName ?? "",
          logoLight: {
            url: setting?.logoLightPath ?? "",
            mode: "file" as const,
          },
          logoDark: {
            url: setting?.logoDarkPath ?? "",
            mode: "file" as const,
          },
          favicon: {
            url: setting?.faviconPath ?? "",
            mode: "file" as const,
          },
          theme:
            themeOptions.find(
              (opt) =>
                opt.toLowerCase() === (setting?.theme ?? "").toLowerCase(),
            ) ?? null,
          customCss: setting?.customCss ?? "",
          customJs: setting?.customJs ?? "",
          policyUrl: setting?.policyUrl ?? "",
          termsOfServiceUrl: setting?.termsOfServiceUrl ?? "",
        },
      },
    },
  )

  const selectedTheme = useWatch({ control: form.control, name: "theme" })

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmitWithAction}>
        {/* Brand Identity */}
        <Card>
          <CardHeader>
            <CardTitle>
              {t("platformBranding.sections.identity.title")}
            </CardTitle>
            <CardDescription>
              {t("platformBranding.sections.identity.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            <InputField
              label={t("fields.brandName.label")}
              name="brandName"
              placeholder={t("fields.brandName.placeholder")}
              required
            />
            <div className="flex flex-col gap-2">
              <Label>{t("fields.theme.label")}</Label>
              <div className="flex flex-wrap gap-2">
                {themeOptions.map((theme) => (
                  <button
                    aria-label={theme}
                    className="relative size-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    key={theme}
                    onClick={() =>
                      form.setValue(
                        "theme",
                        selectedTheme === theme ? null : theme,
                        { shouldDirty: true },
                      )
                    }
                    style={{ backgroundColor: THEME_COLORS[theme] }}
                    title={theme}
                    type="button"
                  >
                    {selectedTheme === theme && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="size-2.5 rounded-full bg-white shadow-sm" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {selectedTheme && (
                <p className="text-muted-foreground text-xs">{selectedTheme}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Visual Assets */}
        <Card>
          <CardHeader>
            <CardTitle>{t("platformBranding.sections.assets.title")}</CardTitle>
            <CardDescription>
              {t("platformBranding.sections.assets.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label>{t("fields.logoLight.label")}</Label>
              <div className="rounded-lg border p-3">
                <DirectUploadOrInsertLink
                  fileType={fileTypes.enum.image}
                  parentName="logoLight"
                  uploadPath="branding/logo-light"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("fields.logoDark.label")}</Label>
              <div className="rounded-lg border p-3">
                <DirectUploadOrInsertLink
                  fileType={fileTypes.enum.image}
                  parentName="logoDark"
                  uploadPath="branding/logo-dark"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("fields.favicon.label")}</Label>
              <div className="rounded-lg border p-3">
                <DirectUploadOrInsertLink
                  fileType={fileTypes.enum.image}
                  parentName="favicon"
                  uploadPath="branding/favicon"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legal Links */}
        <Card>
          <CardHeader>
            <CardTitle>{t("platformBranding.sections.legal.title")}</CardTitle>
            <CardDescription>
              {t("platformBranding.sections.legal.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InputField
              label={t("fields.policyUrl.label")}
              name="policyUrl"
              placeholder="https://example.com/privacy"
            />
            <InputField
              label={t("fields.termsOfServiceUrl.label")}
              name="termsOfServiceUrl"
              placeholder="https://example.com/terms"
            />
          </CardContent>
        </Card>

        {/* Advanced */}
        <Card>
          <CardHeader>
            <CardTitle>
              {t("platformBranding.sections.advanced.title")}
            </CardTitle>
            <CardDescription>
              {t("platformBranding.sections.advanced.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="css">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="css">
                  {t("fields.customCSS.label")}
                </TabsTrigger>
                <TabsTrigger value="js">
                  {t("fields.customJS.label")}
                </TabsTrigger>
              </TabsList>
              <TabsContent className="mt-3" value="css">
                <CodeEditorField language="css" name="customCss" />
              </TabsContent>
              <TabsContent className="mt-3" value="js">
                <CodeEditorField language="javascript" name="customJs" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting && (
              <Loader2Icon className="size-4 animate-spin" />
            )}
            {t("actions.save")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
