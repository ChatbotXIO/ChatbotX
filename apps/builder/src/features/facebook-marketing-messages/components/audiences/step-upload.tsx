"use client"

import type { AudienceUploadResult } from "@chatbotx.io/business/facebook-marketing-message-audience"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { FileSpreadsheetIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { type Resolver, useForm, useWatch } from "react-hook-form"
import { orpc } from "@/lib/orpc/query"
import { createAudienceAction } from "../../actions/create-audience.action"
import { uploadMoreAudienceAction } from "../../actions/upload-more-audience.action"
import {
  resolveUploadFeedback,
  type UploadOutcome,
} from "../../lib/audience-upload"
import {
  AUDIENCE_ACCEPT_ATTRIBUTE,
  AUDIENCE_DESCRIPTION_MAX,
  AUDIENCE_NAME_MAX,
  createAudienceSchema,
  uploadMoreAudienceSchema,
} from "../../schema/audience"

export type UploadTarget = {
  id: string
  name: string
  adAccountId: string
  pageId: string
}

type FormValues = {
  id: string
  adAccountId: string
  pageId: string
  name: string
  description: string
  // `undefined` until a file is picked; the schema rejects it as fileRequired.
  file: File | undefined
}

type Props = {
  workspaceId: string
  /** `null` = create a new audience; otherwise append rows to it. */
  target: UploadTarget | null
  /** Create mode only: a previous attempt may have left an audience on Meta. */
  uploadLocked: boolean
  /** Inline error that outlives this step (Back / forward keeps it visible). */
  lockedMessage: string | null
  onBack: () => void
  onPendingChange: (pending: boolean) => void
  onUploaded: (result: AudienceUploadResult) => void
  /** Any failed upload: an audience row may exist, so caches must refresh. */
  onFailed: (failure: { message: string; lockUpload: boolean }) => void
}

/** Native file input styled as a dashed drop zone. Validation is the schema's. */
function FileDropField({ disabled }: { disabled: boolean }) {
  const t = useTranslations("facebookMarketingMessages.audiences")
  const tWizard = useTranslations("facebookMarketingMessages.audiences.wizard")

  return (
    <FormField
      name="file"
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>{t("fields.file")}</FormLabel>
          <FormControl>
            {/* The invisible native input covers the zone, so click and drop both work. */}
            <div className="relative flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center hover:bg-muted">
              <FileSpreadsheetIcon className="size-6" />
              <span className="text-sm">
                {field.value instanceof File
                  ? field.value.name
                  : tWizard("dropzone")}
              </span>
              <span className="text-muted-foreground text-xs">
                {tWizard("maxFileSize")}
              </span>
              <input
                accept={AUDIENCE_ACCEPT_ATTRIBUTE}
                className="absolute inset-0 cursor-pointer opacity-0"
                disabled={disabled}
                onChange={(event) => field.onChange(event.target.files?.[0])}
                type="file"
              />
            </div>
          </FormControl>
          {/* Schema messages are wizard i18n keys (see schema/audience.ts). */}
          {fieldState.error?.message && (
            <p className="text-destructive text-sm">
              {tWizard(fieldState.error.message as "fileRequired")}
            </p>
          )}
        </FormItem>
      )}
    />
  )
}

/** Create mode: choose where the audience lives and what it is called. */
function CreateTargetFields({
  workspaceId,
  onTosBlockedChange,
}: {
  workspaceId: string
  onTosBlockedChange: (blocked: boolean) => void
}) {
  const t = useTranslations()
  const tWizard = useTranslations("facebookMarketingMessages.audiences.wizard")

  const pages = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesPagesAPI.queryOptions(
      { input: { workspaceId } },
    ),
  )
  const adAccounts = useQuery(
    orpc.facebookMarketingMessagesAPI.listMarketingMessagesAdAccountsAPI.queryOptions(
      { input: { workspaceId } },
    ),
  )
  const accounts = adAccounts.data?.accounts ?? []
  const selectedAccountId = useWatch<FormValues, "adAccountId">({
    name: "adAccountId",
  })
  const blockedAccount = accounts.find(
    (account) => account.id === selectedAccountId && !account.tosAccepted,
  )

  // Report the gate up so the submit button can block it; the server rejects
  // these too (createAudience), this just avoids the trip.
  useEffect(() => {
    onTosBlockedChange(Boolean(blockedAccount))
  }, [blockedAccount, onTosBlockedChange])

  return (
    <>
      <SelectField
        label={t("facebookMarketingMessages.fields.adAccount")}
        name="adAccountId"
        options={accounts.map((account) => ({
          value: account.id,
          label: account.name,
        }))}
        placeholder={t("actions.pleaseSelect")}
        required
      />
      {blockedAccount && (
        <Alert variant="destructive">
          <AlertDescription>
            <a
              className="underline"
              href={blockedAccount.tosUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("facebookMarketingMessages.errors.tosNotAccepted", {
                url: blockedAccount.tosUrl,
              })}
            </a>
          </AlertDescription>
        </Alert>
      )}
      <SelectField
        label={t("facebookMarketingMessages.fields.page")}
        name="pageId"
        options={(pages.data?.pages ?? []).map((page) => ({
          value: page.pageId,
          label: page.name,
        }))}
        placeholder={t("actions.pleaseSelect")}
        required
      />
      <InputField
        label={t("fields.name.label")}
        maxLength={AUDIENCE_NAME_MAX}
        name="name"
        placeholder={tWizard("namePlaceholder")}
        required
      />
      <TextareaField
        label={t("fields.description.label")}
        maxLength={AUDIENCE_DESCRIPTION_MAX}
        name="description"
        placeholder={tWizard("descriptionPlaceholder")}
      />
    </>
  )
}

