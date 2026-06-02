"use client"

import {
  WHATSAPP_FLOW_BUTTON_MAX,
  type WhatsappFlowDialogFormValues,
  type WhatsappFlowFieldMapping,
  whatsappFlowDialogFormSchema,
} from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import {
  SelectField,
  type SelectOption,
} from "@chatbotx.io/ui/components/form/select-field"
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
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { zodResolver } from "@hookform/resolvers/zod"
import ky from "ky"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { CreateCustomFieldDialog } from "@/features/custom-fields/create-custom-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import type {
  GetWhatsappFlowScreensResponse,
  WhatsappFlowScreenResource,
} from "@/features/integration-whatsapp/flows/schema/query"
import { useWorkspaceId } from "@/hooks/routing"
import { useWhatsappFlow } from "../../../stores/whatsapp-flow-store-provider"

type FlowDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  parentName: string
}

const SCREENS_CACHE_TTL_MS = 5 * 60 * 1000
const SCREENS_CACHE_MAX_ENTRIES = 50
const WHATSAPP_FLOW_PUBLISHED_STATUS = "PUBLISHED"

type ScreensCacheEntry = {
  screens: WhatsappFlowScreenResource[]
  cachedAt: number
}
const screensCache = new Map<string, ScreensCacheEntry>()

const setScreensCache = (key: string, entry: ScreensCacheEntry) => {
  if (screensCache.size >= SCREENS_CACHE_MAX_ENTRIES) {
    screensCache.delete(screensCache.keys().next().value ?? "")
  }
  screensCache.set(key, entry)
}

