"use client"

import type { PlaceCategoryListItem } from "@chatbotx.io/business"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { parseCoordinatePair } from "@chatbotx.io/utils/coordinates"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"
import { createPlaceLocationAction } from "../actions/create-place-location.action"
import { updatePlaceLocationAction } from "../actions/update-place-location.action"
import { placeLocationFormSchema } from "../schema/action"

/** Select cannot hold an empty/null value, so "No category" uses a sentinel. */
const NO_CATEGORY = "none"

type LocationFormDialogProps = {
  workspaceId: string
  categories: PlaceCategoryListItem[]
  location?: {
    id: string
    name: string
    latitude: number
    longitude: number
    categoryId: string | null
  }
  hideTrigger?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type FormValues = {
  name: string
  latitude: number | undefined
  longitude: number | undefined
  categoryId: string | null
}

export function LocationFormDialog({
  workspaceId,
  categories,
  location,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: LocationFormDialogProps) {
  const t = useTranslations("placesNearMe.locations")
  const tActions = useTranslations("actions")
  const tFields = useTranslations("fields")
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const action = location
    ? updatePlaceLocationAction.bind(null, workspaceId, location.id)
    : createPlaceLocationAction.bind(null, workspaceId)

  const { form, handleSubmitWithAction } = useHookFormAction(
    action,
    zodResolver(placeLocationFormSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success(t(location ? "updated" : "created"))
          setOpen(false)
          if (!location) {
            form.reset()
          }
          router.refresh()
        },
        onError: ({ error }) => {
          if (!error.validationErrors) {
            toastActionError(t("saveError"))({ error })
          }
        },
      },
      formProps: {
        defaultValues: {
          name: location?.name ?? "",
          latitude: location?.latitude,
          longitude: location?.longitude,
          categoryId: location?.categoryId ?? null,
        } as FormValues,
      },
    },
  )

  const categoryItems = [
    { value: NO_CATEGORY, label: t("noCategory") },
    ...categories.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ]

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {hideTrigger ? null : (
        <DialogTrigger
          render={
            <Button>
              <PlusIcon className="h-4 w-4" />
              {t("add")}
            </Button>
          }
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{location ? t("edit") : t("add")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={handleSubmitWithAction}>
            <InputField label={tFields("name.label")} name="name" required />
            <div className="grid grid-cols-2 gap-4">
              <FormFieldWrapper label={t("latitude")} name="latitude" required>
                {(field) => (
                  <Input
                    name="latitude"
                    onBlur={field.onBlur}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? undefined
                          : event.target.valueAsNumber,
                      )
                    }
                    onPaste={(event) => {
                      const pair = parseCoordinatePair(
                        event.clipboardData.getData("text"),
                      )
                      if (!pair) {
                        return
                      }
                      event.preventDefault()
                      form.setValue("latitude", pair.latitude, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                      form.setValue("longitude", pair.longitude, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }}
                    step="any"
                    type="number"
                    value={(field.value as number | undefined) ?? ""}
                  />
                )}
              </FormFieldWrapper>
              <FormFieldWrapper
                label={t("longitude")}
                name="longitude"
                required
              >
                {(field) => (
                  <Input
                    name="longitude"
                    onBlur={field.onBlur}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? undefined
                          : event.target.valueAsNumber,
                      )
                    }
                    step="any"
                    type="number"
                    value={(field.value as number | undefined) ?? ""}
                  />
                )}
              </FormFieldWrapper>
            </div>
            <FormFieldWrapper
              label={tFields("category.label")}
              name="categoryId"
            >
              {(field) => (
                <Select
                  items={categoryItems}
                  onValueChange={(value) =>
                    field.onChange(value === NO_CATEGORY ? null : value)
                  }
                  value={(field.value as string | null) ?? NO_CATEGORY}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormFieldWrapper>
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="outline">
                    {tActions("cancel")}
                  </Button>
                }
              />
              <Button disabled={form.formState.isSubmitting} type="submit">
                {tActions("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
