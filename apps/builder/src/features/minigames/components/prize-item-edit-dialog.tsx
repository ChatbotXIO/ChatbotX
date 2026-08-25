"use client"

import {
  fileTypes,
  type MinigameLoseMessage,
  type MinigamePrizeWinMessage,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"

type PrizeItemEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
} & ({ variant: "prize"; index: number } | { variant: "nonWinning" })

export function PrizeItemEditDialog(props: PrizeItemEditDialogProps) {
  const { open, onOpenChange, workspaceId } = props
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const flowOptions = useFlowSelectOptions()

  const loseMessage = useWatch({
    control,
    name: "prizeSettings.nonWinning.loseMessage",
  }) as MinigameLoseMessage | undefined

  const winMessageFieldName =
    props.variant === "prize"
      ? (`prizeSettings.prizes.${props.index}.winMessage` as const)
      : undefined
  const winMessage = useWatch({
    control,
    name: winMessageFieldName ?? "prizeSettings.nonWinning.loseMessage",
  }) as MinigamePrizeWinMessage | undefined

  // The lose/win message is a discriminated union on `mode`, so switching
  // modes must replace the whole object (not just `.mode`) to keep the union
  // valid — a plain field-bound radio/select would otherwise leave stale
  // sibling keys (e.g. `text`) on the `flow` branch.
  const handleModeChange = (mode: MinigameLoseMessage["mode"]) => {
    if (mode === loseMessage?.mode) {
      return
    }
    const enabled = loseMessage?.enabled ?? false
    setValue(
      "prizeSettings.nonWinning.loseMessage",
      mode === "text"
        ? { enabled, mode: "text" as const, text: "" }
        : { enabled, mode: "flow" as const, flowId: null },
      { shouldDirty: true, shouldValidate: true },
    )
  }

  const handleWinMessageModeChange = (
    mode: MinigamePrizeWinMessage["mode"],
  ) => {
    if (!winMessageFieldName || mode === winMessage?.mode) {
      return
    }
    const enabled = winMessage?.enabled ?? false
    setValue(
      winMessageFieldName,
      mode === "text"
        ? { enabled, mode: "text" as const, text: "" }
        : { enabled, mode: "flow" as const, flowId: null },
      { shouldDirty: true, shouldValidate: true },
    )
  }

  const nameFieldName =
    props.variant === "prize"
      ? (`prizeSettings.prizes.${props.index}.name` as const)
      : "prizeSettings.nonWinning.title"
  const imageFieldName =
    props.variant === "prize"
      ? (`prizeSettings.prizes.${props.index}.icon` as const)
      : "prizeSettings.nonWinning.loseImage"
  const quantityFieldName =
    props.variant === "prize"
      ? (`prizeSettings.prizes.${props.index}.quantity` as const)
      : undefined

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {props.variant === "prize"
              ? t("minigames.prizeItemDialog.prizeTitle")
              : t("minigames.prizeItemDialog.nonWinningTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <InputField
            label={
              props.variant === "prize"
                ? t("minigames.prizeItemDialog.prizeNameLabel")
                : t("minigames.prizeItemDialog.nonWinningTitleLabel")
            }
            name={nameFieldName}
            required
          />
          <div className="flex flex-col gap-1.5">
            <Label>{t("fields.image.label")}</Label>
            <Card>
              <CardContent>
                <DirectUploadOrInsertLink
                  fileType={fileTypes.enum.image}
                  parentName={imageFieldName}
                  uploadPath={`public/space/${workspaceId}/minigames/prizes`}
                  useMediaLibrary
                />
              </CardContent>
            </Card>
            {props.variant === "nonWinning" && (
              <p className="text-muted-foreground text-sm">
                {t("minigames.prizeItemDialog.loseImageDescription")}
              </p>
            )}
          </div>

          {props.variant === "prize" && quantityFieldName && (
            <InputNumberField
              description={t("minigames.prizeItemDialog.quantityDescription")}
              label={t("minigames.prizeItemDialog.quantityLabel")}
              min={0}
              name={quantityFieldName}
            />
          )}

          {props.variant === "prize" && winMessageFieldName && (
            <div className="flex flex-col gap-4 border-t pt-4">
              <SwitchField
                label={t("minigames.prizeItemDialog.sendWinMessage")}
                name={`${winMessageFieldName}.enabled`}
              />

              {winMessage?.enabled && (
                <div className="flex flex-col gap-4">
                  <div>
                    <Label>{t("minigames.prizeItemDialog.messageMode")}</Label>
                    <RadioGroup
                      className="mt-2 flex flex-row gap-4"
                      onValueChange={(value) =>
                        handleWinMessageModeChange(
                          value as MinigamePrizeWinMessage["mode"],
                        )
                      }
                      value={winMessage?.mode}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id="winMessageModeText" value="text" />
                        <Label htmlFor="winMessageModeText">
                          {t("minigames.prizeItemDialog.messageModeText")}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id="winMessageModeFlow" value="flow" />
                        <Label htmlFor="winMessageModeFlow">
                          {t("minigames.prizeItemDialog.messageModeFlow")}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {winMessage?.mode === "text" && (
                    <TextareaField
                      label={t("minigames.prizeItemDialog.messageText")}
                      name={`${winMessageFieldName}.text`}
                    />
                  )}

                  {winMessage?.mode === "flow" && (
                    <ComboboxField
                      emptyText={t("actions.noRecordFound")}
                      label={t("fields.flowId.label")}
                      name={`${winMessageFieldName}.flowId`}
                      options={flowOptions}
                      placeholder={t("actions.pleaseSelect")}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {props.variant === "nonWinning" && (
            <div className="flex flex-col gap-4 border-t pt-4">
              <SwitchField
                label={t("minigames.prizeItemDialog.sendMessage")}
                name="prizeSettings.nonWinning.loseMessage.enabled"
              />

              {loseMessage?.enabled && (
                <div className="flex flex-col gap-4">
                  <div>
                    <Label>{t("minigames.prizeItemDialog.messageMode")}</Label>
                    <RadioGroup
                      className="mt-2 flex flex-row gap-4"
                      onValueChange={(value) =>
                        handleModeChange(value as MinigameLoseMessage["mode"])
                      }
                      value={loseMessage?.mode}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id="loseMessageModeText" value="text" />
                        <Label htmlFor="loseMessageModeText">
                          {t("minigames.prizeItemDialog.messageModeText")}
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem id="loseMessageModeFlow" value="flow" />
                        <Label htmlFor="loseMessageModeFlow">
                          {t("minigames.prizeItemDialog.messageModeFlow")}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {loseMessage?.mode === "text" && (
                    <TextareaField
                      label={t("minigames.prizeItemDialog.messageText")}
                      name="prizeSettings.nonWinning.loseMessage.text"
                    />
                  )}

                  {loseMessage?.mode === "flow" && (
                    <ComboboxField
                      emptyText={t("actions.noRecordFound")}
                      label={t("fields.flowId.label")}
                      name="prizeSettings.nonWinning.loseMessage.flowId"
                      options={flowOptions}
                      placeholder={t("actions.pleaseSelect")}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="ghost">
                {t("actions.cancel")}
              </Button>
            }
          />
          <DialogClose
            render={<Button type="button">{t("actions.save")}</Button>}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
