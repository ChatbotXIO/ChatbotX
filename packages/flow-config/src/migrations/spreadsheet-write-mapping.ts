import type { FlowNode } from "../nodes"
import {
  spreadsheetStepVersions,
  toSpreadsheetStepVersion,
} from "../steps/spreadsheet"
import { type StepType, stepTypes } from "../steps/step-action"

export type CustomFieldLookup = (customFieldId: string) =>
  | {
      name: string
      type: string
    }
  | undefined

type NodeDetails = FlowNode["data"]["details"]
type StepRecord = Record<string, unknown> & { stepType?: unknown }
type StepTransform = (step: StepRecord) => StepRecord
type StepUpgrader = (step: StepRecord, lookup: CustomFieldLookup) => StepRecord

const INVALID_RAW_TOKEN_FIELD_NAME_REGEX = /[{}\n\r]/

const spreadsheetWriteStepTypes = [
  stepTypes.enum.spreadsheetSendData,
  stepTypes.enum.spreadsheetUpdateRow,
] as const satisfies readonly StepType[]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const isStepRecord = (value: unknown): value is StepRecord =>
  isRecord(value) && typeof value.stepType === "string"

const toStepType = (value: unknown): StepType | null => {
  const result = stepTypes.safeParse(value)
  return result.success ? result.data : null
}

const mapStepArray = (value: unknown, transform: StepTransform): unknown =>
  Array.isArray(value)
    ? value.map((step) => mapStepRecord(step, transform))
    : value

const mapButtonSteps = (value: unknown, transform: StepTransform): unknown => {
  if (!isRecord(value)) {
    return value
  }

  const nextValue = { ...value }
  if ("beforeStep" in value) {
    nextValue.beforeStep = mapStepRecord(value.beforeStep, transform)
  }
  if ("steps" in value) {
    nextValue.steps = mapStepArray(value.steps, transform)
  }

  return nextValue
}

const mapButtonArray = (value: unknown, transform: StepTransform): unknown =>
  Array.isArray(value)
    ? value.map((button) => mapButtonSteps(button, transform))
    : value

const mapStepRecord = (value: unknown, transform: StepTransform): unknown => {
  if (!isStepRecord(value)) {
    return value
  }

  const step = transform(value)
  const nextStep: StepRecord = { ...step }

  // A step can trigger nested step chains through buttons, wherever they live:
  // message steps expose `buttons` directly, carousel steps nest them under
  // `cards`, and email steps under `elements`. Recurse into every shape so a
  // write step is reached at any depth — never branch on a single stepType,
  // which is what previously let message-step buttons slip through.
  if (Array.isArray(step.buttons)) {
    nextStep.buttons = mapButtonArray(step.buttons, transform)
  }
  if (Array.isArray(step.cards)) {
    nextStep.cards = step.cards.map((card) =>
      isRecord(card) && Array.isArray(card.buttons)
        ? { ...card, buttons: mapButtonArray(card.buttons, transform) }
        : card,
    )
  }
  if (Array.isArray(step.elements)) {
    nextStep.elements = mapButtonArray(step.elements, transform)
  }

  return nextStep
}

export const mapNodeSteps = (
  details: NodeDetails,
  transform: StepTransform,
): NodeDetails => {
  if (!isRecord(details)) {
    return details
  }
  const detailsRecord: Record<string, unknown> = details
  const nextDetails: Record<string, unknown> = { ...detailsRecord }

  if ("beforeStep" in detailsRecord) {
    nextDetails.beforeStep = mapStepRecord(detailsRecord.beforeStep, transform)
  }
  if ("steps" in detailsRecord) {
    nextDetails.steps = mapStepArray(detailsRecord.steps, transform)
  }
  if ("quickReplies" in detailsRecord) {
    nextDetails.quickReplies = Array.isArray(detailsRecord.quickReplies)
      ? detailsRecord.quickReplies.map((button: unknown) =>
          mapButtonSteps(button, transform),
        )
      : detailsRecord.quickReplies
  }

  return nextDetails as NodeDetails
}

const isConvertibleFieldName = (name: string): boolean =>
  !INVALID_RAW_TOKEN_FIELD_NAME_REGEX.test(name)

export const toCustomFieldToken = (field: { name: string }): string =>
  `{{raw:${field.name}}}`

const convertLegacyMapItem = (
  value: unknown,
  lookup: CustomFieldLookup,
): Record<string, unknown> | null => {
  if (!isRecord(value)) {
    return null
  }

  const customFieldId =
    typeof value.customFieldId === "string" ? value.customFieldId : ""
  // An unconfigured legacy row (no field picked) wrote an empty cell; a v2 empty
  // template renders to "" as well, so converting it stays byte-identical.
  if (!customFieldId) {
    return {
      ...value,
      value: "",
    }
  }

  const customField = lookup(customFieldId)
  if (!(customField && isConvertibleFieldName(customField.name))) {
    return null
  }

  return {
    ...value,
    value: toCustomFieldToken(customField),
  }
}

export const upgradeSpreadsheetWriteStep = <T>(
  step: T,
  lookup: CustomFieldLookup,
): T => {
  if (!isRecord(step)) {
    return step
  }

  if (
    toSpreadsheetStepVersion(step.version) === spreadsheetStepVersions.enum.v2
  ) {
    return step
  }

  if (!Array.isArray(step.map) || step.map.length === 0) {
    return step
  }

  const convertedMap = step.map.map((item) =>
    convertLegacyMapItem(item, lookup),
  )
  if (convertedMap.some((item) => item === null)) {
    return step
  }

  return {
    ...step,
    version: spreadsheetStepVersions.enum.v2,
    map: convertedMap,
  } as T
}

export const tagSpreadsheetWriteStepVersion = <T>(step: T): T => {
  if (!isRecord(step) || "version" in step) {
    return step
  }

  return {
    ...step,
    version: spreadsheetStepVersions.enum.v1,
  } as T
}

const stepUpgraders: Partial<Record<StepType, StepUpgrader>> = {
  [stepTypes.enum.spreadsheetSendData]: upgradeSpreadsheetWriteStep,
  [stepTypes.enum.spreadsheetUpdateRow]: upgradeSpreadsheetWriteStep,
}

export const upgradeNodeSteps = (
  details: NodeDetails,
  lookup: CustomFieldLookup,
): NodeDetails =>
  mapNodeSteps(details, (step) => {
    const stepType = toStepType(step.stepType)
    const upgrader = stepType ? stepUpgraders[stepType] : undefined

    return upgrader ? upgrader(step, lookup) : step
  })

export const tagNodeSpreadsheetWriteStepVersions = (
  details: NodeDetails,
): NodeDetails =>
  mapNodeSteps(details, (step) => {
    const stepType = toStepType(step.stepType)
    return stepType &&
      spreadsheetWriteStepTypes.some((type) => type === stepType)
      ? tagSpreadsheetWriteStepVersion(step)
      : step
  })
