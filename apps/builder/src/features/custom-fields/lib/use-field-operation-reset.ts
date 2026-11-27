import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { FieldOperationType } from "@chatbotx.io/flow-config"
import {
  FIELD_OPERATION_DEFINITIONS,
  FieldOperandKind,
  isFieldOperationAllowed,
} from "@chatbotx.io/utils/custom-field-operation"
import { useCallback, useEffect, useRef } from "react"
import { type UseFormReturn, useFormContext, useWatch } from "react-hook-form"

/** A typed value and plain text are both just text, so they carry over. */
const TEXT_LIKE_KINDS: ReadonlySet<FieldOperandKind> = new Set([
  FieldOperandKind.typed,
  FieldOperandKind.text,
])

/**
 * Whether what was typed still means something for the new operation: the same
 * kind of operand (Increase -> Decrease), or text either way (Set -> Append).
 * A number typed for "Increase" is meaningless as a formula or a date.
 */
const operandSurvives = (
  previous: FieldOperationType,
  next: FieldOperationType,
): boolean => {
  const from = FIELD_OPERATION_DEFINITIONS[previous]?.operandKind
  const to = FIELD_OPERATION_DEFINITIONS[next]?.operandKind
  return (
    from === to ||
    (!!from && !!to && TEXT_LIKE_KINDS.has(from) && TEXT_LIKE_KINDS.has(to))
  )
}

/**
 * Keeps an operation editor consistent. Hand `onOperationChange` to the
 * operation select: it clears the operand in the same event as the change,
 * before the operand control (keyed by operation) remounts — clearing later, in
 * an effect, would let the new editor start from the stale operand. Switching
 * to another field whose type does not allow the chosen operation falls back
 * to the universal `set` the same way; a field resolving for the first time (a
 * stored action being opened) rewrites nothing.
 */
export function useFieldOperationReset(input: {
  operationName: string
  valueName: string
  fieldType: CustomFieldType | null
  /**
   * The form that owns the fields, for a caller rendered outside its own
   * `<Form>` provider (where the context would be a parent form).
   */
  form?: UseFormReturn
}) {
  const { operationName, valueName, fieldType } = input
  const context = useFormContext()
  const { control, setValue } = input.form ?? context
  const operation = useWatch({ control, name: operationName }) as
    | FieldOperationType
    | undefined
  const previousOperation = useRef(operation)

  useEffect(() => {
    previousOperation.current = operation
  }, [operation])

  const clearOperand = useCallback(
    () => setValue(valueName, "", { shouldDirty: true, shouldValidate: true }),
    [setValue, valueName],
  )

  const onOperationChange = useCallback(
    (next?: string) => {
      const previous = previousOperation.current
      previousOperation.current = next as FieldOperationType | undefined
      // The first pick (no previous operation) has nothing to carry over.
      if (
        previous &&
        next &&
        !operandSurvives(previous, next as FieldOperationType)
      ) {
        clearOperand()
      }
    },
    [clearOperand],
  )

  const previousFieldType = useRef(fieldType)

  useEffect(() => {
    const previous = previousFieldType.current
    previousFieldType.current = fieldType
    // Only a change from one field to another: when a stored action is opened
    // the field resolves for the first time and nothing may be rewritten.
    if (!(previous && fieldType) || previous === fieldType) {
      return
    }
    if (operation && !isFieldOperationAllowed(operation, fieldType)) {
      previousOperation.current = FieldOperationType.set
      setValue(operationName, FieldOperationType.set, { shouldValidate: true })
      if (!operandSurvives(operation, FieldOperationType.set)) {
        clearOperand()
      }
    }
  }, [fieldType, operation, operationName, setValue, clearOperand])

  return { onOperationChange }
}
