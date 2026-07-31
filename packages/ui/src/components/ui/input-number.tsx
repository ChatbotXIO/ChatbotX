import { ChevronDown, ChevronUp } from "lucide-react"
import type { FocusEvent, Ref } from "react"
import { forwardRef, useCallback, useEffect, useRef, useState } from "react"
import { NumericFormat, type NumericFormatProps } from "react-number-format"
import { useComposedRefs } from "../../lib/compose-refs"
import { Button } from "./button"
import { Input } from "./input"

export interface NumberInputProps
  extends Omit<
    NumericFormatProps,
    "value" | "onValueChange" | "getInputRef"
  > {
  stepper?: number
  thousandSeparator?: string
  placeholder?: string
  defaultValue?: number
  min?: number
  max?: number
  value?: number // Controlled value
  suffix?: string
  prefix?: string
  onValueChange?: (value: number | undefined) => void
  fixedDecimalScale?: boolean
  decimalScale?: number
  getInputRef?: ((el: HTMLInputElement | null) => void) | Ref<HTMLInputElement>
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      stepper,
      thousandSeparator,
      placeholder,
      defaultValue,
      min = Number.NEGATIVE_INFINITY,
      max = Number.POSITIVE_INFINITY,
      onValueChange,
      fixedDecimalScale = false,
      decimalScale = 0,
      suffix,
      prefix,
      value: controlledValue,
      onBlur,
      getInputRef,
      ...props
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const handleInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node

        if (typeof getInputRef === "function") {
          getInputRef(node)
          return
        }

        if (getInputRef) {
          getInputRef.current = node
        }
      },
      [getInputRef],
    )
    const composedRef = useComposedRefs(ref, handleInputRef)
    const [value, setValue] = useState<number | undefined>(
      controlledValue ?? defaultValue,
    )

    const clampValue = useCallback(
      (nextValue: number) => Math.min(Math.max(nextValue, min), max),
      [min, max],
    )

    const handleIncrement = useCallback(() => {
      const nextValue = clampValue(
        value === undefined ? (stepper ?? 1) : value + (stepper ?? 1),
      )

      setValue(nextValue)
      onValueChange?.(nextValue)
    }, [clampValue, onValueChange, stepper, value])

    const handleDecrement = useCallback(() => {
      const nextValue = clampValue(
        value === undefined ? -(stepper ?? 1) : value - (stepper ?? 1),
      )

      setValue(nextValue)
      onValueChange?.(nextValue)
    }, [clampValue, onValueChange, stepper, value])

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (document.activeElement === inputRef.current) {
          if (e.key === "ArrowUp") {
            handleIncrement()
          } else if (e.key === "ArrowDown") {
            handleDecrement()
          }
        }
      }

      window.addEventListener("keydown", handleKeyDown)

      return () => {
        window.removeEventListener("keydown", handleKeyDown)
      }
    }, [handleIncrement, handleDecrement])

    useEffect(() => {
      if (controlledValue !== undefined) {
        setValue(controlledValue)
      }
    }, [controlledValue])

    const handleChange = (values: {
      value: string
      floatValue: number | undefined
    }) => {
      const newValue =
        values.floatValue === undefined ? undefined : values.floatValue
      setValue(newValue)
      if (onValueChange) {
        onValueChange(newValue)
      }
    }

    const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
      if (value !== undefined) {
        const clampedValue = clampValue(value)

        if (clampedValue !== value) {
          setValue(clampedValue)
          if (inputRef.current) {
            inputRef.current.value = String(clampedValue)
          }
          onValueChange?.(clampedValue)
        }
      }

      onBlur?.(event)
    }

    return (
      <div className="flex items-center w-full">
        <NumericFormat
          value={value}
          onValueChange={handleChange}
          thousandSeparator={thousandSeparator}
          decimalScale={decimalScale}
          fixedDecimalScale={fixedDecimalScale}
          allowNegative={min < 0}
          valueIsNumericString
          max={max}
          min={min}
          suffix={suffix}
          prefix={prefix}
          customInput={Input}
          placeholder={placeholder}
          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none rounded-e-none relative"
          getInputRef={composedRef}
          {...props}
          onBlur={handleBlur}
        />

        <div className="flex flex-col">
          <Button
            aria-label="Increase value"
            className="px-2 h-4.5 rounded-s-none rounded-ee-none border-input border-s-0 border-b-[0.5px] focus-visible:relative"
            variant="outline"
            type="button"
            onClick={handleIncrement}
            disabled={value === max}
          >
            <ChevronUp size={15} />
          </Button>
          <Button
            aria-label="Decrease value"
            className="px-2 h-4.5 rounded-s-none rounded-se-none border-input border-s-0 border-t-[0.5px] focus-visible:relative"
            variant="outline"
            type="button"
            onClick={handleDecrement}
            disabled={value === min}
          >
            <ChevronDown size={15} />
          </Button>
        </div>
      </div>
    )
  },
)
