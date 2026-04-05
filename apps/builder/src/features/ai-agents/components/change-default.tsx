"use client"

import type { AIAgentModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Loader } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { updateAIAgentAction } from "../actions/update.action"

type ChangeDefaultProps = {
  aiAgent: AIAgentModel | null
  open: boolean
  onOpenChange: (val: boolean) => void
  onSuccess: () => void
}

export function ChangeDefault(props: ChangeDefaultProps) {
  const router = useRouter()
  const t = useTranslations()

  const {
    aiAgent,
    open,
    onOpenChange,
    onSuccess = () => {
      router.refresh()
    },
  } = props

  const { execute, isPending } = useAction(
    updateAIAgentAction.bind(
      null,
      aiAgent?.workspaceId ?? "",
      aiAgent?.id ?? "",
    ),
    {
      onSuccess: () => {
        onOpenChange(false)
        onSuccess()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("messages.changeDefault")}</DialogTitle>
          <DialogDescription>
            {aiAgent?.isDefault
              ? t("messages.unsetDefaultDescription")
              : t("messages.changeDefaultDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button size="sm" variant="outline">
              {t("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            disabled={isPending}
            onClick={() => execute({ isDefault: !aiAgent?.isDefault })}
            size="sm"
          >
            {isPending && <Loader className="mr-2 size-4 animate-spin" />}
            {t("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
