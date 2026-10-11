"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { FileTextIcon, ListChecksIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { orpc } from "@/lib/orpc/query"
import type { WhatsappFlowResponseField } from "../schema/flow-response"

type WhatsappFlowResponseButtonProps = {
  workspaceId: string
  conversationId: string
  messageId: string
  createdAt: Date | string
}

function FlowResponseValue({ field }: { field: WhatsappFlowResponseField }) {
  const t = useTranslations("messages.flowResponse")

  switch (field.kind) {
    case "boolean":
      return <span>{field.value ? t("yes") : t("no")}</span>
    case "list":
      return field.value.length > 0 ? (
        <ul className="list-disc ps-4">
          {field.value.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: answers can repeat
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : (
        <span className="text-muted-foreground">{t("noAnswer")}</span>
      )
    case "files":
      return (
        <ul className="flex flex-col gap-1">
          {field.value.map((file, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: file names can repeat
            <li className="flex min-w-0 items-center gap-1.5" key={index}>
              <FileTextIcon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{file.fileName}</span>
            </li>
          ))}
        </ul>
      )
    case "json":
      return <code className="break-all text-xs">{field.value}</code>
    default:
      return field.value ? (
        <span className="whitespace-pre-line break-words">{field.value}</span>
      ) : (
        <span className="text-muted-foreground">{t("noAnswer")}</span>
      )
  }
}

function FlowResponseDialogBody(props: WhatsappFlowResponseButtonProps) {
  const t = useTranslations("messages.flowResponse")
  const tActions = useTranslations("actions")
  const query = useQuery(
    orpc.messagesAPI.getWhatsappFlowResponseAuthenticatedAPI.queryOptions({
      input: {
        workspaceId: props.workspaceId,
        conversationId: props.conversationId,
        messageId: props.messageId,
        createdAt: new Date(props.createdAt),
      },
    }),
  )

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3 text-sm">
        <p className="text-destructive">{t("failed")}</p>
        <Button
          onClick={() => query.refetch()}
          size="sm"
          type="button"
          variant="secondary"
        >
          {tActions("retry")}
        </Button>
      </div>
    )
  }

  const { fields, labelSource } = query.data
  if (fields.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {labelSource === "fallback" && (
        <p className="text-muted-foreground text-xs">
          {t("labelsUnavailable")}
        </p>
      )}
      <dl className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
        {fields.map((field) => (
          <div className="flex flex-col gap-0.5 text-sm" key={field.key}>
            <dt className="font-medium text-muted-foreground">{field.label}</dt>
            <dd className="min-w-0">
              <FlowResponseValue field={field} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * "View response" under a WhatsApp Flow completion ("Sent"), like the
 * WhatsApp app: the answers load only once the dialog opens.
 */
export function WhatsappFlowResponseButton(
  props: WhatsappFlowResponseButtonProps,
) {
  const t = useTranslations("messages.flowResponse")
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        className="mt-1 w-full"
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <ListChecksIcon aria-hidden className="size-4" />
        {t("viewResponse")}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          {open && <FlowResponseDialogBody {...props} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
