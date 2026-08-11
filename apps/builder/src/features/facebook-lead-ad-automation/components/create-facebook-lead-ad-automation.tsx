"use client"

import {
  ALL_FORMS_ID,
  type FacebookLeadFieldMapping,
  FB_LEAD_STANDARD_FIELD_TARGET,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
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
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { client } from "@/lib/orpc/orpc"
import { connectLeadAdsAction } from "../actions/connect-lead-ads.action"
import { createFacebookLeadAdAutomationAction } from "../actions/create-facebook-lead-ad-automation.action"
import { createFacebookLeadAdAutomationRequest } from "../schemas/action"
import { LeadDataMapping } from "./lead-data-mapping"

// Response shapes come straight from the oRPC API so they track the single
// source (the API output schema) instead of being re-declared by hand.
type LeadPage = Awaited<
  ReturnType<typeof client.facebookLeadAdsAPI.listLeadAdsPagesAPI>
>["pages"][number]
type LeadForm = Awaited<
  ReturnType<typeof client.facebookLeadAdsAPI.listLeadAdsFormsAPI>
>["forms"][number]

function buildMapping(form: LeadForm): FacebookLeadFieldMapping[] {
  return (form.questions ?? [])
    .filter((q) => q.key !== "inbox_url")
    .map((q) => ({
      key: q.key,
      label: q.label,
      type: q.type,
      target: FB_LEAD_STANDARD_FIELD_TARGET[q.key] ?? null,
    }))
}

export function CreateFacebookLeadAdAutomationForm({
  workspaceId,
}: {
  workspaceId: string
}) {
  const t = useTranslations()
  const router = useRouter()

  const [pages, setPages] = useState<LeadPage[]>([])
  const [forms, setForms] = useState<LeadForm[]>([])
  const [loadingForms, setLoadingForms] = useState(false)

  const flowOptions: SelectOption[] = [
    { label: t("messages.none"), value: "" },
    ...useFlowSelectOptions(),
  ]

  const { execute: connect } = useAction(
    connectLeadAdsAction.bind(null, workspaceId),
  )

  const { form, handleSubmitWithAction } = useHookFormAction(
    createFacebookLeadAdAutomationAction.bind(null, workspaceId),
    zodResolver(createFacebookLeadAdAutomationRequest),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          toast.success(
            t("messages.createdSuccess", {
              feature: t("facebookLeadAdsAutomation.title"),
            }),
          )
          if (data?.id) {
            router.push(`/space/${workspaceId}/fb-lead-ads/${data.id}`)
          } else {
            router.push(`/space/${workspaceId}/fb-lead-ads`)
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          name: "",
          pageId: "",
          pageName: "",
          formId: "",
          formName: "",
          fieldMapping: [],
          flowId: "",
        },
      },
    },
  )

  useEffect(() => {
    let active = true
    client.facebookLeadAdsAPI
      .listLeadAdsPagesAPI({ workspaceId })
      .then((res) => {
        if (active) {
          setPages(res.pages.filter((p) => p.eligible))
        }
      })
      .catch(() => {
        // Ignore — an empty list surfaces the "Add New" path.
      })
    return () => {
      active = false
    }
  }, [workspaceId])

  const pageOptions: SelectOption[] = pages.map((p) => ({
    label: p.pageName,
    value: p.pageId,
  }))

  const formOptions: SelectOption[] = [
    { label: t("facebookLeadAdsAutomation.allForms"), value: ALL_FORMS_ID },
    ...forms.map((f) => ({ label: f.name, value: f.id })),
  ]

  const onPageChange = useCallback(
    (pageId: string) => {
      form.setValue(
        "pageName",
        pages.find((p) => p.pageId === pageId)?.pageName ?? "",
      )
      form.setValue("formId", "")
      form.setValue("formName", "")
      form.setValue("fieldMapping", [])
      form.setValue("name", "")
      setForms([])
      setLoadingForms(true)
      client.facebookLeadAdsAPI
        .listLeadAdsFormsAPI({ workspaceId, pageId })
        .then((res) => setForms(res.forms))
        .catch(() => setForms([]))
        .finally(() => setLoadingForms(false))
    },
    [form, pages, workspaceId],
  )

  const onFormChange = useCallback(
    (formId: string) => {
      const pageName = form.getValues("pageName") ?? ""
      if (formId === ALL_FORMS_ID) {
        form.setValue("formName", "")
        form.setValue("fieldMapping", [])
        form.setValue(
          "name",
          pageName
            ? `${pageName} · ${t("facebookLeadAdsAutomation.allForms")}`
            : t("facebookLeadAdsAutomation.allForms"),
        )
        return
      }
      const selected = forms.find((f) => f.id === formId)
      if (!selected) {
        return
      }
      form.setValue("formName", selected.name)
      form.setValue("fieldMapping", buildMapping(selected))
      form.setValue("name", selected.name)
    },
    [form, forms, t],
  )

  const pageId = form.watch("pageId")
  const formId = form.watch("formId")
  const mapping = form.watch("fieldMapping") as FacebookLeadFieldMapping[]
  const isSpecificForm = Boolean(formId) && formId !== ALL_FORMS_ID

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("facebookLeadAdsAutomation.create")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6" onSubmit={handleSubmitWithAction}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">
                  {t("facebookLeadAdsAutomation.facebookPage")}
                </span>
                <Button
                  className="h-auto p-0"
                  onClick={() => connect()}
                  type="button"
                  variant="link"
                >
                  {t("facebookLeadAdsAutomation.addNewPage")}
                </Button>
              </div>
              <ComboboxField
                emptyText={t("facebookLeadAdsAutomation.noEligiblePages")}
                name="pageId"
                options={pageOptions}
                placeholder={t("actions.pleaseSelect")}
                popoverClassName="w-[var(--anchor-width)]"
                required
                triggerValueChange={onPageChange}
              />
            </div>

            {pageId ? (
              <ComboboxField
                emptyText={
                  loadingForms
                    ? t("actions.loading")
                    : t("actions.noRecordFound")
                }
                label={t("facebookLeadAdsAutomation.leadForm")}
                name="formId"
                options={formOptions}
                placeholder={t("actions.pleaseSelect")}
                popoverClassName="w-[var(--anchor-width)]"
                required
                triggerValueChange={onFormChange}
              />
            ) : null}

            {isSpecificForm ? (
              <LeadDataMapping entries={mapping} workspaceId={workspaceId} />
            ) : null}

            {formId === ALL_FORMS_ID ? (
              <p className="rounded-md border bg-muted/50 p-3 text-muted-foreground text-sm">
                {t("facebookLeadAdsAutomation.allFormsNote")}
              </p>
            ) : null}

            {formId ? (
              <ComboboxField
                label={t("facebookLeadAdsAutomation.whatFlow")}
                name="flowId"
                options={flowOptions}
                placeholder={t("messages.none")}
                popoverClassName="w-[var(--anchor-width)]"
              />
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => router.push(`/space/${workspaceId}/fb-lead-ads`)}
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={!formId || form.formState.isSubmitting}
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="animate-spin" />
                )}
                {t("actions.continue")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
