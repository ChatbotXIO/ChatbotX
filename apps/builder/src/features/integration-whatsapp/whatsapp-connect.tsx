"use client"

import { SettingRow } from "@/components/setting-row"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { T, useTranslate } from "@tolgee/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { use } from "react"
import type { getWhastappIntegration } from "./queries"
// import { connectGoogleSheets } from "./actions/connect.action"
// import { disconnectGoogleSheets } from "./actions/disconnect.action"
// import type { getGoogleSheetsIntegration } from "./queries"

type WhatsappConnectProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getWhastappIntegration>>]>
}

export function WhatsappConnect({ chatbotId, promises }: WhatsappConnectProps) {
  const [{ data: integrationWhatsapp }] = use(promises)
  const router = useRouter()
  const { t } = useTranslate()

  // const { executeAsync: onConnect, isPending: isPendingConnect } = useAction(
  //   connectGoogleSheets.bind(null, chatbotId),
  // )
  // const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
  //   useAction(disconnectGoogleSheets.bind(null, chatbotId), {
  //     onSuccess: () => {
  //       router.refresh()
  //     },
  //   })

  return (
    <SettingRow
      label={<T keyName="Integration.Whatsapp.Title" />}
      description={<T keyName="Integration.Whatsapp.Descriptions" />}
    >
      {integrationWhatsapp ? (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm">
            {/* <Link href="/api/integrations/new-chatbot/whatsapp"> */}
            <T keyName="Integration.ManageBtn" />
            {/* </Link> */}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                {/* {isPendingDisconnect && (
                  <Loader2Icon className="animate-spin" />
                )} */}
                <T keyName="Integration.DisconnectBtn" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("Integration.DisconnectDialog.Confirm")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("Integration.DisconnectDialog.Description")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t("Integration.CancelBtn")}
                </AlertDialogCancel>
                <AlertDialogAction
                // onClick={async (e) => {
                //   e.preventDefault()
                //   await onDisconnect()
                // }}
                // disabled={isPendingDisconnect}
                >
                  {/* {isPendingDisconnect && (
                    <Loader2Icon className="animate-spin" />
                  )} */}
                  <T keyName="Integration.DisconnectBtn" />
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <Button size="sm" variant="secondary" asChild>
          <Link
            href={`/api/integrations/new-chatbot/whatsapp?chatbotId=${chatbotId}`}
          >
            <T keyName="common.integrations.Connect" />
          </Link>
        </Button>
      )}
    </SettingRow>
  )
}
