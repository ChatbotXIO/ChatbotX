"use client"

import {
  ALL_FORMS_ID,
  type FacebookLeadFieldMapping,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
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
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { updateFacebookLeadAdAutomationAction } from "../actions/update-facebook-lead-ad-automation.action"
import {
  type UpdateFacebookLeadAdAutomationRequest,
  updateFacebookLeadAdAutomationRequest,
} from "../schemas/action"
import { LeadDataMapping } from "./lead-data-mapping"

export type EditLeadAdInitialData = {
  id: string
  name: string
  pageName: string | null
  formId: string
  formName: string | null
  fieldMapping: FacebookLeadFieldMapping[]
  flowId: string | null
}

export function EditFacebookLeadAdAutomationForm({
  workspaceId,
  initialData,
}: {
  workspaceId: string
  initialData: EditLeadAdInitialData
}) {
  const t = useTranslations()
  const router = useRouter()

  const flowOptions = [
    { label: t("messages.none"), value: "" },
    ...useFlowSelectOptions(),
  ]

  const form = useForm<UpdateFacebookLeadAdAutomationRequest>({
    resolver: zodResolver(updateFacebookLeadAdAutomationRequest),
    mode: "onChange",
    defaultValues: {
      fieldMapping: initialData.fieldMapping,
      flowId: initialData.flowId ?? "",
    },
  })

  const { execute, isPending } = useAction(
    updateFacebookLeadAdAutomationAction.bind(
      null,
      workspaceId,
      initialData.id,
    ),
    {
      onSuccess: () => {
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("facebookLeadAdsAutomation.title"),
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
  )

  const isAllForms = initialData.formId === ALL_FORMS_ID
  const handleSubmit = form.handleSubmit((data) => execute(data))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("facebookLeadAdsAutomation.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t("facebookLeadAdsAutomation.facebookPage")}</Label>
                <div className="truncate rounded-md border bg-muted px-3 py-2 text-muted-foreground text-sm">
                  {initialData.pageName ?? "—"}
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t("facebookLeadAdsAutomation.leadForm")}</Label>
                <div className="truncate rounded-md border bg-muted px-3 py-2 text-muted-foreground text-sm">
                  {isAllForms
                    ? t("facebookLeadAdsAutomation.allForms")
                    : (initialData.formName ?? "—")}
                </div>
              </div>
            </div>

            {isAllForms ? (
              <p className="rounded-md border bg-muted/50 p-3 text-muted-foreground text-sm">
                {t("facebookLeadAdsAutomation.allFormsNote")}
              </p>
            ) : (
              <LeadDataMapping
                entries={initialData.fieldMapping}
                workspaceId={workspaceId}
              />
            )}

            <ComboboxField
              label={t("facebookLeadAdsAutomation.whatFlow")}
              name="flowId"
              options={flowOptions}
              placeholder={t("messages.none")}
              popoverClassName="w-[var(--anchor-width)]"
            />

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => router.push(`/space/${workspaceId}/fb-lead-ads`)}
                type="button"
                variant="ghost"
              >
                {t("actions.back")}
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending && <Loader2Icon className="animate-spin" />}
                {t("actions.save")}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
