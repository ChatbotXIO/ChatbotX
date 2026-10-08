import {
  isExternalAttributionAction,
  isSendableConversionAction,
} from "@chatbotx.io/utils/google-click"
import type { GoogleAdsConversionActionResource } from "../schema/integration"

type ConversionActionOption = {
  value: string
  label: string
  disabled?: boolean
}

type BuildOptionsInput = {
  actions: GoogleAdsConversionActionResource[]
  selectedId: string | undefined
  /** Label for a selected id that is not in the synced list. */
  unavailableLabel: (id: string) => string
  /** Label for an external-attribution action, which is listed but not selectable. */
  externalLabel: (name: string) => string
}

type ConversionActionOptions = {
  options: ConversionActionOption[]
  /** True when the stored id is missing from the list, is not ENABLED or uses external attribution. */
  isSelectedUnavailable: boolean
  hasSelectableAction: boolean
}

/**
 * Options for the conversion-action select: ENABLED actions are selectable,
 * the rest are listed disabled, and an already-stored id that is no longer in
 * the list stays visible (disabled) so a saved step is never silently blanked.
 */
export const buildConversionActionOptions = ({
  actions,
  selectedId,
  unavailableLabel,
  externalLabel,
}: BuildOptionsInput): ConversionActionOptions => {
  const options: ConversionActionOption[] = actions.map((action) => ({
    value: action.id,
    label: isExternalAttributionAction(action)
      ? externalLabel(action.name)
      : action.name,
    disabled: !isSendableConversionAction(action),
  }))
  const selectedAction = selectedId
    ? actions.find((action) => action.id === selectedId)
    : undefined
  const isMissing = Boolean(selectedId) && !selectedAction
  if (selectedId && isMissing) {
    options.unshift({
      value: selectedId,
      label: unavailableLabel(selectedId),
      disabled: true,
    })
  }
  return {
    options,
    isSelectedUnavailable:
      isMissing ||
      (selectedAction !== undefined &&
        !isSendableConversionAction(selectedAction)),
    hasSelectableAction: options.some((option) => !option.disabled),
  }
}
