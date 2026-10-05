"use client"

import type { DecisionConnectionSafe } from "@chatbotx.io/business"
import type { DecisionProfileModel } from "@chatbotx.io/database/types"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon, PencilIcon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { createDecisionProfileAction } from "@/features/decision-profiles/actions/create-decision-profile.action"
import { updateDecisionProfileAction } from "@/features/decision-profiles/actions/update-decision-profile.action"
import { useWorkspaceId } from "@/hooks/routing"

const profileFormSchema = z.object({
  connectionId: z.string().regex(/^\d+$/),
  contractJson: z.string().trim().min(1).max(24_000),
  description: z.string().trim().max(2000),
  model: z.string().trim().min(1).max(256),
  name: z.string().trim().min(1).max(160),
})

type ProfileFormValues = z.infer<typeof profileFormSchema>

const createInitialContract = () =>
  JSON.stringify(
    {
      inputs: [{ key: "currentMessage", required: true }],
      questions: [
        {
          instructions: "Classify the current message.",
          key: "intent",
          label: "Intent",
          options: [
            { label: "Positive", value: "positive" },
            { label: "Negative", value: "negative" },
          ],
          type: "choice",
        },
      ],
    },
    null,
    2,
  )

type ProfileEditorProps = {
  connections: DecisionConnectionSafe[]
  onOpenChange?: (open: boolean) => void
  open?: boolean
  profile?: DecisionProfileModel
  showTrigger?: boolean
}

export function ProfileEditor({
  connections,
  onOpenChange,
  open: controlledOpen,
  profile,
  showTrigger = true,
}: ProfileEditorProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const workspaceId = useWorkspaceId()
  const router = useRouter()
  const t = useTranslations()
  const isEditing = Boolean(profile)
  const form = useForm<ProfileFormValues>({
    defaultValues: {
      connectionId: profile?.connectionId ?? connections[0]?.id ?? "",
      contractJson: profile
        ? JSON.stringify(profile.contract, null, 2)
        : createInitialContract(),
      description: profile?.description ?? "",
      model: profile?.model ?? connections[0]?.defaultModel ?? "",
      name: profile?.name ?? "",
    },
    mode: "onChange",
    resolver: zodResolver(profileFormSchema),
  })
  const connectionId = useWatch({
    control: form.control,
    name: "connectionId",
  })
  const selectedConnection = connections.find(
    (connection) => connection.id === connectionId,
  )
  const open = controlledOpen ?? uncontrolledOpen
  const handleOpenChange = (nextOpen: boolean) => {
    setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  const onSuccess = () => {
    toast.success(
      t(isEditing ? "messages.updatedSuccess" : "messages.createdSuccess", {
        feature: t("decision.profiles"),
      }),
    )
    handleOpenChange(false)
    router.refresh()
  }
  const onError = ({ error }: { error: { serverError?: string } }) => {
    if (error.serverError) {
      toast.error(error.serverError)
    }
  }
  const { execute: create, isPending: isCreating } = useAction(
    createDecisionProfileAction.bind(null, workspaceId),
    { onError, onSuccess },
  )
  const { execute: update, isPending: isUpdating } = useAction(
    updateDecisionProfileAction.bind(null, workspaceId),
    { onError, onSuccess },
  )
  const isPending = isCreating || isUpdating

  const submit = (values: ProfileFormValues) => {
    let contract: unknown
    try {
      contract = JSON.parse(values.contractJson)
    } catch {
      form.setError("contractJson", { message: t("decision.invalidContract") })
      return
    }

    const payload = {
      connectionId: values.connectionId,
      contract,
      description: values.description || null,
      model: values.model,
      name: values.name,
    }
    if (profile) {
      update({ ...payload, id: profile.id })
    } else {
      create(payload)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {showTrigger ? (
        <DialogTrigger
          render={
            profile ? (
              <Button size="sm" type="button" variant="outline">
                <PencilIcon className="size-4" />
                {t("actions.edit")}
              </Button>
            ) : (
              <Button
                disabled={connections.length === 0}
                size="sm"
                type="button"
              >
                <PlusIcon />
                {t("decision.addProfile")}
              </Button>
            )
          }
        />
      ) : null}
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(isEditing ? "decision.editProfile" : "decision.addProfile")}
          </DialogTitle>
          <DialogDescription>
            {t("decision.profileDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <InputField label={t("fields.name.label")} name="name" required />
            <TextareaField
              label={t("fields.description.label")}
              name="description"
              rows={2}
            />
            <SelectField
              label={t("decision.connection")}
              name="connectionId"
              options={connections.map((connection) => ({
                label: connection.name,
                value: connection.id,
              }))}
              required
            />
            <SelectField
              label={t("decision.model")}
              name="model"
              options={(selectedConnection?.modelCatalog ?? []).map(
                (model) => ({
                  label: model,
                  value: model,
                }),
              )}
              required
            />
            <TextareaField
              description={t("decision.contractDescription")}
              label={t("decision.contract")}
              name="contractJson"
              required
              rows={16}
            />
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button disabled={isPending} type="submit">
                {isPending && <Loader2Icon className="animate-spin" />}
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
