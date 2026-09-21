"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import type { SingleSelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import {
  getFlowNodesOptions,
  useFlowSelectOptions,
  useFlows,
} from "@/features/flows/provider/flow-hook"
import { useWorkspaceId } from "@/hooks/routing"

const BROWSER_SIZES = [40, 70, 100]
const DEFAULT_BROWSER_SIZE = 100

/**
 * The actions a Marketing Messages button or quick reply may perform.
 *
 * Exported separately from the component so the option set can be asserted as
 * data: `SelectField` renders into a portal that only mounts when opened.
 *
 * There is deliberately no `performAction` — "perform actions" is expressed by
 * pointing `startExternalNode` at an existing Perform Actions node — and no
 * `startAnotherNode`, which has no meaning without a canvas.
 */
export function buttonActionOptions({
  allowWebUrl,
  t,
}: {
  /** Quick replies pass false: Meta has no URL quick reply. */
  allowWebUrl: boolean
  t: (key: string) => string
}): SingleSelectOption[] {
  return [
    ...(allowWebUrl
      ? [{ value: "openWebsite", label: t("flows.actions.openWebsite") }]
      : []),
    {
      value: "startExternalFlow",
      label: t("flows.actions.startExternalFlow"),
    },
    {
      value: "startExternalNode",
      label: t("flows.actions.startExternalNode"),
    },
  ]
}

/**
 * Canvas-free by construction: unlike the flow builder's
 * `button-editor-dialog.tsx` this never touches react-flow. It only reads
 * flows to offer flows and their nodes as jump targets.
 *
 * `parentName` is optional because a button's action fields sit at the root of
 * the item form inside `ItemEditorDialog`, while a quick reply nests them under
 * `action`.
 */
export function ButtonActionEditor({
  parentName,
  allowWebUrl = true,
}: {
  parentName?: string
  allowWebUrl?: boolean
}) {
  const t = useTranslations()
  const { control, getValues, setValue } = useFormContext()
  const flowOptions = useFlowSelectOptions()
  const { data: flows = [] } = useFlows(useWorkspaceId())

  // An empty `parentName` must not produce the dead path ".actionType".
  const field = (key: string) => (parentName ? `${parentName}.${key}` : key)

  const actionType = useWatch({
    control,
    name: field("actionType"),
  }) as string | undefined
  const currentFlowId = useWatch({ control, name: field("flowId") })

  const options = useMemo(
    () => buttonActionOptions({ allowWebUrl, t }),
    [allowWebUrl, t],
  )

  const nodeOptions = useMemo(() => {
    if (!currentFlowId) {
      return []
    }
    const targetFlow = flows.find((flow) => flow.id === currentFlowId)
    return targetFlow ? getFlowNodesOptions(targetFlow.flowVersions) : []
  }, [currentFlowId, flows])

  const needsFlow =
    actionType === "startExternalFlow" || actionType === "startExternalNode"

  /**
   * Seeds whatever the newly chosen action requires but the button does not
   * carry yet. `browserSize` is the one that bites: the schema requires it for
   * `openWebsite`, no UI ever renders it, and only `mmButtonDefaultFn` supplies
   * it — so a button saved as a postback and later switched to `openWebsite`
   * could never validate, leaving the dialog's Confirm permanently disabled
   * with no field to fix.
   *
   * Only absent values are filled, never overwritten, so switching back and
   * forth keeps what the user already typed.
   */
  const seedActionDefaults = (value?: string) => {
    const fill = (key: string, fallback: string | number) => {
      if (getValues(field(key)) === undefined) {
        setValue(field(key), fallback, { shouldValidate: true })
      }
    }

    if (value === "openWebsite") {
      fill("url", "")
      if (!BROWSER_SIZES.includes(getValues(field("browserSize")))) {
        setValue(field("browserSize"), DEFAULT_BROWSER_SIZE, {
          shouldValidate: true,
        })
      }
      return
    }

    if (value === "startExternalFlow" || value === "startExternalNode") {
      fill("flowId", "")
    }
    if (value === "startExternalNode") {
      fill("nodeId", "")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={t("fields.button.whenPressed")}
        name={field("actionType")}
        options={options}
        required
        triggerValueChange={seedActionDefaults}
      />

      {actionType === "openWebsite" && (
        <div data-testid="mm-button-url">
          <InputField
            label={t("fields.url.label")}
            name={field("url")}
            placeholder={t("fields.url.placeholder")}
            required
          />
        </div>
      )}

      {needsFlow && (
        <ComboboxField
          emptyText={t("actions.noRecordFound")}
          label={t("fields.flow.label")}
          name={field("flowId")}
          options={flowOptions}
          placeholder={t("actions.pleaseSelect")}
          required
        />
      )}

      {actionType === "startExternalNode" && (
        <div data-testid="mm-button-node">
          <ComboboxField
            emptyText={t("actions.noRecordFound")}
            label={t("fields.node.label")}
            name={field("nodeId")}
            options={nodeOptions}
            placeholder={t("actions.pleaseSelect")}
            required
          />
        </div>
      )}
    </div>
  )
}
