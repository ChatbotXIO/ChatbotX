"use client"

import type { ConnectSessionTarget } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { formatCustomerId } from "@chatbotx.io/utils/google-click"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { PickerRow } from "./account-picker-views"

const DIGITS_ONLY = /^\d+$/

const targetNoteKey = (target: ConnectSessionTarget) => {
  if (target.alreadyConnected === "this_workspace") {
    return "googleAds.picker.alreadyThisWorkspace"
  }
  if (target.alreadyConnected === "other_workspace") {
    return "googleAds.picker.alreadyOtherWorkspace"
  }
  return target.selectable ? null : ("googleAds.picker.notSelectable" as const)
}

type TargetListProps = {
  targets: ConnectSessionTarget[]
  selectedId: string | null
  isDisabled: boolean
  onSelect: (id: string) => void
}

/** Radio list of the Google Ads accounts the signed-in Google user can reach. */
export const TargetList = ({
  targets,
  selectedId,
  isDisabled,
  onSelect,
}: TargetListProps) => {
  const t = useTranslations()
  return (
    <fieldset className="flex w-full min-w-0 flex-col divide-y rounded-md border">
      <legend className="sr-only">{t("googleAds.picker.legend")}</legend>
      {targets.map((target) => {
        const noteKey = targetNoteKey(target)
        return (
          <label
            className="flex cursor-pointer items-start gap-3 p-3 has-disabled:cursor-not-allowed has-checked:bg-accent/50 has-disabled:opacity-60 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
            key={target.id}
          >
            <input
              checked={selectedId === target.id}
              className="mt-1 accent-primary"
              disabled={!target.selectable || isDisabled}
              name="google-ads-account"
              onChange={() => onSelect(target.id)}
              type="radio"
              value={target.id}
            />
            <span className="flex min-w-0 flex-col">
              <span className="wrap-break-word font-medium">{target.name}</span>
              {DIGITS_ONLY.test(target.id) ? (
                <span className="font-mono text-muted-foreground text-xs">
                  {formatCustomerId(target.id)}
                </span>
              ) : null}
              {noteKey ? (
                <span className="text-muted-foreground text-xs">
                  {t(noteKey)}
                </span>
              ) : null}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

type AwaitingSelectionViewProps = Omit<TargetListProps, "isDisabled"> & {
  isPicking: boolean
  cancelButton: ReactNode
  cancelError: ReactNode
  onConnect: () => void
}

/** Pick which Google Ads account receives the conversions. */
export const AwaitingSelectionView = ({
  targets,
  selectedId,
  isPicking,
  onSelect,
  onConnect,
  cancelButton,
  cancelError,
}: AwaitingSelectionViewProps) => {
  const t = useTranslations()
  const hasSelectable = targets.some((target) => target.selectable)
  return (
    <PickerRow>
      {targets.length === 0 ? (
        <p className="text-muted-foreground">
          {t("googleAds.picker.noTargets")}
        </p>
      ) : (
        <TargetList
          isDisabled={isPicking}
          onSelect={onSelect}
          selectedId={selectedId}
          targets={targets}
        />
      )}
      {cancelError}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!(selectedId && hasSelectable) || isPicking}
          onClick={onConnect}
          size="sm"
          type="button"
        >
          {isPicking ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : null}
          {t("googleAds.picker.connectSelected")}
        </Button>
        {cancelButton}
      </div>
    </PickerRow>
  )
}
