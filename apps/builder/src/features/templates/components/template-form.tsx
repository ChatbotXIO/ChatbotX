"use client"

import type { TemplateDetail } from "@chatbotx.io/business"
import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useTenantSettings } from "@/features/tenant"
import { saveTemplateAction } from "../actions/save-template.action"
import type {
  CategorySelectionState,
  TemplateSelectionFormState,
} from "../lib/selection"
import { saveTemplateRequest } from "../schema/mutation"
import { TemplateContentsCard } from "./template-contents-card"
import { TemplateCoverImageField } from "./template-cover-image-field"
import { TemplateShareCard } from "./template-share-card"

type TemplateFormProps = {
  workspaceId: string
  template?: TemplateDetail
  /** Categories the member may include in a template. */
  selectableCategories: readonly TemplateCategory[]
}

export function TemplateForm({
  workspaceId,
  template,
  selectableCategories,
}: TemplateFormProps) {
  const t = useTranslations()
  const router = useRouter()
  const isEdit = Boolean(template)
  const { storageUrl } = useTenantSettings()

  const { form, handleSubmitWithAction } = useHookFormAction(
    saveTemplateAction.bind(null, workspaceId),
    zodResolver(saveTemplateRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          toast.success(
            t(isEdit ? "messages.updatedSuccess" : "messages.createdSuccess", {
              feature: t("fields.template.label"),
            }),
          )
          if (isEdit) {
            router.refresh()
          } else if (data?.templateId) {
            router.push(
              `/space/${workspaceId}/templates/${data.templateId}/edit`,
            )
          } else {
            router.push(`/space/${workspaceId}/templates`)
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        // Validate on submit (then on every change): a button disabled until the
        // form is valid gives no reason, and RHF focuses the first invalid field.
        mode: "onSubmit",
        reValidateMode: "onChange",
        shouldFocusError: true,
        defaultValues: {
          templateId: template?.id,
          name: template?.name ?? "",
          description: template?.description ?? "",
          imageUrl: template?.imageUrl ?? "",
          publisherName: template?.publisherName ?? "",
          youtubeVideoId: template?.youtubeVideoId ?? "",
          testLink: template?.testLink ?? "",
          selection: template?.selection ?? {},
          defaultPermissions: template?.defaultPermissions ?? {
            allowEdit: true,
            allowDelete: true,
          },
          createInstallFolder: template?.createInstallFolder ?? false,
          defaultAutoUpdate: template?.defaultAutoUpdate ?? false,
        },
      },
    },
  )

  const selection = (useWatch({ control: form.control, name: "selection" }) ??
    {}) as TemplateSelectionFormState
  const imageUrl = useWatch({ control: form.control, name: "imageUrl" })

  const handleSelectionChange = (
    category: TemplateCategory,
    next: CategorySelectionState,
  ) => {
    form.setValue(
      "selection",
      { ...selection, [category]: next },
      { shouldValidate: true, shouldDirty: true },
    )
  }

  return (
    <Form {...form}>
      <form className="flex-1 space-y-6" onSubmit={handleSubmitWithAction}>
        <Card>
          <CardHeader>
            <CardTitle>{t("templates.form.details")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InputField label={t("fields.name.label")} name="name" required />
            <TextareaField
              label={t("fields.description.label")}
              name="description"
            />
            <div className="space-y-2">
              <p className="font-medium text-sm">
                {t("templates.form.imageUrl")}
              </p>
              <TemplateCoverImageField
                onClear={() =>
                  form.setValue("imageUrl", "", { shouldDirty: true })
                }
                onSelect={(path) =>
                  form.setValue("imageUrl", path, { shouldDirty: true })
                }
                previewUrl={
                  imageUrl ? getPublicFileUrl(imageUrl, storageUrl) : undefined
                }
                workspaceId={workspaceId}
              />
            </div>
            <InputField
              label={t("templates.form.publisherName")}
              name="publisherName"
            />
            <InputField
              description={t("templates.form.youtubeVideoIdDescription")}
              label={t("templates.form.youtubeVideoId")}
              name="youtubeVideoId"
            />
            <InputField label={t("templates.form.testLink")} name="testLink" />
          </CardContent>
        </Card>

        <TemplateContentsCard
          categories={selectableCategories}
          onChange={handleSelectionChange}
          selection={selection}
          workspaceId={workspaceId}
        />

        {template && (
          <TemplateShareCard template={template} workspaceId={workspaceId} />
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("templates.form.permissions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SwitchField
              label={t("templates.form.allowEdit")}
              name="defaultPermissions.allowEdit"
              required
            />
            <SwitchField
              label={t("templates.form.allowDelete")}
              name="defaultPermissions.allowDelete"
              required
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("templates.form.installBehavior")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SwitchField
              description={t("templates.form.createInstallFolderDescription")}
              label={t("templates.form.createInstallFolder")}
              name="createInstallFolder"
              required
            />
            <SwitchField
              description={t("templates.form.defaultAutoUpdateDescription")}
              label={t("templates.form.defaultAutoUpdate")}
              name="defaultAutoUpdate"
              required
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            onClick={() => router.push(`/space/${workspaceId}/templates`)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t(isEdit ? "actions.save" : "actions.create")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
