"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import type { GlobalRouterDestination } from "@chatbotx.io/decision-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import {
  FormControl,
  FormField,
  FormItem,
} from "@chatbotx.io/ui/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { CreateCustomFieldDialog } from "@/features/custom-fields/create-custom-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import {
  useCustomFields,
  useInvalidateCustomFields,
} from "@/features/custom-fields/provider/custom-field-hook"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import type { DecisionProfileForm } from "../schema/form"

type DestinationOptions = {
  agents: Array<{ id: string; name: string }>
  flows: Array<{ id: string; name: string }>
  teams: Array<{ id: string; name: string }>
  users: Array<{ id: string; name: string }>
}

type DestinationPath =
  | "globalRouterConfig.fallback"
  | `globalRouterConfig.routes.${number}.destination`

const destinationModes = ["flow", "aiAgent", "assignConversation"] as const

type DestinationMode = (typeof destinationModes)[number]

const destinationModeLabelKey = {
  aiAgent: "decision.globalRouterDestinationTypes.aiAgent",
  assignConversation:
    "decision.globalRouterDestinationTypes.assignConversation",
  flow: "actions.sendFlow",
} as const

const destinationLabelKey = {
  aiAgent: "decision.globalRouterDestinationTypes.aiAgent",
  assignConversation: "fields.assignedId.label",
  flow: "decision.globalRouterDestinationTypes.flow",
} as const

const resultLabelKeyByValue = {
  choice: "decision.resultValues.choice",
  confidence: "decision.resultValues.confidence",
  probabilityTrue: "decision.outputNoul",
  score: "decision.resultValues.score",
  selectedProbability: "decision.resultValues.probability",
} as const

const isDestinationMode = (value: string): value is DestinationMode =>
  destinationModes.some((mode) => mode === value)

const destinationModeForType = (
  type: GlobalRouterDestination["type"] | undefined,
): DestinationMode => {
  if (type === "user" || type === "team") {
    return "assignConversation"
  }
  return type === "aiAgent" ? "aiAgent" : "flow"
}

const metadataValuesForDecision = (
  decision: DecisionProfileForm["decision"],
) => {
  if (decision.type === "choice") {
    return ["choice", "confidence", "selectedProbability"] as const
  }
  if (decision.type === "score") {
    return ["score", "confidence"] as const
  }
  return ["probabilityTrue"] as const
}

