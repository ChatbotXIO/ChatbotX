"use client"

import type { DecisionConnectionSafe } from "@chatbotx.io/business"
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
import { createDecisionConnectionAction } from "@/features/decision-connections/actions/create-decision-connection.action"
import { updateDecisionConnectionAction } from "@/features/decision-connections/actions/update-decision-connection.action"
import { useWorkspaceId } from "@/hooks/routing"

const providerKinds = [
  "typesafe",
  "systemOneCompatible",
  "openrouterDecision",
] as const
const modelCatalogDelimiter = /[\n,]/

const connectionFormSchema = z.object({
  credential: z.string().trim().max(2048),
  defaultModel: z.string().trim().max(256),
  endpoint: z.string().trim().max(2048),
  modelCatalogText: z.string().trim().min(1).max(26_000),
  name: z.string().trim().min(1).max(160),
  providerKind: z.enum(providerKinds),
})

type ConnectionFormValues = z.infer<typeof connectionFormSchema>

const parseModelCatalog = (value: string) => [
  ...new Set(
    value
      .split(modelCatalogDelimiter)
      .map((model) => model.trim())
      .filter(Boolean),
  ),
]

type DecisionConnectionDialogProps = {
  connection?: DecisionConnectionSafe
}

export function DecisionConnectionDialog({
  connection,
}: DecisionConnectionDialogProps) {
  const [open, setOpen] = useState(false)
  const workspaceId = useWorkspaceId()
  const router = useRouter()
  const t = useTranslations()
  const isEditing = Boolean(connection)
  const form = useForm<ConnectionFormValues>({
    defaultValues: {
      credential: "",
      defaultModel: connection?.defaultModel ?? "",
      endpoint: connection?.endpoint ?? "",
      modelCatalogText: connection?.modelCatalog.join("\n") ?? "",
      name: connection?.name ?? "",
      providerKind: connection?.providerKind ?? "typesafe",
    },
    mode: "onChange",
    resolver: zodResolver(connectionFormSchema),
  })
  const providerKind = useWatch({
    control: form.control,
    name: "providerKind",
  })

  const onSuccess = () => {
    toast.success(
      t(isEditing ? "messages.updatedSuccess" : "messages.createdSuccess", {
        feature: t("decision.connections"),
      }),
    )
    setOpen(false)
    router.refresh()
  }

  const onError = ({ error }: { error: { serverError?: string } }) => {
    if (error.serverError) {
      toast.error(error.serverError)
    }
  }

  const { execute: create, isPending: isCreating } = useAction(
    createDecisionConnectionAction.bind(null, workspaceId),
    { onError, onSuccess },
  )
  const { execute: update, isPending: isUpdating } = useAction(
    updateDecisionConnectionAction.bind(null, workspaceId),
    { onError, onSuccess },
  )
  const isPending = isCreating || isUpdating

  const submit = (values: ConnectionFormValues) => {
    const payload = {
      credential: values.credential || undefined,
      defaultModel: values.defaultModel || null,
      endpoint: values.endpoint || null,
      modelCatalog: parseModelCatalog(values.modelCatalogText),
      name: values.name,
      providerKind: values.providerKind,
    }

    if (connection) {
      update({ ...payload, id: connection.id })
      return
    }

    if (!payload.credential) {
      form.setError("credential", {
        message: t("decision.credentialRequired"),
      })
      return
    }
    create(payload)
  }

  const providerOptions = providerKinds.map((value) => ({
    label: t(`decision.providers.${value}`),
    value,
  }))

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          connection ? (
            <Button size="sm" type="button" variant="outline">
              <PencilIcon className="size-4" />
              {t("actions.edit")}
            </Button>
          ) : (
            <Button size="sm" type="button">
              <PlusIcon />
              {t("decision.addConnection")}
            </Button>
          )
        }
      />
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(
              isEditing ? "decision.editConnection" : "decision.addConnection",
            )}
          </DialogTitle>
          <DialogDescription>
            {t("decision.connectionDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <InputField label={t("fields.name.label")} name="name" required />
            <SelectField
              label={t("decision.provider")}
              name="providerKind"
              options={providerOptions}
              required
            />
            {providerKind === "systemOneCompatible" && (
              <InputField
                description={t("decision.endpointDescription")}
                label={t("decision.endpoint")}
                name="endpoint"
                required
                type="url"
              />
            )}
            <TextareaField
              description={t("decision.modelCatalogDescription")}
              label={t("decision.modelCatalog")}
              name="modelCatalogText"
              required
              rows={4}
            />
            <InputField
              label={t("decision.defaultModel")}
              name="defaultModel"
            />
            <InputField
              description={
                isEditing ? t("decision.credentialKeepExisting") : undefined
              }
              label={t("fields.apiKey.label")}
              name="credential"
              required={!isEditing}
              type="password"
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
