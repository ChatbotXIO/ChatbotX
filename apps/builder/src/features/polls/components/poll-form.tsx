"use client"

import { fileTypes } from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@chatbotx.io/ui/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { ChevronDownIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { DateTimeRangeField } from "@/features/minigames/components/date-time-range-field"
import { orpc } from "@/lib/orpc/query"
import { useInvalidatePolls } from "../lib/use-invalidate-polls"
import { POLL_NAME_MAX } from "../schema/action"
import {
  createPollFormSchema,
  type PollFormValues,
  toPollRequest,
} from "../schema/form"
import type { PollResource } from "../schema/resource"
import { CandidatesField } from "./candidates-field"

type PollFormProps = {
  workspaceId: string
  poll?: PollResource
}

const DAY_MS = 86_400_000

function getDefaultValues(poll?: PollResource): PollFormValues {
  if (poll) {
    return {
      name: poll.name,
      image: { url: poll.imageUrl, mode: "file" },
      startsAt: poll.startsAt,
      endsAt: poll.endsAt,
      afterVoteFlowId: poll.afterVoteFlowId,
      candidates: poll.candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        description: candidate.description ?? "",
        image: { url: candidate.imageUrl ?? "", mode: "file" },
      })),
    }
  }
  const now = Date.now()
  return {
    name: "",
    image: { url: "", mode: "file" },
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(now + 7 * DAY_MS).toISOString(),
    afterVoteFlowId: null,
    candidates: [
      { name: "", description: "", image: { url: "" } },
      { name: "", description: "", image: { url: "" } },
    ],
  }
}

export function PollForm({ workspaceId, poll }: PollFormProps) {
  const t = useTranslations()
  const router = useRouter()
  const flowOptions = useFlowSelectOptions()
  const invalidatePolls = useInvalidatePolls()
  const [moreOpen, setMoreOpen] = useState(Boolean(poll?.afterVoteFlowId))
  const [pendingValues, setPendingValues] = useState<PollFormValues | null>(
    null,
  )

  const form = useForm<PollFormValues>({
    resolver: zodResolver(createPollFormSchema(t)),
    defaultValues: getDefaultValues(poll),
  })

  const onSaved = async (isUpdate: boolean) => {
    const feature = t("pollManager.feature")
    toast.success(
      isUpdate
        ? t("messages.updatedSuccess", { feature })
        : t("messages.createdSuccess", { feature }),
    )
    await invalidatePolls()
    router.push(`/space/${workspaceId}/polls`)
    router.refresh()
  }
  const onError = (error: { message: string }) => {
    toast.error(error.message)
  }

  const createMutation = useMutation(
    orpc.pollsAPI.createPollAPI.mutationOptions({
      onSuccess: () => onSaved(false),
      onError,
    }),
  )
  const updateMutation = useMutation(
    orpc.pollsAPI.updatePollAPI.mutationOptions({
      onSuccess: () => onSaved(true),
      onError,
    }),
  )
  const isPending = createMutation.isPending || updateMutation.isPending

  const save = (values: PollFormValues) => {
    const body = toPollRequest(values)
    if (poll) {
      updateMutation.mutate({ workspaceId, id: poll.id, ...body })
    } else {
      createMutation.mutate({ workspaceId, ...body })
    }
  }

  const onSubmit = (values: PollFormValues) => {
    if (poll) {
      const keptIds = new Set(values.candidates.map((c) => c.id))
      const losesVotes = poll.candidates.some(
        (candidate) => !keptIds.has(candidate.id) && candidate.votesCount > 0,
      )
      if (losesVotes) {
        setPendingValues(values)
        return
      }
    }
    save(values)
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-6"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {poll
                ? t("pollManager.form.editTitle")
                : t("pollManager.form.createTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InputField
              label={t("fields.name.label")}
              maxLength={POLL_NAME_MAX}
              name="name"
              required
            />
            <DateTimeRangeField
              fromName="startsAt"
              label={t("pollManager.form.votingPeriod")}
              required
              toName="endsAt"
            />
            <div className="flex flex-col gap-1.5">
              <Label>{t("fields.image.label")}</Label>
              <DirectUploadOrInsertLink
                fileType={fileTypes.enum.image}
                parentName="image"
                uploadPath={`public/space/${workspaceId}/polls`}
                useMediaLibrary
              />
              {form.formState.errors.image ? (
                <p className="text-destructive text-sm">
                  {t("pollManager.form.imageRequired")}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <CandidatesField workspaceId={workspaceId} />

        <Collapsible onOpenChange={setMoreOpen} open={moreOpen}>
          <CollapsibleTrigger
            render={
              <Button size="sm" type="button" variant="ghost">
                {t("pollManager.form.moreOptions")}
                <ChevronDownIcon />
              </Button>
            }
          />
          <CollapsibleContent className="pt-3">
            <Card>
              <CardContent>
                <ComboboxField
                  allowClear
                  clearLabel={t("pollManager.form.afterVoteFlowNone")}
                  emptyText={t("actions.noRecordFound")}
                  emptyValue={null}
                  label={t("pollManager.form.afterVoteFlow")}
                  name="afterVoteFlowId"
                  options={flowOptions}
                  placeholder={t("pollManager.form.afterVoteFlowNone")}
                />
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex justify-end gap-2">
          <Button
            onClick={() => router.push(`/space/${workspaceId}/polls`)}
            type="button"
            variant="ghost"
          >
            {t("actions.cancel")}
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {t("actions.save")}
          </Button>
        </div>
      </form>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingValues(null)
          }
        }}
        open={pendingValues !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pollManager.form.removeVotesTitle")}</DialogTitle>
            <DialogDescription>
              {t("pollManager.form.removeVotesDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setPendingValues(null)}
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (pendingValues) {
                  save(pendingValues)
                }
                setPendingValues(null)
              }}
              type="button"
              variant="destructive"
            >
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  )
}
