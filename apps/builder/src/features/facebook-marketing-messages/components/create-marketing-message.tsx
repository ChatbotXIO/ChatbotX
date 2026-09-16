"use client"

import { useTranslations } from "next-intl"
import { createMarketingMessageAction } from "../actions/create.action"
import { mmContentDefaultFn } from "../schema/content"
import { MarketingMessageForm } from "./marketing-message-form"

export function CreateMarketingMessage({
  workspaceId,
}: {
  workspaceId: string
}) {
  const t = useTranslations()

  return (
    <MarketingMessageForm
      // bindArgsSchemas: bound with the workspace id before it reaches the
      // form (invariant 4).
      action={createMarketingMessageAction.bind(null, workspaceId)}
      defaultValues={{
        name: "",
        pageId: "",
        adAccountId: "",
        currency: "",
        budgetType: "daily",
        budgetMajorUnits: 1,
        content: mmContentDefaultFn("text"),
      }}
      submitLabel={t("actions.create")}
      workspaceId={workspaceId}
    />
  )
}
