"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

type Detail = Awaited<
  ReturnType<
    typeof import("../queries/get-questionnaire-submission-detail.query").getQuestionnaireSubmissionDetail
  >
>

const stringifyValue = (value: unknown) => {
  if (value && typeof value === "object" && "label" in value) {
    return String(value.label)
  }
  return value === null || value === undefined ? "" : String(value)
}

export function ApplicantDetailModal({
  workspaceId,
  detail,
  open,
  onOpenChange,
}: {
  workspaceId: string
  detail: Detail | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const router = useRouter()
  const name = detail?.contact.fullName ?? t("questionnaires.unknownContact")
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex flex-col items-center gap-2 text-center">
            <span>{name}</span>
            <Badge className="text-sm">{detail?.totalPoints ?? 0}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] divide-y overflow-y-auto">
          {(detail?.answers ?? []).map((answer) => (
            <div className="grid gap-1 py-3" key={answer.questionId}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{answer.label}</span>
                <Badge variant="secondary">{answer.pointsEarned ?? 0}</Badge>
              </div>
              <div className="text-muted-foreground text-sm">
                {stringifyValue(answer.value)}
              </div>
            </div>
          ))}
          {detail?.answers.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              {t("questionnaires.noAnswers")}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            className="w-full"
            disabled={!detail?.conversationId}
            onClick={() => {
              if (detail?.conversationId) {
                router.push(
                  `/space/${workspaceId}/inbox?conversationId=${detail.conversationId}`,
                )
              }
            }}
          >
            {t("questionnaires.inbox")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
