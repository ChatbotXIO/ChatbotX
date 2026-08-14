"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import {
  type CoexistTrigger,
  FacebookPages,
  type PickerFacebookPage,
} from "@/features/integration-messenger/components/messenger-pages"
import { CoexistPopup } from "@/features/shared/coexist-popup"

type SelectPageProps = {
  pages: PickerFacebookPage[]
  bmLookupFailed: boolean
  workspaceId: string
  referer: string
}

export function SelectPage({
  pages,
  bmLookupFailed,
  workspaceId,
  referer,
}: SelectPageProps) {
  const t = useTranslations()
  const router = useRouter()
  const [coexist, setCoexist] = useState<CoexistTrigger | null>(null)

  const handleCoexistRequired = (trigger: CoexistTrigger) => {
    setCoexist(trigger)
  }

  const handleCoexistDone = () => {
    const resolvedWorkspaceId = coexist?.resolvedWorkspaceId ?? workspaceId
    setCoexist(null)
    if (resolvedWorkspaceId) {
      router.push(`/space/${resolvedWorkspaceId}/settings/channels/messenger`)
    } else {
      router.push(referer)
    }
  }

  return (
    <>
      <Card className="mx-auto mt-40 max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {t("actions.connectFeature", { feature: "Messenger" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {bmLookupFailed && (
            <Alert variant="warning">
              <AlertTitle>
                {t("messenger.selectPage.bmLookupFailedTitle")}
              </AlertTitle>
              <AlertDescription>
                {t("messenger.selectPage.bmLookupFailedDescription")}
              </AlertDescription>
            </Alert>
          )}
          <FacebookPages
            onCoexistRequired={handleCoexistRequired}
            pages={pages}
            workspaceId={workspaceId}
          />
        </CardContent>
      </Card>
      {coexist && (
        <CoexistPopup
          channel="messenger"
          integrationId={coexist.integrationId}
          onDone={handleCoexistDone}
          workspaceId={coexist.resolvedWorkspaceId}
        />
      )}
    </>
  )
}
