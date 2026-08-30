"use client"

import {
  fileTypes,
  type MinigameAppearance,
  type MinigamePrizeSettings,
  type MinigameType,
} from "@chatbotx.io/database/partials"
import { ColorPickerField } from "@chatbotx.io/ui/components/form/color-picker-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { CopyIcon, Loader2Icon, PencilIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { createMinigameAction } from "./actions/create-minigame.action"
import { updateMinigameAction } from "./actions/update-minigame.action"
import { DateTimeRangeField } from "./components/date-time-range-field"
import { NonWinningMessageEditDialog } from "./components/non-winning-message-edit-dialog"
import { MinigamePreview } from "./components/preview/minigame-preview"
import { PrizeListEditor } from "./components/prize-list-editor"
import { WinningMessageEditDialog } from "./components/winning-message-edit-dialog"
import {
  getDefaultMinigameAppearance,
  getDefaultMinigameGeneralSettings,
  getDefaultMinigameNonWinningMessageSettings,
  getDefaultMinigamePlayerSettings,
  getDefaultMinigamePrizeSettings,
  getDefaultMinigameWinningMessageSettings,
} from "./constants"
import { createMinigameRequest, updateMinigameRequest } from "./schema/action"
import type { MinigameResource } from "./schema/resource"

type MinigameFormProps =
  | { mode: "create"; type: MinigameType; workspaceId: string }
  | {
      mode: "edit"
      minigame: MinigameResource
      workspaceId: string
      publicUrl: string
    }

// `winMessage` was added to `MinigamePrizeItem` after some minigames were
// already saved, so their persisted `prizeSettings` JSON may be missing it.
// Passing `undefined` as a form default makes the bound Switch/RadioGroup
// start uncontrolled, then flip to controlled the moment RHF resolves a
// value — backfill so every prize always has one. `quantity` is left as-is:
// `undefined` (unlimited) is a real, permanent value, not a missing one.
function normalizeMinigamePrizeSettings(
  prizeSettings: MinigamePrizeSettings,
): MinigamePrizeSettings {
  return {
    ...prizeSettings,
    prizes: prizeSettings.prizes.map((prize) => ({
      ...prize,
      winMessage: prize.winMessage ?? {
        enabled: false,
        mode: "text",
        text: "",
      },
    })),
  }
}

function PublicUrlSection({ publicUrl }: { publicUrl: string }) {
  const t = useTranslations()
  const [, copy] = useCopyToClipboard()

  const handleCopy = () => {
    copy(publicUrl)
      .then(() => {
        toast.success(t("messages.copiedToClipboard"))
      })
      .catch(() => {
        toast.error(t("messages.copyFailed"))
      })
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <p className="flex-none font-medium text-sm">
          {t("minigames.publicUrl.label")}
        </p>
        <Input className="min-w-0 max-w-md" readOnly value={publicUrl} />
        <Button
          aria-label={t("actions.copyUrl")}
          onClick={handleCopy}
          size="icon"
          type="button"
          variant="secondary"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t("minigames.publicUrl.hint")}
      </p>
    </div>
  )
}

