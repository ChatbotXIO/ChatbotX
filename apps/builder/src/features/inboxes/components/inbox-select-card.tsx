"use client"

import type { InboxType, OrganizationSettings } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useCallback, useMemo } from "react"
import { InboxIcon } from "./inbox-icon"

function InboxSelectCard({ settings }: { settings: OrganizationSettings }) {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Memoize inbox options to prevent recreation on every render
  const inboxOptions: { value: InboxType }[] = useMemo(
    () => [
      {
        value: "whatsapp",
      },
      {
        value: "messenger",
      },
      {
        value: "zalo",
      },
      {
        value: "webchat",
      },
    ],
    [],
  )

  // Memoize navigation handler to prevent recreation on every render
  const handleInboxSelect = useCallback(
    (inboxType: InboxType) => {
      router.push(
        `/channels/create?${searchParams.toString()}&channel=${inboxType}`,
      )
    },
    [router, searchParams],
  )

  return (
    <Card className="mx-auto mt-40 max-w-md">
      <CardHeader>
        <CardTitle className="font-bold text-2xl">
          {t("actions.createFeature", { feature: t("fields.chatbot.label") })}
        </CardTitle>
        <CardDescription />
      </CardHeader>
      <CardContent>
        <ul aria-label="Available inbox types" className="flex flex-col gap-4">
          {inboxOptions.map((inbox) => (
            <li className="flex items-center gap-2" key={inbox.value}>
              <InboxIcon
                iconClassName="size-6"
                inboxType={inbox.value}
                wrapperClassName="flex-1 gap-2"
              />
              <Button
                disabled={
                  inbox.value !== "webchat" && !(inbox.value in settings)
                }
                onClick={() => handleInboxSelect(inbox.value)}
                size="sm"
                type="button"
                variant="secondary"
              >
                {t("actions.continue")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export default memo(InboxSelectCard)