function FlowDialogInner({ open, onOpenChange, parentName }: FlowDialogProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const parentForm = useFormContext()

  const whatsappFlowsAll = useWhatsappFlow((s) => s.whatsappFlows)
  const loadingFlows = useWhatsappFlow((s) => s.loadingWhatsappFlows)
  const [screens, setScreens] = useState<WhatsappFlowScreenResource[]>([])
  const [loadingScreens, setLoadingScreens] = useState(false)
  const [screenError, setScreenError] = useState<string | null>(null)

  const currentButtonLabel = parentForm.watch(`${parentName}.buttons.0.label`)
  const currentInboxId = parentForm.watch(`${parentName}.inboxId`)
  const currentFlowId = parentForm.watch(`${parentName}.flow.id`)
  const currentSourceId = parentForm.watch(`${parentName}.flow.sourceId`)
  const currentStartScreenId = parentForm.watch(
    `${parentName}.flow.startScreenId`,
  )
  const currentFieldMappings = parentForm.watch(
    `${parentName}.flow.fieldMappings`,
  ) as WhatsappFlowFieldMapping[]

  const whatsappFlows = useMemo(() => {
    const published = whatsappFlowsAll.filter(
      (flow) => flow.status === WHATSAPP_FLOW_PUBLISHED_STATUS,
    )
    return currentInboxId
      ? published.filter(
          (flow) => flow.integrationWhatsapp?.inboxId === currentInboxId,
        )
      : published
  }, [whatsappFlowsAll, currentInboxId])

  const form = useForm<WhatsappFlowDialogFormValues>({
    resolver: zodResolver(whatsappFlowDialogFormSchema),
    defaultValues: {
      buttonLabel: currentButtonLabel ?? "",
      flow: {
        id: currentFlowId ?? null,
        sourceId: currentSourceId ?? "",
        startScreenId: currentStartScreenId ?? null,
        fieldMappings: currentFieldMappings ?? [],
      },
    },
    values: {
      buttonLabel: currentButtonLabel ?? "",
      flow: {
        id: currentFlowId ?? null,
        sourceId: currentSourceId ?? "",
        startScreenId: currentStartScreenId ?? null,
        fieldMappings: currentFieldMappings ?? [],
      },
    },
    mode: "onChange",
  })

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "flow.fieldMappings",
    keyName: "_key",
  })

  const selectedFlowId = useWatch({ control: form.control, name: "flow.id" })
  const selectedStartScreenId = useWatch({
    control: form.control,
    name: "flow.startScreenId",
  })

  const getAllCustomFields = useCustomFieldStore(
    (state) => state.getAllCustomFields,
  )

  const handleCustomFieldCreated = useCallback(() => {
    getAllCustomFields()
  }, [getAllCustomFields])

  useEffect(() => {
    if (!(open && selectedFlowId)) {
      setScreens([])
      setScreenError(null)
      return
    }

    if (!workspaceId) {
      setScreens([])
      setScreenError(null)
      return
    }

    const cacheKey = `${workspaceId}:${selectedFlowId}`
    const cached = screensCache.get(cacheKey)
    if (cached && Date.now() - cached.cachedAt < SCREENS_CACHE_TTL_MS) {
      setScreens(cached.screens)
      setScreenError(null)
      return
    }

    const fetchScreens = async () => {
      setLoadingScreens(true)
      setScreenError(null)
      try {
        const data = await ky
          .get<GetWhatsappFlowScreensResponse>(
            `/api/workspaces/${workspaceId}/whatsapp-flows/${selectedFlowId}/screens`,
          )
          .json()
        const nextScreens = data.screens ?? []
        setScreensCache(cacheKey, {
          screens: nextScreens,
          cachedAt: Date.now(),
        })
        setScreens(nextScreens)
      } catch {
        setScreens([])
        setScreenError(t("messages.errorLoadingData"))
      } finally {
        setLoadingScreens(false)
      }
    }

    fetchScreens()
  }, [open, selectedFlowId, workspaceId, t])

  useEffect(() => {
    if (!selectedStartScreenId || screens.length === 0) {
      return
    }

    const selectedScreen = screens.find((s) => s.id === selectedStartScreenId)
    if (!selectedScreen) {
      replace([])
      return
    }

    const outputs = selectedScreen.output ?? []
    const existingMappings = form.getValues("flow.fieldMappings")

    const newMappings: WhatsappFlowFieldMapping[] = outputs.map((output) => {
      const existing = existingMappings.find((m) => m.paramKey === output.value)
      return {
        paramKey: output.value,
        paramLabel: output.label,
        customFieldId: existing?.customFieldId ?? null,
      }
    })

    replace(newMappings)
  }, [selectedStartScreenId, screens, replace, form])

  const flowOptions: SelectOption[] = useMemo(
    () =>
      whatsappFlows.map((flow) => ({
        label: flow.name,
        value: flow.id,
      })),
    [whatsappFlows],
  )

  const screenOptions: SelectOption[] = useMemo(
    () =>
      screens.map((screen) => ({
        label: screen.title || screen.id,
        value: screen.id,
      })),
    [screens],
  )

  const handleFlowChange = useCallback(
    (value: string) => {
      const flow = whatsappFlows.find((f) => f.id === value)
      if (flow) {
        form.setValue("flow.id", flow.id, { shouldDirty: true })
        form.setValue("flow.sourceId", flow.sourceId, {
          shouldDirty: true,
          shouldValidate: true,
        })
        form.setValue("flow.startScreenId", "", { shouldDirty: true })
        replace([])
      }
    },
    [whatsappFlows, form, replace],
  )

  const onSubmit = useCallback(
    (values: WhatsappFlowDialogFormValues) => {
      const selectedScreen = screens.find(
        (screen) => screen.id === values.flow.startScreenId,
      )
      const outputs = selectedScreen?.output ?? []
      const fieldMappings = outputs.map((output) => {
        const existing = values.flow.fieldMappings.find(
          (mapping) => mapping.paramKey === output.value,
        )
        return {
          paramKey: output.value,
          paramLabel: output.label,
          customFieldId: existing?.customFieldId ?? null,
        }
      })
      const setOptions = { shouldDirty: true, shouldValidate: true }

      parentForm.setValue(
        `${parentName}.buttons.0.label`,
        values.buttonLabel,
        setOptions,
      )
      parentForm.setValue(`${parentName}.flow.id`, values.flow.id, setOptions)
      parentForm.setValue(
        `${parentName}.flow.sourceId`,
        values.flow.sourceId,
        setOptions,
      )
      parentForm.setValue(
        `${parentName}.flow.startScreenId`,
        values.flow.startScreenId,
        setOptions,
      )
      parentForm.setValue(
        `${parentName}.flow.fieldMappings`,
        fieldMappings,
        setOptions,
      )
      onOpenChange(false)
    },
    [parentForm, parentName, onOpenChange, screens],
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("flows.whatsappFlow.editDialogTitle")}</DialogTitle>
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
            <InputField
              label={t("flows.whatsappFlow.buttonLabel")}
              maxLength={WHATSAPP_FLOW_BUTTON_MAX}
              name="buttonLabel"
              required
            />

            <SelectField
              disabled={loadingFlows}
              label={t("flows.whatsappFlow.selectFlow")}
              name="flow.id"
              onValueChange={handleFlowChange}
              options={flowOptions}
              placeholder={
                loadingFlows
                  ? t("messages.loadingData")
                  : t("flows.whatsappFlow.selectFlowPlaceholder")
              }
              required
            />

            {selectedFlowId &&
              (screenError ? (
                <p className="text-destructive text-sm">{screenError}</p>
              ) : (
                <SelectField
                  disabled={loadingScreens}
                  key={`${selectedFlowId}-${screenOptions.length}`}
                  label={t("flows.whatsappFlow.startScreen")}
                  name="flow.startScreenId"
                  options={screenOptions}
                  placeholder={
                    loadingScreens
                      ? t("messages.loadingData")
                      : t("flows.whatsappFlow.selectScreenPlaceholder")
                  }
                  required
                />
              ))}

            {selectedStartScreenId && fields.length > 0 && (
              <div className="mt-6 flex flex-col gap-2 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">
                    {t("flows.whatsappFlow.fieldMappings")}
                  </span>
                  <CreateCustomFieldDialog
                    folderId={null}
                    modal={false}
                    onSuccess={handleCustomFieldCreated}
                    triggerButton={
                      <Button
                        className="h-auto cursor-pointer p-0 text-[12px] text-primary"
                        type="button"
                        variant="link"
                      >
                        {t("flows.whatsappFlow.addCustomField")}
                      </Button>
                    }
                    workspaceId={workspaceId}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  {fields.map((field, index) => (
                    <div className="flex items-end gap-2" key={field._key}>
                      <div className="flex-1">
                        <InputField
                          className="hidden"
                          name={`flow.fieldMappings.${index}.paramKey`}
                          type="hidden"
                        />
                        <Input
                          disabled
                          value={field.paramLabel ?? field.paramKey}
                        />
                      </div>
                      <div className="flex-1">
                        <CustomFieldSelect
                          allowCreate={false}
                          label=""
                          name={`flow.fieldMappings.${index}.customFieldId`}
                          placeholder={t(
                            "flows.whatsappFlow.selectCustomFieldPlaceholder",
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" type="button" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <Button
                disabled={!form.formState.isValid}
                size="sm"
                type="submit"
              >
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}

export const FlowDialog = memo(FlowDialogInner)