export function MinigameForm(props: MinigameFormProps) {
  const t = useTranslations()
  const router = useRouter()
  const tagOptions = useTagSelectOptions()
  const [winningMessageDialogOpen, setWinningMessageDialogOpen] =
    useState(false)
  const [nonWinningMessageDialogOpen, setNonWinningMessageDialogOpen] =
    useState(false)

  const isEdit = props.mode === "edit"
  const workspaceId = props.workspaceId
  const type = isEdit ? props.minigame.type : props.type

  // Baseline snapshot captured once at mount — NOT the live form state — so
  // `MinigameService.update` can tell "admin didn't touch this prize's
  // quantity" apart from "the form's stale value now differs from a
  // quantity decremented by concurrent plays" and avoid clobbering the
  // latter.
  const [originalPrizeQuantities] = useState<
    Record<string, number | undefined>
  >(() =>
    isEdit
      ? Object.fromEntries(
          props.minigame.prizeSettings.prizes.map((prize) => [
            prize.id,
            prize.quantity,
          ]),
        )
      : {},
  )

  const defaultValues = isEdit
    ? {
        type: props.minigame.type,
        generalSettings: props.minigame.generalSettings,
        appearance: props.minigame.appearance,
        playerSettings: props.minigame.playerSettings,
        prizeSettings: normalizeMinigamePrizeSettings(
          props.minigame.prizeSettings,
        ),
        winningMessageSettings: props.minigame.winningMessageSettings,
        nonWinningMessageSettings: props.minigame.nonWinningMessageSettings,
      }
    : {
        type: props.type,
        generalSettings: getDefaultMinigameGeneralSettings(),
        appearance: getDefaultMinigameAppearance(props.type),
        playerSettings: getDefaultMinigamePlayerSettings(),
        prizeSettings: getDefaultMinigamePrizeSettings(),
        winningMessageSettings: getDefaultMinigameWinningMessageSettings(),
        nonWinningMessageSettings:
          getDefaultMinigameNonWinningMessageSettings(),
      }

  const { form, action } = useHookFormAction(
    isEdit
      ? updateMinigameAction.bind(
          null,
          workspaceId,
          props.minigame.id,
          originalPrizeQuantities,
        )
      : createMinigameAction.bind(null, workspaceId),
    zodResolver(isEdit ? updateMinigameRequest : createMinigameRequest),
    {
      actionProps: {
        onSuccess: ({ data: result }) => {
          if (isEdit) {
            toast.success(
              t("messages.updatedSuccess", {
                feature: t("fields.minigame.label"),
              }),
            )
            router.refresh()
            return
          }

          toast.success(
            t("messages.createdSuccess", {
              feature: t("fields.minigame.label"),
            }),
          )
          if (result && "id" in result && result.id) {
            router.push(`/space/${workspaceId}/minigames/${result.id}/edit`)
          } else {
            router.push(`/space/${workspaceId}/minigames`)
          }
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError)
          }
        },
      },
      formProps: {
        mode: "onChange",
        defaultValues,
      },
    },
  )

  const generalSettings = useWatch({
    control: form.control,
    name: "generalSettings",
  })
  const appearance = useWatch({ control: form.control, name: "appearance" })
  const prizeSettings = useWatch({
    control: form.control,
    name: "prizeSettings",
  })
  const resetPolicy = useWatch({
    control: form.control,
    name: "playerSettings.resetPolicy",
  })
  const winningMessageSettings = useWatch({
    control: form.control,
    name: "winningMessageSettings",
  })
  const nonWinningMessageSettings = useWatch({
    control: form.control,
    name: "nonWinningMessageSettings",
  })

  const handleResetPolicyChange = (value: "never" | "everyNDays") => {
    const drawsPerPerson = form.getValues("playerSettings.drawsPerPerson") ?? 1
    form.setValue(
      "playerSettings",
      value === "never"
        ? { drawsPerPerson, resetPolicy: "never" }
        : { drawsPerPerson, resetPolicy: "everyNDays", resetIntervalDays: 1 },
      { shouldDirty: true, shouldValidate: true },
    )
  }

  // `useWatch` returns the RHF-input shape (defaulted fields optional); the
  // preview needs the fully-resolved DB shape, so fill in the same fallbacks
  // the Zod schema itself defaults to. Can't just call
  // `minigamePrizeSettingsSchema.parse(prizeSettings ?? {})` here instead —
  // `minigamePrizeItemSchema`'s `name`/`winRate`/`id` and the win/lose
  // message discriminated unions are required with no `.default()` (that's
  // real validation for the persisted data, not something to weaken for
  // preview's sake), so `.parse()` throws on the partial shape mid-edit
  // (e.g. a newly appended prize row with no name yet).
  const appearanceForPreview: MinigameAppearance = {
    backgroundColor: appearance?.backgroundColor ?? "#F5A623",
    machineColor: appearance?.machineColor ?? "#4A90D9",
    decorativeColor: appearance?.decorativeColor ?? "#FFFFFF",
    ruleTextColor: appearance?.ruleTextColor ?? "#000000",
    backgroundImage: {
      mode: appearance?.backgroundImage?.mode ?? "file",
      url: appearance?.backgroundImage?.url ?? "",
    },
    prizeDescriptionImage: {
      mode: appearance?.prizeDescriptionImage?.mode ?? "file",
      url: appearance?.prizeDescriptionImage?.url ?? "",
    },
    startButtonImage: {
      mode: appearance?.startButtonImage?.mode ?? "file",
      url: appearance?.startButtonImage?.url ?? "",
    },
  }
  const prizeSettingsForPreview: MinigamePrizeSettings = {
    prizes: (prizeSettings?.prizes ?? []).map((prize) => ({
      id: prize.id,
      name: prize.name ?? "",
      icon: {
        mode: prize.icon?.mode ?? "file",
        url: prize.icon?.url ?? "",
      },
      winRate: prize.winRate ?? 0,
      quantity: prize.quantity,
      winMessage:
        prize.winMessage?.mode === "flow"
          ? {
              enabled: prize.winMessage.enabled ?? false,
              mode: "flow" as const,
              flowId: prize.winMessage.flowId ?? null,
            }
          : {
              enabled: prize.winMessage?.enabled ?? false,
              mode: "text" as const,
              text: prize.winMessage?.text ?? "",
            },
    })),
    nonWinning: {
      title: prizeSettings?.nonWinning?.title ?? "",
      loseRate: prizeSettings?.nonWinning?.loseRate ?? 0,
      loseImage: {
        mode: prizeSettings?.nonWinning?.loseImage?.mode ?? "file",
        url: prizeSettings?.nonWinning?.loseImage?.url ?? "",
      },
      loseMessage:
        prizeSettings?.nonWinning?.loseMessage?.mode === "flow"
          ? {
              enabled: prizeSettings.nonWinning.loseMessage.enabled ?? false,
              mode: "flow" as const,
              flowId: prizeSettings.nonWinning.loseMessage.flowId ?? null,
            }
          : {
              enabled: prizeSettings?.nonWinning?.loseMessage?.enabled ?? false,
              mode: "text" as const,
              text: prizeSettings?.nonWinning?.loseMessage?.text ?? "",
            },
    },
  }

  const onSubmit = form.handleSubmit((values) => action.execute(values))

  return (
    <Form {...form}>
      <div className="flex min-h-screen flex-col bg-muted/20">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-3">
          <h1 className="font-semibold text-lg">
            {isEdit
              ? t("messages.editFeature", {
                  feature: t("fields.minigame.label"),
                })
              : t("actions.createFeature", {
                  feature: t("fields.minigame.label"),
                })}
          </h1>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push(`/space/${workspaceId}/minigames`)}
              type="button"
              variant="ghost"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={action.isPending}
              onClick={onSubmit}
              type="button"
            >
              {action.isPending && <Loader2Icon className="animate-spin" />}
              {t("actions.save")}
            </Button>
          </div>
        </div>

        <form className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px] gap-6 px-6 py-8">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("minigames.form.generalSettingsTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InputField
                  label={t("fields.name.label")}
                  name="generalSettings.name"
                  required
                />
                <DateTimeRangeField
                  fromName="generalSettings.playedAtFrom"
                  label={t("minigames.generalSettings.playedAt")}
                  required
                  toName="generalSettings.playedAtTo"
                />
                <TextareaField
                  label={t("minigames.generalSettings.rulesDescription")}
                  name="generalSettings.rulesDescription"
                />
                <MultiSelectField
                  label={t("minigames.generalSettings.openerTags")}
                  name="generalSettings.openerTagIds"
                  options={tagOptions}
                  placeholder={t("actions.pleaseSelect")}
                />
                <MultiSelectField
                  label={t("minigames.generalSettings.playerTags")}
                  name="generalSettings.playerTagIds"
                  options={tagOptions}
                  placeholder={t("actions.pleaseSelect")}
                />
                {/* Referral feature temporarily hidden — `newFriendTagIds`
                    is not yet applied by any service (no referral link
                    param, no referrerContactId population). Restore this
                    MultiSelectField (generalSettings.newFriendTagIds) once
                    the backend wiring exists, so admins don't configure tags
                    that silently never get applied. */}
                {/* Share feature temporarily hidden — restore SwitchField
                    (generalSettings.shareEnabled) + TextareaField
                    (generalSettings.shareMessage) here to re-enable. */}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("minigames.form.appearanceTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
                  <ColorPickerField
                    label={t("minigames.appearance.backgroundColor")}
                    name="appearance.backgroundColor"
                  />
                  <ColorPickerField
                    label={t("minigames.appearance.machineColor")}
                    name="appearance.machineColor"
                  />
                  <ColorPickerField
                    label={t("minigames.appearance.decorativeColor")}
                    name="appearance.decorativeColor"
                  />
                  <ColorPickerField
                    label={t("minigames.appearance.ruleTextColor")}
                    name="appearance.ruleTextColor"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("minigames.appearance.backgroundImage")}</Label>
                  <Card>
                    <CardContent>
                      <DirectUploadOrInsertLink
                        fileType={fileTypes.enum.image}
                        parentName="appearance.backgroundImage"
                        uploadPath={`public/space/${workspaceId}/minigames/appearance`}
                        useMediaLibrary
                      />
                    </CardContent>
                  </Card>
                  <p className="text-muted-foreground text-sm">
                    {t("minigames.appearance.backgroundImageDescription")}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>
                    {t("minigames.appearance.prizeDescriptionImage")}
                  </Label>
                  <Card>
                    <CardContent>
                      <DirectUploadOrInsertLink
                        fileType={fileTypes.enum.image}
                        parentName="appearance.prizeDescriptionImage"
                        uploadPath={`public/space/${workspaceId}/minigames/appearance`}
                        useMediaLibrary
                      />
                    </CardContent>
                  </Card>
                  <p className="text-muted-foreground text-sm">
                    {t("minigames.appearance.prizeDescriptionImageDescription")}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("minigames.appearance.startButtonImage")}</Label>
                  <Card>
                    <CardContent>
                      <DirectUploadOrInsertLink
                        fileType={fileTypes.enum.image}
                        parentName="appearance.startButtonImage"
                        uploadPath={`public/space/${workspaceId}/minigames/appearance`}
                        useMediaLibrary
                      />
                    </CardContent>
                  </Card>
                  <p className="text-muted-foreground text-sm">
                    {t("minigames.appearance.startButtonImageDescription")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("minigames.form.playerSettingsTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InputNumberField
                  label={t("minigames.playerSettings.drawsPerPerson")}
                  min={1}
                  name="playerSettings.drawsPerPerson"
                />

                <div className="flex flex-col gap-3">
                  <Label>
                    {t("minigames.playerSettings.resetPolicyLabel")}
                  </Label>
                  <RadioGroup
                    className="flex flex-col gap-3"
                    onValueChange={(value) =>
                      handleResetPolicyChange(value as "never" | "everyNDays")
                    }
                    value={resetPolicy}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="resetPolicyNever" value="never" />
                      <Label htmlFor="resetPolicyNever">
                        {t("minigames.playerSettings.resetNever")}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem
                        id="resetPolicyEveryNDays"
                        value="everyNDays"
                      />
                      <Label htmlFor="resetPolicyEveryNDays">
                        {t("minigames.playerSettings.resetEveryNDays")}
                      </Label>
                      {resetPolicy === "everyNDays" && (
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <InputNumberField
                              min={1}
                              name="playerSettings.resetIntervalDays"
                            />
                          </div>
                          <span className="text-muted-foreground text-sm">
                            {t(
                              "minigames.playerSettings.resetIntervalDaysSuffix",
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </RadioGroup>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("minigames.form.prizeSettingsTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <PrizeListEditor workspaceId={workspaceId} />
              </CardContent>
            </Card>

            <MessagePreviewCard
              description={winningMessageSettings?.description}
              onEdit={() => setWinningMessageDialogOpen(true)}
              title={t("minigames.winningMessageDialog.title")}
            />
            <MessagePreviewCard
              description={nonWinningMessageSettings?.description}
              onEdit={() => setNonWinningMessageDialogOpen(true)}
              title={t("minigames.nonWinningMessageDialog.title")}
            />
          </div>

          <div className="sticky top-19 flex h-fit justify-center self-start">
            <MinigamePreview
              appearance={appearanceForPreview}
              name={generalSettings?.name ?? ""}
              prizeSettings={prizeSettingsForPreview}
              shareEnabled={false}
              type={type}
            />
          </div>
        </form>

        {isEdit && (
          <div className="sticky bottom-0 z-10 mt-auto border-t bg-background px-6 py-3">
            <PublicUrlSection publicUrl={props.publicUrl} />
          </div>
        )}
      </div>

      <WinningMessageEditDialog
        onOpenChange={setWinningMessageDialogOpen}
        open={winningMessageDialogOpen}
      />
      <NonWinningMessageEditDialog
        onOpenChange={setNonWinningMessageDialogOpen}
        open={nonWinningMessageDialogOpen}
      />
    </Form>
  )
}

function MessagePreviewCard({
  title,
  description,
  onEdit,
}: {
  title: string
  description?: string
  onEdit: () => void
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button onClick={onEdit} size="icon" type="button" variant="ghost">
          <PencilIcon className="size-4" />
        </Button>
      </CardHeader>
      {description ? (
        <CardContent>
          <p className="text-muted-foreground text-sm">{description}</p>
        </CardContent>
      ) : null}
    </Card>
  )
}