function AssignmentDestinationPicker({
  destination,
  name,
  options,
}: {
  destination: GlobalRouterDestination | undefined
  name: DestinationPath
  options: DestinationOptions | undefined
}) {
  const t = useTranslations()
  const form = useFormContext<DecisionProfileForm>()
  const [open, setOpen] = useState(false)
  const groups = [
    {
      items: options?.users ?? [],
      label: t("admins.title"),
      type: "user" as const,
    },
    {
      items: options?.teams ?? [],
      label: t("inboxTeams.title"),
      type: "team" as const,
    },
  ]
  const selectedItem = groups
    .find((group) => group.type === destination?.type)
    ?.items.find((item) => item.id === destination?.id)

  return (
    <Popover modal={true} onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-expanded={open}
            aria-label={t("fields.assignedId.label")}
            className={cn(
              "w-full justify-between",
              !selectedItem && "text-muted-foreground",
            )}
            role="combobox"
            variant="outline"
          >
            <span className="min-w-0 truncate">
              {selectedItem?.name ??
                t("decision.globalRouterChooseDestination")}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-[var(--anchor-width)] p-0">
        <Command>
          <CommandInput className="h-9" placeholder={t("actions.search")} />
          <CommandList>
            <CommandEmpty>{t("actions.noRecordFound")}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup heading={group.label} key={group.type}>
                {group.items.map((item) => {
                  const selected =
                    destination?.id === item.id &&
                    destination.type === group.type
                  return (
                    <CommandItem
                      key={item.id}
                      onSelect={() => {
                        form.setValue(
                          name as never,
                          { id: item.id, type: group.type } as never,
                          { shouldDirty: true, shouldValidate: true },
                        )
                        setOpen(false)
                      }}
                      value={item.name}
                    >
                      {item.name}
                      <Check
                        className={cn(
                          "ms-auto h-4 w-4",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function NewMetadataMappingPicker({
  customFieldTypes,
  customFields,
  label,
  onSelect,
}: {
  customFieldTypes: CustomFieldType[]
  customFields: Array<{ id: string; name: string; type: CustomFieldType }>
  label: string
  onSelect: (customFieldId: string) => void
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const invalidateCustomFields = useInvalidateCustomFields()
  const [open, setOpen] = useState(false)
  const availableFields = customFields.filter((field) =>
    customFieldTypes.includes(field.type),
  )
  const defaultType = customFieldTypes[0] ?? "shortText"

  return (
    <div className="space-y-2">
      <div className="flex items-center">
        <p className="flex flex-1 items-center gap-1 font-medium text-sm">
          {label}
          <span className="self-start font-normal text-xxs">
            {t("fields.optionalHint")}
          </span>
        </p>
        <CreateCustomFieldDialog
          defaultType={defaultType}
          folderId={null}
          onSuccess={invalidateCustomFields}
          triggerButton={
            <Button
              className="h-auto cursor-pointer p-0 text-[12px] text-destructive"
              type="button"
              variant="link"
            >
              {t("actions.add")}
            </Button>
          }
          workspaceId={workspaceId}
        />
      </div>
      <Popover modal={true} onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              aria-expanded={open}
              aria-label={label}
              className="w-full justify-between text-muted-foreground"
              role="combobox"
              variant="outline"
            >
              {t("actions.pleaseSelect")}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-[var(--anchor-width)] p-0">
          <Command>
            <CommandInput className="h-9" placeholder={t("actions.search")} />
            <CommandList>
              <CommandEmpty>{t("actions.noRecordFound")}</CommandEmpty>
              {availableFields.map((field) => (
                <CommandItem
                  key={field.id}
                  onSelect={() => {
                    onSelect(field.id)
                    setOpen(false)
                  }}
                  value={field.name}
                >
                  {field.name}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function DestinationPicker({
  name,
  options,
}: {
  name: DestinationPath
  options: DestinationOptions | undefined
}) {
  const t = useTranslations()
  const form = useFormContext<DecisionProfileForm>()
  const globalRouterConfig = useWatch({
    control: form.control,
    name: "globalRouterConfig",
  })
  const destination =
    name === "globalRouterConfig.fallback"
      ? globalRouterConfig?.fallback
      : globalRouterConfig?.routes?.[Number(name.split(".")[2])]?.destination
  const type = destination?.type
  const currentMode = destinationModeForType(type)
  const optionsByType = {
    aiAgent: options?.agents ?? [],
    flow: options?.flows ?? [],
  }
  const idError = form.getFieldState(
    `${name}.id` as never,
    form.formState,
  ).error

  useEffect(() => {
    if (destination?.id && !type) {
      form.setValue(`${name}.type` as never, "flow" as never, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [destination?.id, form, name, type])

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={`${name}.type` as never}
          render={() => (
            <div className="space-y-2">
              <p className="font-medium text-sm">{t("fields.type.label")}</p>
              <FormItem>
                <FormControl>
                  <Select
                    items={destinationModes.map((mode) => ({
                      label: t(destinationModeLabelKey[mode]),
                      value: mode,
                    }))}
                    onValueChange={(value) => {
                      if (
                        !(typeof value === "string" && isDestinationMode(value))
                      ) {
                        return
                      }
                      form.setValue(
                        name as never,
                        {
                          id: "",
                          type: value === "assignConversation" ? "user" : value,
                        } as never,
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }}
                    value={currentMode}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("fields.type.label")} />
                    </SelectTrigger>
                    <SelectContent>
                      {destinationModes.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {t(destinationModeLabelKey[mode])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            </div>
          )}
        />
        <div className="space-y-2">
          <p className="font-medium text-sm">
            {t(destinationLabelKey[currentMode])}
          </p>
          {currentMode === "assignConversation" ? (
            <AssignmentDestinationPicker
              destination={destination}
              name={name}
              options={options}
            />
          ) : (
            <ComboboxField<DecisionProfileForm>
              emptyText={t("actions.noRecordFound")}
              hideMessage
              name={`${name}.id` as never}
              options={optionsByType[currentMode].map((item) => ({
                label: item.name,
                value: item.id,
              }))}
              placeholder={t("decision.globalRouterChooseDestination")}
              popoverClassName="w-[var(--anchor-width)]"
              required
              searchPlaceholder={t("actions.search")}
            />
          )}
        </div>
      </div>
      {idError && (
        <p className="text-destructive text-sm" data-slot="form-message">
          {name === "globalRouterConfig.fallback"
            ? t("decision.globalRouterDestinationRequired")
            : t("decision.globalRouterRouteDestinationRequired")}
        </p>
      )}
    </div>
  )
}

export function GlobalRouterSettings({
  runtimeSupported,
}: {
  runtimeSupported: boolean
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const form = useFormContext<DecisionProfileForm>()
  const enabled = useWatch({
    control: form.control,
    name: "globalRouterEnabled",
  })
  const decision = useWatch({ control: form.control, name: "decision" })
  const globalRouterConfig = useWatch({
    control: form.control,
    name: "globalRouterConfig",
  })
  const routes = useFieldArray({
    control: form.control,
    name: "globalRouterConfig.routes" as never,
  })
  const { data } = useQuery(
    orpc.decisionProfilesAPI.listGlobalRouterDestinations.queryOptions({
      enabled: Boolean(enabled),
      input: { workspaceId },
    }),
  )
  const { data: customFields = [] } = useCustomFields(workspaceId)

  useEffect(() => {
    if (enabled && !form.getValues("globalRouterConfig")) {
      form.setValue(
        "globalRouterConfig",
        {
          fallback: { id: "", type: "flow" },
          metadataMappings: [],
          noul: { falseMaximum: 0.5, trueMinimum: 0.5 },
          routes: [],
          version: 1,
        },
        { shouldDirty: true, shouldValidate: true },
      )
    }
  }, [enabled, form])

  const choiceValues =
    decision.type === "choice"
      ? decision.options.map((option) => option.value).filter(Boolean)
      : []
  const _choiceValuesKey = choiceValues.join("\0")
  const routeValues = globalRouterConfig?.routes ?? []
  const metadataMappingValues = globalRouterConfig?.metadataMappings ?? []

  useEffect(() => {
    if (decision.type !== "choice") {
      return
    }
    const invalidIndices = routeValues
      .map((route, index) =>
        route.type === "choice" && !choiceValues.includes(route.value)
          ? index
          : null,
      )
      .filter((index): index is number => index !== null)
      .reverse()
    for (const index of invalidIndices) {
      routes.remove(index)
    }
  }, [decision.type, routeValues, routes, choiceValues.includes])

  const routeIndexForChoice = (value: string) =>
    routeValues.findIndex(
      (route) => route.type === "choice" && route.value === value,
    )
  const metadataValues = metadataValuesForDecision(decision)

  return (
    <section className="space-y-5 border-t pt-5">
      <SwitchField
        label={t("decision.globalRouter")}
        name="globalRouterEnabled"
      />
      {enabled && (
        <>
          <Alert variant={runtimeSupported ? "default" : "destructive"}>
            <AlertDescription>
              {t(
                runtimeSupported
                  ? "decision.globalRouterDescription"
                  : "decision.globalRouterRuntimeUnsupported",
              )}
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <h3 className="font-semibold">
              {t("decision.globalRouterDefaultDestination")}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t("decision.globalRouterFallbackDescription")}
            </p>
            <DestinationPicker
              name="globalRouterConfig.fallback"
              options={data}
            />
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">
              {t("decision.globalRouterRoutes")}
            </h3>
            {decision.type === "choice" && (
              <div className="divide-y rounded-md border">
                {choiceValues.map((value) => {
                  const index = routeIndexForChoice(value)
                  return (
                    <div
                      className="grid gap-3 p-3 sm:grid-cols-[minmax(10rem,0.6fr)_minmax(0,1.4fr)_auto] sm:items-center"
                      key={value}
                    >
                      <span className="min-w-0 truncate font-medium text-sm">
                        {value}
                      </span>
                      {index >= 0 ? (
                        <DestinationPicker
                          name={`globalRouterConfig.routes.${index}.destination`}
                          options={data}
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {t("decision.globalRouterUsesFallback")}
                        </span>
                      )}
                      {index >= 0 ? (
                        <Button
                          aria-label={t("actions.delete")}
                          onClick={() => routes.remove(index)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2Icon />
                        </Button>
                      ) : (
                        <Button
                          onClick={() =>
                            routes.append({
                              destination: { id: "", type: "flow" },
                              type: "choice",
                              value,
                            } as never)
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {t("actions.add")}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {decision.type === "score" && (
              <div className="space-y-3">
                {routes.fields.map((route, index) => (
                  <div
                    className="space-y-3 rounded-md border p-3"
                    key={route.id}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InputNumberField<DecisionProfileForm>
                        label={t("fields.from.label")}
                        max={decision.levels.length}
                        min={1}
                        name={
                          `globalRouterConfig.routes.${index}.from` as never
                        }
                      />
                      <InputNumberField<DecisionProfileForm>
                        label={t("fields.to.label")}
                        max={decision.levels.length}
                        min={1}
                        name={`globalRouterConfig.routes.${index}.to` as never}
                      />
                    </div>
                    <DestinationPicker
                      name={`globalRouterConfig.routes.${index}.destination`}
                      options={data}
                    />
                    <Button
                      onClick={() => routes.remove(index)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2Icon />
                      {t("actions.delete")}
                    </Button>
                  </div>
                ))}
                <Button
                  onClick={() =>
                    routes.append({
                      destination: { id: "", type: "flow" },
                      from: 1,
                      to: 1,
                      type: "score",
                    } as never)
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("actions.addMore")}
                </Button>
              </div>
            )}

            {decision.type === "noul" && (
              <div className="space-y-3">
                {[true, false].map((value) => {
                  const index = routeValues.findIndex(
                    (route) => route.type === "noul" && route.value === value,
                  )
                  return (
                    <div
                      className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
                      key={String(value)}
                    >
                      <span className="font-medium text-sm">
                        {value
                          ? t("fields.boolean.true")
                          : t("fields.boolean.false")}
                      </span>
                      {index >= 0 ? (
                        <DestinationPicker
                          name={`globalRouterConfig.routes.${index}.destination`}
                          options={data}
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {t("decision.globalRouterUsesFallback")}
                        </span>
                      )}
                      {index >= 0 ? (
                        <Button
                          aria-label={t("actions.delete")}
                          onClick={() => routes.remove(index)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2Icon />
                        </Button>
                      ) : (
                        <Button
                          onClick={() =>
                            routes.append({
                              destination: { id: "", type: "flow" },
                              type: "noul",
                              value,
                            } as never)
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {t("actions.add")}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-4 border-t pt-5">
            <h3 className="font-semibold">{t("decision.advanced")}</h3>
            {decision.type === "noul" && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <InputNumberField<DecisionProfileForm>
                    label={t("decision.globalRouterTrueMinimum")}
                    max={1}
                    min={0}
                    name="globalRouterConfig.noul.trueMinimum"
                    step={0.01}
                  />
                  <InputNumberField<DecisionProfileForm>
                    label={t("decision.globalRouterFalseMaximum")}
                    max={1}
                    min={0}
                    name="globalRouterConfig.noul.falseMaximum"
                    step={0.01}
                  />
                </div>
                <p className="text-muted-foreground text-sm">
                  {t("decision.globalRouterNoulDescription")}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                {t("decision.globalRouterMetadataMappings")}
              </p>
              {metadataValues.map((value) => {
                const index = metadataMappingValues.findIndex(
                  (mapping) => mapping.value === value,
                )
                const customFieldTypes: CustomFieldType[] =
                  value === "choice" ? ["shortText", "longText"] : ["number"]
                return (
                  <div className="rounded-md border p-3" key={value}>
                    {index >= 0 ? (
                      <CustomFieldSelect
                        allowCreate
                        clearable
                        createDefaultType={
                          value === "choice" ? "shortText" : "number"
                        }
                        customFieldTypes={customFieldTypes}
                        label={t(resultLabelKeyByValue[value])}
                        name={`globalRouterConfig.metadataMappings.${index}.customFieldId`}
                        onValueChange={(customFieldId) => {
                          if (!customFieldId) {
                            form.setValue(
                              "globalRouterConfig.metadataMappings",
                              metadataMappingValues.filter(
                                (_, mappingIndex) => mappingIndex !== index,
                              ),
                              { shouldDirty: true, shouldValidate: true },
                            )
                            return
                          }
                          const customFieldType = customFields.find(
                            (field) => field.id === customFieldId,
                          )?.type
                          if (
                            customFieldType === "shortText" ||
                            customFieldType === "longText" ||
                            customFieldType === "number"
                          ) {
                            form.setValue(
                              `globalRouterConfig.metadataMappings.${index}.customFieldType` as never,
                              customFieldType as never,
                              { shouldDirty: true, shouldValidate: true },
                            )
                          }
                        }}
                      />
                    ) : (
                      <NewMetadataMappingPicker
                        customFields={customFields}
                        customFieldTypes={customFieldTypes}
                        label={t(resultLabelKeyByValue[value])}
                        onSelect={(customFieldId) => {
                          const customFieldType = customFields.find(
                            (field) => field.id === customFieldId,
                          )?.type
                          if (
                            (value === "choice" &&
                              (customFieldType === "shortText" ||
                                customFieldType === "longText")) ||
                            (value !== "choice" && customFieldType === "number")
                          ) {
                            form.setValue(
                              "globalRouterConfig.metadataMappings",
                              [
                                ...metadataMappingValues,
                                { customFieldId, customFieldType, value },
                              ] as never,
                              { shouldDirty: true, shouldValidate: true },
                            )
                          }
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
