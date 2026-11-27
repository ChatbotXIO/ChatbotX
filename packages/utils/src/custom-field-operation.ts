import { type CustomFieldType, customFieldTypes } from "./custom-field"

/**
 * Operation codes persisted in stored flows and trigger actions. O01-O05 are
 * the original codes and must never change; later codes are additive.
 */
export const FieldOperationType = {
  set: "O01",
  append: "O02",
  prepend: "O03",
  increase: "O04",
  decrease: "O05",
  clear: "O06",
  formula: "O07",
  setNow: "O08",
  dateExpression: "O09",
  addMinutes: "O10",
  addHours: "O11",
  addDays: "O12",
} as const
export type FieldOperationType =
  (typeof FieldOperationType)[keyof typeof FieldOperationType]

/** What the operand of an operation is, which decides the editor control. */
export const FieldOperandKind = {
  none: "none",
  typed: "typed",
  text: "text",
  number: "number",
  expression: "expression",
} as const
export type FieldOperandKind =
  (typeof FieldOperandKind)[keyof typeof FieldOperandKind]

export type FieldOperationDefinition = {
  /** Name used by the public API, CLI and MCP. */
  apiName: string
  allowedTypes: readonly CustomFieldType[]
  operandKind: FieldOperandKind
  /** A blank operand is rejected when true. */
  requiresOperand: boolean
}

const ALL_TYPES = customFieldTypes.options
const TEXT_TYPES = ["shortText", "longText"] as const
const TEMPORAL_TYPES = ["date", "datetime"] as const

/** The single source for names, type rules, operand kinds and validation. */
export const FIELD_OPERATION_DEFINITIONS = {
  [FieldOperationType.set]: {
    apiName: "set",
    allowedTypes: ALL_TYPES,
    operandKind: FieldOperandKind.typed,
    requiresOperand: false,
  },
  [FieldOperationType.append]: {
    apiName: "append",
    allowedTypes: TEXT_TYPES,
    operandKind: FieldOperandKind.text,
    requiresOperand: false,
  },
  [FieldOperationType.prepend]: {
    apiName: "prepend",
    allowedTypes: TEXT_TYPES,
    operandKind: FieldOperandKind.text,
    requiresOperand: false,
  },
  [FieldOperationType.increase]: {
    apiName: "increase",
    allowedTypes: ["number"],
    operandKind: FieldOperandKind.number,
    requiresOperand: true,
  },
  [FieldOperationType.decrease]: {
    apiName: "decrease",
    allowedTypes: ["number"],
    operandKind: FieldOperandKind.number,
    requiresOperand: true,
  },
  [FieldOperationType.clear]: {
    apiName: "clear",
    allowedTypes: ALL_TYPES,
    operandKind: FieldOperandKind.none,
    requiresOperand: false,
  },
  [FieldOperationType.formula]: {
    apiName: "formula",
    allowedTypes: ["number"],
    operandKind: FieldOperandKind.expression,
    requiresOperand: true,
  },
  [FieldOperationType.setNow]: {
    apiName: "setNow",
    allowedTypes: TEMPORAL_TYPES,
    operandKind: FieldOperandKind.none,
    requiresOperand: false,
  },
  [FieldOperationType.dateExpression]: {
    apiName: "dateExpression",
    allowedTypes: TEMPORAL_TYPES,
    operandKind: FieldOperandKind.expression,
    requiresOperand: true,
  },
  [FieldOperationType.addMinutes]: {
    apiName: "addMinutes",
    allowedTypes: TEMPORAL_TYPES,
    operandKind: FieldOperandKind.number,
    requiresOperand: true,
  },
  [FieldOperationType.addHours]: {
    apiName: "addHours",
    allowedTypes: TEMPORAL_TYPES,
    operandKind: FieldOperandKind.number,
    requiresOperand: true,
  },
  [FieldOperationType.addDays]: {
    apiName: "addDays",
    allowedTypes: TEMPORAL_TYPES,
    operandKind: FieldOperandKind.number,
    requiresOperand: true,
  },
} as const satisfies Record<FieldOperationType, FieldOperationDefinition>

export const fieldOperationCodes = Object.values(FieldOperationType)

export const isFieldOperationAllowed = (
  operation: FieldOperationType,
  type: CustomFieldType,
): boolean =>
  (
    FIELD_OPERATION_DEFINITIONS[operation].allowedTypes as readonly string[]
  ).includes(type)

export const fieldOperationsForType = (
  type: CustomFieldType,
): FieldOperationType[] =>
  fieldOperationCodes.filter((operation) =>
    isFieldOperationAllowed(operation, type),
  )

const OPERATION_BY_API_NAME = new Map<string, FieldOperationType>(
  fieldOperationCodes.map((code) => [
    FIELD_OPERATION_DEFINITIONS[code].apiName,
    code,
  ]),
)

export const fieldOperationByApiName = (
  apiName: string,
): FieldOperationType | undefined => OPERATION_BY_API_NAME.get(apiName)

export const fieldOperationApiNames = fieldOperationCodes.map(
  (code) => FIELD_OPERATION_DEFINITIONS[code].apiName,
)
