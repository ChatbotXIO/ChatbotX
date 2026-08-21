"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { use } from "react"
import { AddChannelButton } from "@/features/inboxes/components/add-channel-button"
import { ApiCredentialsCard } from "./components/api-credentials-card"
import { CreateApiForm } from "./components/create-api-form"
import type { listIntegrationApis } from "./queries"

type ApiManageProps = {
  canCreate?: boolean
  workspaceId: string
  promises: Promise<Awaited<ReturnType<typeof listIntegrationApis>>>
}

export function ApiManage({
  canCreate = true,
  workspaceId,
  promises,
}: ApiManageProps) {
  const { data: apis } = use(promises)
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-2">
        <AddChannelButton
          canCreate={canCreate}
          label={t("fields.api.label")}
          render={
            <CreateApiForm workspaceId={workspaceId}>
              <Button size="sm" variant="secondary">
                <PlusCircleIcon className="h-4 w-4" />
                {t("actions.addFeature", { feature: t("fields.api.label") })}
              </Button>
            </CreateApiForm>
          }
        />
      </div>

      <div className="flex flex-col gap-3">
        {apis.map((api) => (
          <ApiCredentialsCard api={api} key={api.id} />
        ))}
        {apis.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {t("messages.noData")}
          </p>
        )}
      </div>
    </div>
  )
}
