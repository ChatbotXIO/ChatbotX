"use client"

import type { FilterContactSchema } from "@/features/contacts/filter/schema"
import { callAPI } from "@/lib/swr"
import { useTranslate } from "@tolgee/react"

export function EstimatedContact({
  chatbotId,
  filter,
}: { chatbotId: string; filter: FilterContactSchema }) {
  const { t } = useTranslate()
  const url = `/api/chatbots/${chatbotId}/contacts` // todo add filter to api
  const { data } = callAPI(url)
  const total = data?.total ?? 0

  return (
    <span>
      {t("common.receiver")}: {total}
    </span>
  )
}
