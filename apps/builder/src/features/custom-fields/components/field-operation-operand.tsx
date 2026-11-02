"use client"

import { FieldOperationType } from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import {
  FIELD_OPERATION_DEFINITIONS,
  type FieldOperandKind,
} from "@chatbotx.io/utils/custom-field-operation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"

type OperandInputProps = {
  name: string
  label: string
  /** Offer `{{variable}}` insertion (flows and triggers resolve them). */
  variables: boolean
  numeric?: boolean
  required?: boolean
  renderTyped: () => ReactNode
}

const TextOperandInput = ({
  name,
  label,
  variables,
  numeric,
  required,
}: OperandInputProps) =>
  variables ? (
    <PlainTextEditorField
      includeBotFieldVariables
      includeRawCustomFieldVariables
      inline
      label={label}
      name={name}
      required={required}
      showEmojiPicker={false}
    />
  ) : (
    <InputField
      label={label}
      name={name}
      required={required}
      step={numeric ? "any" : undefined}
      type={numeric ? "number" : "text"}
    />
  )

const OPERAND_INPUTS = {
  none: () => null,
  typed: ({ renderTyped }) => renderTyped(),
  text: (props) => <TextOperandInput {...props} />,
  number: (props) => <TextOperandInput {...props} numeric />,
  expression: (props) => <TextOperandInput {...props} />,
} as const satisfies Record<
  FieldOperandKind,
  (props: OperandInputProps) => ReactNode
>

const OPERAND_HINT_KEYS: Partial<
  Record<FieldOperationType, "formulaHint" | "dateExpressionHint">
> = {
  [FieldOperationType.formula]: "formulaHint",
  [FieldOperationType.dateExpression]: "dateExpressionHint",
}

/**
 * The value control of a "set custom field" editor, chosen by what the picked
 * operation expects (nothing, a typed value, text, a number or an expression).
 */
export function FieldOperationOperand({
  operation,
  ...props
}: Omit<OperandInputProps, "label"> & { operation: FieldOperationType }) {
  const t = useTranslations()
  const { operandKind, requiresOperand } =
    FIELD_OPERATION_DEFINITIONS[operation]
  const hintKey = OPERAND_HINT_KEYS[operation]

  return (
    // Keyed by operation: the editor holds its own text, so a reset of the form
    // value must remount it or it would keep showing the old operand.
    <div className="flex flex-col gap-1.5" key={operation}>
      {OPERAND_INPUTS[operandKind]({
        ...props,
        label: t("fields.value.label"),
        required: requiresOperand,
      })}
      {hintKey ? (
        <p className="text-muted-foreground text-xs">
          {t(`fields.customField.${hintKey}`)}
        </p>
      ) : null}
    </div>
  )
}