/** Append mode: the target is fixed, shown read-only. */
function AppendTargetSummary({ target }: { target: UploadTarget }) {
  const t = useTranslations()
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{t("fields.name.label")}</dt>
      <dd>{target.name}</dd>
      <dt className="text-muted-foreground">
        {t("facebookMarketingMessages.fields.adAccount")}
      </dt>
      <dd>{target.adAccountId}</dd>
      <dt className="text-muted-foreground">
        {t("facebookMarketingMessages.fields.page")}
      </dt>
      <dd>{target.pageId}</dd>
    </dl>
  )
}

export function StepUpload({
  workspaceId,
  target,
  uploadLocked,
  lockedMessage,
  onBack,
  onPendingChange,
  onUploaded,
  onFailed,
}: Props) {
  const tWizard = useTranslations("facebookMarketingMessages.audiences.wizard")
  const tAudiences = useTranslations("facebookMarketingMessages.audiences")
  const [serverError, setServerError] = useState<string | null>(null)
  const [tosBlocked, setTosBlocked] = useState(false)

  const form = useForm<FormValues>({
    mode: "onChange",
    // The schema is chosen by mode; both validate a real `File` object.
    resolver: useMemo(
      () =>
        zodResolver(
          target ? uploadMoreAudienceSchema : createAudienceSchema,
        ) as unknown as Resolver<FormValues>,
      [target],
    ),
    defaultValues: {
      id: target?.id ?? "",
      adAccountId: "",
      pageId: "",
      name: "",
      description: "",
      file: undefined,
    },
  })

  // One feedback path for both actions: a returned outcome is classified by
  // the server; anything thrown is uncertain (see resolveUploadFeedback).
  const mode = target ? "append" : "create"
  const handleResult = (
    outcome: UploadOutcome | undefined,
    thrownMessage?: string,
  ) => {
    const feedback = resolveUploadFeedback({
      mode,
      outcome,
      thrownMessage,
      uncertainMessage: tAudiences("errors.uploadUncertain"),
    })
    if (feedback.kind === "success") {
      onUploaded(feedback.result)
      return
    }
    setServerError(feedback.message)
    onFailed({ message: feedback.message, lockUpload: feedback.lockUpload })
  }
  const callbacks = {
    onExecute: () => {
      setServerError(null)
      onPendingChange(true)
    },
    onSettled: () => onPendingChange(false),
    onSuccess: ({ data }: { data?: UploadOutcome }) => handleResult(data),
    onError: ({ error }: { error: { serverError?: string } }) =>
      handleResult(undefined, error.serverError),
  }
  const create = useAction(
    createAudienceAction.bind(null, workspaceId),
    callbacks,
  )
  const append = useAction(
    uploadMoreAudienceAction.bind(null, workspaceId),
    callbacks,
  )
  const isPending = create.isPending || append.isPending

  const onSubmit = form.handleSubmit((values) => {
    // The resolver has already proven `file` is a File; the `File` itself (not
    // a FileList or path) is what the server action receives.
    const file = values.file as File
    if (target) {
      append.execute({ id: target.id, file })
      return
    }
    create.execute({
      adAccountId: values.adAccountId,
      pageId: values.pageId,
      name: values.name,
      description: values.description,
      file,
    })
  })

  const errorMessage = serverError ?? lockedMessage

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <p className="text-muted-foreground text-sm">{tWizard("uploadNote")}</p>
        {target ? (
          <AppendTargetSummary target={target} />
        ) : (
          <CreateTargetFields
            onTosBlockedChange={setTosBlocked}
            workspaceId={workspaceId}
          />
        )}
        <FileDropField disabled={isPending} />
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-between">
          <Button
            disabled={isPending}
            onClick={onBack}
            type="button"
            variant="outline"
          >
            {tWizard("back")}
          </Button>
          <Button
            disabled={isPending || uploadLocked || (!target && tosBlocked)}
            type="submit"
          >
            {isPending && <Loader2Icon className="size-4 animate-spin" />}
            {tWizard("upload")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
