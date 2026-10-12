"use client"

import {
  formatWhatsappLocationCoordinate,
  isWhatsappLocationUnset,
  parseWhatsappLocationCoordinate,
  WHATSAPP_LOCATION_TEXT_MAX,
  type WhatsappLocationFormError,
  type WhatsappLocationFormValues,
  whatsappLocationFormErrors,
  whatsappLocationFormSchema,
} from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
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
import { PencilIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { memo, useCallback, useState } from "react"
import {
  type FieldErrors,
  FormProvider,
  type Resolver,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { LocationPreview } from "./location-preview"

type WhatsappLocationStepEditorProps = {
  parentName: string
}

type LocationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: WhatsappLocationFormValues
  onSave: (values: WhatsappLocationFormValues) => void
}

const isLocationFormError = (
  message: unknown,
): message is WhatsappLocationFormError =>
  typeof message === "string" && message in whatsappLocationFormErrors

const resolveLocationForm = zodResolver(
  whatsappLocationFormSchema,
) as Resolver<WhatsappLocationFormValues>

/** The shared form schema reports error codes; translate them for display. */
function useLocationFormResolver(): Resolver<WhatsappLocationFormValues> {
  const t = useTranslations()

  return useCallback<Resolver<WhatsappLocationFormValues>>(
    async (values, context, options) => {
      const result = await resolveLocationForm(values, context, options)
      if (Object.keys(result.errors).length === 0) {
        return result
      }

      const errors = Object.fromEntries(
        Object.entries(result.errors).map(([field, error]) => [
          field,
          isLocationFormError(error?.message)
            ? {
                ...error,
                message: t(`flows.whatsappLocation.errors.${error.message}`),
              }
            : error,
        ]),
      ) as FieldErrors<WhatsappLocationFormValues>

      return { values: {}, errors }
    },
    [t],
  )
}

function LocationDialogInner({
  open,
  onOpenChange,
  current,
  onSave,
}: LocationDialogProps) {
  const t = useTranslations()
  const resolver = useLocationFormResolver()

  const form = useForm<WhatsappLocationFormValues>({
    resolver,
    defaultValues: current,
    values: current,
    mode: "onChange",
  })

  const onSubmit = (values: WhatsappLocationFormValues) => {
    onSave(values)
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("flows.whatsappLocation.title")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <FormProvider {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit(onSubmit)(e)
            }}
          >
            <TiptapEditorField
              enableEmoji={false}
              label={t("flows.whatsappLocation.name")}
              maxLength={WHATSAPP_LOCATION_TEXT_MAX}
              name="name"
              showEmojiPicker={false}
            />
            <TiptapEditorField
              enableEmoji={false}
              label={t("flows.whatsappLocation.address")}
              maxLength={WHATSAPP_LOCATION_TEXT_MAX}
              name="address"
              showEmojiPicker={false}
            />
            <div className="grid grid-cols-2 gap-3">
              <InputField
                inputMode="decimal"
                label={t("flows.whatsappLocation.latitude")}
                name="latitude"
                required
              />
              <InputField
                inputMode="decimal"
                label={t("flows.whatsappLocation.longitude")}
                name="longitude"
                required
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
              <Button
                disabled={!form.formState.isValid}
                size="sm"
                type="submit"
              >
                {t("actions.continue")}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}

const LocationDialog = memo(LocationDialogInner)

const WhatsappLocationStepEditor = ({
  parentName,
}: WhatsappLocationStepEditorProps) => {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const [name, address, latitude, longitude] = useWatch({
    control,
    name: [
      `${parentName}.name`,
      `${parentName}.address`,
      `${parentName}.latitude`,
      `${parentName}.longitude`,
    ],
  }) as [string | undefined, string | undefined, number, number]

  const [dialogOpen, setDialogOpen] = useState(false)

  // An unconfigured step opens with empty coordinates, not a pre-filled 0, 0.
  const isUnset = isWhatsappLocationUnset({ latitude, longitude })
  const current: WhatsappLocationFormValues = {
    name: name ?? "",
    address: address ?? "",
    latitude: isUnset ? "" : formatWhatsappLocationCoordinate(latitude),
    longitude: isUnset ? "" : formatWhatsappLocationCoordinate(longitude),
  }

  const handleSave = (values: WhatsappLocationFormValues) => {
    const options = { shouldDirty: true, shouldValidate: true }
    setValue(`${parentName}.name`, values.name, options)
    setValue(`${parentName}.address`, values.address, options)
    setValue(
      `${parentName}.latitude`,
      parseWhatsappLocationCoordinate(values.latitude),
      options,
    )
    setValue(
      `${parentName}.longitude`,
      parseWhatsappLocationCoordinate(values.longitude),
      options,
    )
  }

  return (
    <div className="group relative">
      <button
        aria-label={t("flows.whatsappLocation.setLocation")}
        className="block w-full rounded-lg text-left outline-none ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setDialogOpen(true)}
        type="button"
      >
        <LocationPreview
          address={address}
          className="overflow-hidden rounded-lg transition-opacity group-hover:opacity-90"
          fallbackTitle={t("flows.whatsappLocation.setLocation")}
          latitude={latitude}
          longitude={longitude}
          name={name}
        />
      </button>
      <span
        aria-hidden
        className="pointer-events-none absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-background/80 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <PencilIcon className="size-3" />
      </span>

      {/* Mounted only while open so Cancel discards unsaved edits. */}
      {dialogOpen ? (
        <LocationDialog
          current={current}
          onOpenChange={setDialogOpen}
          onSave={handleSave}
          open
        />
      ) : null}
    </div>
  )
}

export default WhatsappLocationStepEditor
