"use client"

import { fileTypes } from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
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
import { useTranslations } from "next-intl"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"

type PrizeItemEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
} & ({ variant: "prize"; index: number } | { variant: "nonWinning" })

export function PrizeItemEditDialog(props: PrizeItemEditDialogProps) {
  const { open, onOpenChange, workspaceId } = props
  const t = useTranslations()

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
