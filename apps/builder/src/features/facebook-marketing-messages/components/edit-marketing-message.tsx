"use client"

import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"
import { useTranslations } from "next-intl"
import { updateMarketingMessageAction } from "../actions/update.action"
import { toMajorUnits } from "../lib/currency"
import type { MmContent } from "../schema/content"
import { MarketingMessageForm } from "./marketing-message-form"

export function EditMarketingMessage({
  workspaceId,
  row,
}: {
  workspaceId: string
  row: FacebookMarketingMessageModel
}) {
  const t = useTranslations()

  return (
    <MarketingMessageForm
      // bindArgsSchemas takes (workspaceId, id) — bound here so the form
      // receives a ready action (invariant 4).
      action={updateMarketingMessageAction.bind(null, workspaceId, row.id)}
      defaultValues={{
        name: row.name,
        pageId: row.pageId,
        adAccountId: row.adAccountId,
        currency: row.currency,
        budgetType: row.budgetType,
        // Stored in minor units against the offset snapshotted at creation.
        budgetMajorUnits: toMajorUnits(
          row.budgetMinorUnits,
          row.currencyOffset,
        ),
        content: row.content as MmContent,
      }}
      lockTarget
      submitLabel={t("actions.save")}
      workspaceId={workspaceId}
    />
  )
}
