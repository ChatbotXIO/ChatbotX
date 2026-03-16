"use client"

import type { SequenceModel } from "@aha.chat/database/types"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@aha.chat/ui/components/ui/breadcrumb"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
import { Label } from "@aha.chat/ui/components/ui/label"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { FlowStoreProvider } from "../flows/provider/flow-store-context"
import { upsertSequenceStepAction } from "./actions/upsert-sequence-step.action"
import { SequenceStepCard } from "./components/sequence-step-card"

type SequenceEditorProps = {
  sequence: SequenceModel & {
    steps: Array<{
      id: string
      order: number
      delayDays: number
      delayMinutes: number
      flowId: string | null
      flow: { id: string; name: string } | null
    }>
  }
  chatbotId: string
}

export function SequenceEditor({ sequence, chatbotId }: SequenceEditorProps) {
  const t = useTranslations()
  const router = useRouter()
  const [isAddingStep, setIsAddingStep] = useState(false)

  const handleAddStep = async () => {
    try {
      const result = await upsertSequenceStepAction(chatbotId, {
        sequenceId: sequence.id,
        order: sequence.steps.length,
        delayDays: 1,
        delayMinutes: 0,
        delayUnit: "days",
        isActive: false,
        anytime: true,
        sendDays: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ],
      })

      if (result?.data) {
        toast.success(t("messages.savedSuccessfully"))
        router.refresh()
      } else {
        toast.error(t("messages.unknownError"))
      }
    } catch (error) {
      console.error("Error creating step:", error)
      toast.error(t("messages.unknownError"))
    }
  }

  return (
    <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <div className="mx- container py-1">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/chatbots/${chatbotId}/sequences`}>
                {t("fields.sequences.label")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                <Label className="font-semibold text-sm">{sequence.name}</Label>
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="mx-auto max-w-5xl border-none py-1 shadow-none">
          <CardHeader />

          <CardContent>
            {sequence.steps.length === 0 && !isAddingStep && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">
                  {t("sequences.noSteps")}
                </p>
                <Button className="mt-4" onClick={handleAddStep}>
                  <PlusIcon className="h-4 w-4" />
                  {t("sequences.addFirstStep")}
                </Button>
              </div>
            )}

            {sequence.steps
              .sort((a, b) => a.order - b.order)
              .map((step, index) => (
                <SequenceStepCard
                  chatbotId={chatbotId}
                  isFirst={index === 0}
                  key={step.id}
                  sequenceId={sequence.id}
                  step={step}
                  stepNumber={index + 1}
                />
              ))}

            {!isAddingStep && sequence.steps.length > 0 && (
              <div className="grid">
                <div className="mt-2 mb-2 space-y-4 pl-4">
                  <button
                    className="mt-2 flex h-10 w-full items-center justify-center rounded-md border border-primary/40 border-dashed font-medium text-primary text-sm hover:bg-primary/5"
                    onClick={handleAddStep}
                    type="button"
                  >
                    + {t("sequences.addStep")}
                  </button>
                </div>
              </div>
            )}

            {isAddingStep && (
              <SequenceStepCard
                chatbotId={chatbotId}
                isNew
                onSaved={() => setIsAddingStep(false)}
                sequenceId={sequence.id}
                stepNumber={sequence.steps.length + 1}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </FlowStoreProvider>
  )
}
