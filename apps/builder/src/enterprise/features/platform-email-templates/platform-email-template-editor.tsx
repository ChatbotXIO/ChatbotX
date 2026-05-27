"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CodeEditorField } from "@/components/code-editor-field"
import {
  type EmailTemplateType,
  updateEmailTemplateSchema,
} from "./email-template.schema"
import { previewEmailTemplateAction } from "./preview-email-template.action"
import { updateEmailTemplateAction } from "./update-email-template.action"

type PlatformEmailTemplateEditorProps = {
  type: EmailTemplateType
  title: string
  description: string
  variables: string[]
  template: { subject: string; body: string }
}

export function PlatformEmailTemplateEditor({
  type,
  title,
  description,
  variables,
  template,
}: PlatformEmailTemplateEditorProps) {
  const t = useTranslations()
  const router = useRouter()
  const [previewHtml, setPreviewHtml] = useState("")
  const [isPreviewing, setIsPreviewing] = useState(false)

  const { form, handleSubmitWithAction } = useHookFormAction(
    updateEmailTemplateAction,
    zodResolver(updateEmailTemplateSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(
            t("messages.updatedSuccess", {
              feature: title,
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
          type,
          subject: template?.subject ?? "",
          body: template?.body ?? "",
        },
      },
    },
  )

  const bodyValue = form.watch("body")

  useEffect(() => {
    if (!bodyValue?.trim()) {
      setPreviewHtml("")
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsPreviewing(true)
      try {
        const result = await previewEmailTemplateAction({ body: bodyValue })
        if (!cancelled && result.data) {
          setPreviewHtml(result.data)
        }
      } finally {
        if (!cancelled) {
          setIsPreviewing(false)
        }
      }
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [bodyValue])

  return (
    <Form {...form}>
      <form onSubmit={handleSubmitWithAction}>
        <input type="hidden" {...form.register("type")} />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Left: editor */}
          <div className="flex flex-col gap-4 lg:w-1/2">
            <Card>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <InputField
                  label={t("platformEmailTemplates.fields.subject.label")}
                  name="subject"
                  placeholder={t(
                    "platformEmailTemplates.fields.subject.placeholder",
                  )}
                />
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {t("platformEmailTemplates.availableVariables")}:
                    </span>
                    {variables.map((variable) => (
                      <Badge key={variable} variant="secondary">
                        {variable}
                      </Badge>
                    ))}
                  </div>
                  <CodeEditorField language="html" name="body" />
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("platformEmailTemplates.description")}
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => router.back()}
                type="button"
                variant="outline"
              >
                {t("actions.cancel")}
              </Button>
              <Button disabled={form.formState.isSubmitting} type="submit">
                {form.formState.isSubmitting && (
                  <Loader2Icon className="size-4 animate-spin" />
                )}
                {t("actions.save")}
              </Button>
            </div>
          </div>

          {/* Right: preview (sticky) */}
          <div className="lg:sticky lg:top-4 lg:w-1/2">
            <Card className="flex flex-col">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {t("platformEmailTemplates.preview.title")}
                  </CardTitle>
                  {isPreviewing && (
                    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {previewHtml ? (
                  <iframe
                    className="h-[calc(100vh-160px)] w-full rounded-b-lg border-0"
                    sandbox=""
                    srcDoc={previewHtml}
                    title="Email preview"
                  />
                ) : (
                  <div className="flex h-[calc(100vh-160px)] items-center justify-center text-muted-foreground text-sm">
                    {t("platformEmailTemplates.preview.empty")}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </Form>
  )
}
