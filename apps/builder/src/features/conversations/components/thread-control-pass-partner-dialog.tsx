"use client"

import {
  type ThreadControlRole,
  threadControlRoles,
  threadTakePermissions,
} from "@chatbotx.io/database/partials"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import type { ThreadControlChannel } from "@chatbotx.io/utils/channel"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { THREAD_CONTROL_PASS_COPY_KEYS } from "@/features/messages/lib/thread-control-channel-ui"
import { useValidationErrorMap } from "@/lib/validation/use-validation-error-map"
import { useCloseWhenSettled } from "../hooks/use-close-when-settled"
import { useThreadControlAction } from "../hooks/use-thread-control-action"
import { useThreadTakePermission } from "../hooks/use-thread-take-permission"
import type { ListConversationItemResource } from "../schema/resource"
import {
  type ThreadControlPassFormValues,
  threadControlPassFormSchema,
} from "../schema/thread-control"
import {
  resolveThreadPassChoices,
  THREAD_CONTROL_ROLE_LABEL_KEYS,
  type ThreadPassChoices,
} from "../utils/thread-control"

type PassFormProps = ThreadPassChoices & {
  isExecuting: boolean
  onCancel: () => void
  onSubmit: (values: ThreadControlPassFormValues) => void
}

/** Mounted only while the dialog is open, so its state resets on every open. */
function ThreadControlPassForm({
  roles,
  defaultRole,
  isExecuting,
  onCancel,
  onSubmit,
}: PassFormProps) {
  const t = useTranslations()
  const errorMap = useValidationErrorMap()
  const form = useForm<ThreadControlPassFormValues>({
    resolver: zodResolver(threadControlPassFormSchema, { error: errorMap }),
    defaultValues: { targetRole: defaultRole, metadata: "" },
  })
  // The stored roles may arrive after the dialog opened: follow the new default
  // until the agent picks a target themselves, and never keep a target the
  // choices no longer offer (the escalation partner cannot pass to itself).
  const pickedRole = form.watch("targetRole")
  const keepsAgentPick =
    Boolean(form.formState.dirtyFields.targetRole) && roles.includes(pickedRole)
  useEffect(() => {
    if (!keepsAgentPick && pickedRole !== defaultRole) {
      form.setValue("targetRole", defaultRole)
    }
  }, [defaultRole, form, keepsAgentPick, pickedRole])

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <SelectField
          label={t("conversationRouting.pass.targetLabel")}
          name="targetRole"
          options={roles.map((role) => ({
            value: role,
            label: t(THREAD_CONTROL_ROLE_LABEL_KEYS[role]),
          }))}
          required
        />
        <TextareaField
          className="max-h-40"
          label={t("conversationRouting.pass.noteLabel")}
          name="metadata"
          rows={3}
        />
        <DialogFooter>
          <Button
            disabled={isExecuting}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            {t("actions.cancel")}
          </Button>
          <Button disabled={isExecuting} type="submit">
            {isExecuting && (
              <Loader2Icon aria-hidden className="animate-spin" />
            )}
            {t(THREAD_CONTROL_PASS_COPY_KEYS.escalation.confirm)}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

type ThreadControlPassPartnerDialogProps = {
  conversation: ListConversationItemResource
  channel: ThreadControlChannel
  contactInboxId: string
  inboxId: string
  /** Who holds the thread now; the escalation owner cannot pass to itself. */
  ownerRole: ThreadControlRole | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The confirmation behind "Pass to a partner": the agent picks which role
 * takes the thread (Meta `control_pass.target_role`) and may leave a note for
 * it. Passing to the escalation role is sent as an untargeted pass, Meta's
 * default. Channels that pass to the AI agent use `ThreadControlPassDialog`.
 */
export function ThreadControlPassPartnerDialog({
  conversation,
  channel,
  contactInboxId,
  inboxId,
  ownerRole,
  open,
  onOpenChange,
}: ThreadControlPassPartnerDialogProps) {
  const t = useTranslations()
  const { execute, isExecuting } = useThreadControlAction({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    passTarget: "escalation",
  })
  // Only the roles stored for the number tell which role this app holds; an
  // owner that took the thread is the escalation partner by definition.
  const takePermission = useThreadTakePermission({
    channel,
    workspaceId: conversation.workspaceId,
    inboxId,
    enabled: open,
  })
  const holdsEscalationRole =
    ownerRole === threadControlRoles.enum.escalation ||
    takePermission === threadTakePermissions.enum.allowed
  const choices = resolveThreadPassChoices(holdsEscalationRole)

  useCloseWhenSettled(isExecuting, onOpenChange)

  const handleSubmit = ({
    targetRole,
    metadata,
  }: ThreadControlPassFormValues) =>
    execute({
      contactInboxId,
      action: "pass",
      // Targeting the escalation role is the same as no target at all.
      targetRole:
        targetRole === threadControlRoles.enum.escalation
          ? undefined
          : targetRole,
      metadata: metadata || undefined,
    })

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {/*
        This dialog is rendered inside the actions menu's React tree, and React
        bubbles events through portals: without this, keys typed in the note
        reach the menu's typeahead, whose Space activates items such as Archive.
      */}
      <DialogContent
        className="max-w-md"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            {t(THREAD_CONTROL_PASS_COPY_KEYS.escalation.title)}
          </DialogTitle>
          <DialogDescription>
            {t(THREAD_CONTROL_PASS_COPY_KEYS.escalation.description)}
          </DialogDescription>
        </DialogHeader>
        <ThreadControlPassForm
          {...choices}
          isExecuting={isExecuting}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}
