import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"

import { EditFacebookLeadAdAutomationForm } from "@/features/facebook-lead-ad-automation/components/edit-facebook-lead-ad-automation-form"
import { getFacebookLeadAdAutomation } from "@/features/facebook-lead-ad-automation/queries"

import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function EditFacebookLeadAdPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const t = await getTranslations()
  const automation = await getFacebookLeadAdAutomation(workspaceId, id)

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("facebookLeadAdsAutomation.title"),
            href: `/space/${workspaceId}/fb-lead-ads`,
          },
          { label: automation.name, href: "" },
        ]}
      />
      <EditFacebookLeadAdAutomationForm
        initialData={{
          id: automation.id,
          name: automation.name,
          pageName: automation.pageName,
          formId: automation.formId,
          formName: automation.formName,
          fieldMapping: automation.fieldMapping,
          flowId: automation.flowId,
        }}
        workspaceId={workspaceId}
      />
    </div>
  )
}
