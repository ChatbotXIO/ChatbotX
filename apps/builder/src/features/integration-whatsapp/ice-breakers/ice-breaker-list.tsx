"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { getIceBreakers } from "@/features/integration-whatsapp/ice-breakers/queries"
import { useTranslate } from "@tolgee/react"
import { InfoIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import React, { useTransition } from "react"
import { updateIceBreakerAction } from "./actions/update-ice-breakers"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface IceBreakersTableProps {
  promises: Promise<[Awaited<ReturnType<typeof getIceBreakers>>]>
  chatbotId: string
}

export function IceBreakersList({
  promises,
  chatbotId,
}: IceBreakersTableProps) {
  const { t } = useTranslate()
  const [{ data: prompts }] = React.use(promises)
  const router = useRouter()

  const { execute, result } = useAction(
    updateIceBreakerAction.bind(null, chatbotId),
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
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="whatsapp.tab.conversationStarters"
        className="transition-all hover:rounded-lg hover:[&[data-state=open]]:rounded-none"
      >
        <AccordionTrigger className="px-4 rounded-none transition-all [&[data-state=open]]:bg-gray-200 hover:no-underline hover:bg-gray-200">
          <div className="flex items-center gap-2">
            {t("whatsapp.tab.conversationStarters")}
          </div>
        </AccordionTrigger>
        <AccordionContent className="p-4">
          <Alert variant="default" className="mt-2">
            <AlertDescription className="flex gap-2 items-center">
              <InfoIcon size={16} /> {t("whatsapp.iceBreakers.description1")}
            </AlertDescription>
          </Alert>
          <Alert variant="default" className="mt-2">
            <AlertDescription className="flex gap-2 items-center">
              <InfoIcon size={16} /> {t("whatsapp.iceBreakers.description2")}
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-4 mt-4">
            {prompts.map((prompt, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
              <div key={index} className="flex items-center justify-between">
                <div>{prompt}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button variant="secondary" className="w-full">
              <Link href={`/chatbots/${chatbotId}/whatsapp/ice-breakers/edit`}>
                {t("common.edit")}
              </Link>
            </Button>
            <Button
              variant="secondary"
              className="w-full text-destructive mt-2"
              onClick={onDelete}
              disabled={isDeleting}
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
