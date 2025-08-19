"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { Alert, AlertDescription } from "@aha.chat/ui/components/ui/alert"
import { Button } from "@aha.chat/ui/components/ui/button"
import { useTranslate } from "@tolgee/react"
import { InfoIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import React, { useTransition } from "react"
import { toast } from "sonner"
import type { getWhatsappIceBreakers } from "@/features/integration-whatsapp/ice-breakers/queries"
import { updateWhatsappIceBreakerAction } from "./actions/update-ice-breakers"

type WhatsappIceBreakersListProps = {
  promises: Promise<[Awaited<ReturnType<typeof getWhatsappIceBreakers>>]>
  chatbotId: string
}

export function WhatsappIceBreakersList({
  promises,
  chatbotId,
}: WhatsappIceBreakersListProps) {
  const { t } = useTranslate()
  const [{ data: prompts }] = React.use(promises)
  const router = useRouter()

  const { execute, result } = useAction(
    updateWhatsappIceBreakerAction.bind(null, chatbotId),
  )

  const [isDeleting, startDeleteTransition] = useTransition()
  const onDelete = () => {
    startDeleteTransition(async () => {
      await execute({ prompts: [] })

      if (result.serverError) {
        toast.error(result.serverError)
      } else {
        toast.success(t("whatsapp.iceBreaker.deleted"))
        router.refresh()
      }
    })
  }

  return (
    <Accordion className="w-full" collapsible type="single">
      <AccordionItem
        className="transition-all hover:rounded-lg hover:[&[data-state=open]]:rounded-none"
        value="whatsapp.tab.conversationStarters"
      >
        <AccordionTrigger className="rounded-none px-4 transition-all hover:bg-gray-200 hover:no-underline [&[data-state=open]]:bg-gray-200">
          <div className="flex items-center gap-2">
            {t("whatsapp.tab.conversationStarters")}
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-4">
          <Alert className="mt-2" variant="default">
            <AlertDescription className="flex items-center gap-2">
              <InfoIcon size={16} /> {t("whatsapp.iceBreakers.description1")}
            </AlertDescription>
          </Alert>
          <Alert className="mt-2" variant="default">
            <AlertDescription className="flex items-center gap-2">
              <InfoIcon size={16} /> {t("whatsapp.iceBreakers.description2")}
            </AlertDescription>
          </Alert>
          <div className="mt-4 flex flex-col gap-4">
            {prompts.map((prompt, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: wip
              <div className="flex items-center justify-between" key={index}>
                <div>{prompt}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button className="w-full" variant="secondary">
              <Link href={`/chatbots/${chatbotId}/whatsapp/ice-breakers/edit`}>
                {t("common.edit")}
              </Link>
            </Button>
            <Button
              className="mt-2 w-full text-destructive"
              disabled={isDeleting}
              onClick={onDelete}
              variant="secondary"
            >
              {isDeleting && <Loader2Icon className="animate-spin" />}
              {t("common.delete")}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
