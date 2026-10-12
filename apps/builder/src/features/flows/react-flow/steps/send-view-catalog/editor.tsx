"use client"

import {
  resolveSendViewCatalogLengthLimits,
  type SendViewCatalogDetailsFormInput,
  type SendViewCatalogDetailsFormValues,
  type SendViewCatalogLengthLimits,
  sendViewCatalogDetailsFormSchema,
} from "@chatbotx.io/flow-config"
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
import { zodResolver } from "@hookform/resolvers/zod"
import { StoreIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { memo, useState } from "react"
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { MetaCatalogProductSelect } from "@/features/integration-whatsapp/message-templates/components/meta-catalog-product-select"
import { resolveFlowValidationCodeKey } from "../../flow-validation-message"

type SendViewCatalogStepEditorProps = {
  parentName: string
}

/**
 * The rich-text field would print a validation code raw, since it is the rule's
 * own message; a code is shown as its translated text and a plain schema
 * message as it is.
 */
const FieldErrorMessage = ({ name }: { name: string }) => {
  const t = useTranslations()
  const { formState, getFieldState } = useFormContext()
  const message = getFieldState(name, formState).error?.message

  if (!message) {
    return null
  }

  const key = resolveFlowValidationCodeKey(message)

  return (
    <p className="text-destructive text-sm" role="alert">
      {key ? t(key) : message}
    </p>
  )
}

type CatalogDetailsFormProps = {
  current: SendViewCatalogDetailsFormValues
  limits: SendViewCatalogLengthLimits
  onSave: (values: SendViewCatalogDetailsFormValues) => void
}

/**
 * Everything about the catalog button that is not the message itself. It edits
 * a form of its own and only writes to the step on save, so cancelling leaves
 * the step as it was.
 */
function CatalogDetailsForm({
  current,
  limits,
  onSave,
}: CatalogDetailsFormProps) {
  const t = useTranslations()
  const form = useForm<
    SendViewCatalogDetailsFormInput,
    unknown,
    SendViewCatalogDetailsFormValues
  >({
    resolver: zodResolver(sendViewCatalogDetailsFormSchema),
    defaultValues: current,
    mode: "onChange",
  })
  const thumbnailProductId = useWatch({
    control: form.control,
    name: "thumbnailProductId",
  })

  return (
    <FormProvider {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit(onSave)(event)
        }}
      >
        {/* The editor's toolbar floats just below the field while it is
            focused, so the next field steps aside by its height only then
            (as the message card does) instead of sitting under it. */}
        <div className="flex flex-col gap-1 focus-within:pb-8 [&_label]:font-semibold">
          <TiptapEditorField
            hideMessage
            includeBotFieldVariables
            includeCouponVariables
            label={t("flows.sendViewCatalog.footerLabel")}
            maxLength={limits.footer}
            name="footer"
            required={false}
          />
          <FieldErrorMessage name="footer" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-sm">
            {t("flows.sendViewCatalog.thumbnailLabel")}
          </span>
          <MetaCatalogProductSelect
            allowClear
            onChange={(option) =>
              form.setValue("thumbnailProductId", option?.retailerId ?? "", {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            value={thumbnailProductId || undefined}
          />
        </div>
        <DialogFooter>
          <DialogClose
            render={
              <Button size="sm" type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
          <Button disabled={!form.formState.isValid} size="sm" type="submit">
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </form>
    </FormProvider>
  )
}

type CatalogDetailsDialogProps = CatalogDetailsFormProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CatalogDetailsDialogInner({
  open,
  onOpenChange,
  current,
  limits,
  onSave,
}: CatalogDetailsDialogProps) {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {/* The popup is a one-column grid whose track grows to its widest child, so
          a long product name pushed the form past the dialog's edge; a
          `minmax(0, 1fr)` track lets the picker truncate instead. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>{t("actions.edit")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <CatalogDetailsForm
          current={current}
          limits={limits}
          onSave={(values) => {
            onSave(values)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

const CatalogDetailsDialog = memo(CatalogDetailsDialogInner)

const SendViewCatalogStepEditor = (props: SendViewCatalogStepEditorProps) => {
  const { parentName } = props
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  // A new key per opening remounts the dialog, so its form starts again from
  // the step and an edit that was cancelled cannot come back and be saved.
  const [detailsDialogSession, setDetailsDialogSession] = useState(0)

  // Watched rather than read: the budget shown must follow the node's channel,
  // which can change while editing.
  const channel = useWatch({ name: "beforeStep.channel" })
  const footer =
    (useWatch({ control, name: `${parentName}.footer` }) as
      | string
      | undefined) ?? ""
  const thumbnailProductId =
    (useWatch({ control, name: `${parentName}.thumbnailProductId` }) as
      | string
      | undefined) ?? ""
  const limits = resolveSendViewCatalogLengthLimits(channel)

  const handleSaveDetails = (values: SendViewCatalogDetailsFormValues) => {
    for (const field of ["footer", "thumbnailProductId"] as const) {
      setValue(`${parentName}.${field}`, values[field], {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg">
      <div className="group/body flex flex-col bg-secondary px-4 py-2">
        {/* The body is prose that spans lines, so it reads as a textarea
            instead of the one-line box the editor starts as. */}
        <div className="[&_.tiptap]:min-h-14">
          <TiptapEditorField
            hideMessage
            includeBotFieldVariables
            includeCouponVariables
            maxLength={limits.text}
            name={`${parentName}.text`}
          />
        </div>
        {/* The editor's toolbar floats just below it while focused, so the
            error and the footer step aside by the toolbar's height only then,
            instead of leaving a permanent gap. Nothing to show, nothing here. */}
        <div className="flex flex-col gap-1 pt-2.5 empty:hidden group-focus-within/body:pt-8">
          <FieldErrorMessage name={`${parentName}.text`} />
          {footer ? (
            <p className="line-clamp-2 whitespace-pre-line break-words text-muted-foreground text-xs">
              {footer}
            </p>
          ) : null}
        </div>
      </div>

      <div className="bg-slate-200 px-3 py-2 dark:bg-neutral-900">
        <Button
          className="w-full justify-center gap-1.5"
          onClick={() => {
            setDetailsDialogSession((session) => session + 1)
            setDetailsDialogOpen(true)
          }}
          type="button"
          variant="outline"
        >
          <StoreIcon className="size-4" />
          <span className="truncate">{t("flows.actions.sendViewCatalog")}</span>
        </Button>
      </div>

      <CatalogDetailsDialog
        current={{ footer, thumbnailProductId }}
        key={detailsDialogSession}
        limits={limits}
        onOpenChange={setDetailsDialogOpen}
        onSave={handleSaveDetails}
        open={detailsDialogOpen}
      />
    </div>
  )
}

export default SendViewCatalogStepEditor
