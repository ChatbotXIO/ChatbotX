"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { type ChangeEvent, type FormEvent, forwardRef, useState } from "react"

import { cn } from "@/lib/utils"
import { Minus, Plus } from "lucide-react"

interface NumberFieldProps {
  value: number
  step?: number
  onChange: (value: ChangeEvent<HTMLInputElement>) => void
  min?: number
  max?: number
}

export const NumberField = forwardRef<HTMLDivElement, NumberFieldProps>(
  ({ value = 0, step = 0.1, onChange = () => {}, min = 0, max = 0 }, ref) => {
    const [current, setCurrent] = useState(value)
    const [isFocus, setIsFocus] = useState(false)

    const increment = () => {
      const newValue = Math.round((Number(current) + step) * 10) / 10
      if (max && newValue >= max) {
        return
      }
      setCurrent(newValue)
    }

    const decrement = () => {
      const newValue = Math.round((Number(current) - step) * 10) / 10
      if (newValue <= min) {
        return
      }
      setCurrent(newValue)
    }

    const onInput = (e: FormEvent<HTMLInputElement>) => {
      const regex = /^-?(\d\.)?(\d+)?$/

      if (regex.test((e.target as HTMLInputElement).value)) {
        const value = (e.target as HTMLInputElement).value
        const newValue = Math.round(Number(value) * 10) / 10

        if (max && newValue >= max) {
          return setCurrent(max)
        }

        if (newValue <= min) {
          return setCurrent(min)
        }

        setCurrent(newValue)
      }
    }

    const onFocus = () => setIsFocus(true)
    const onBlur = () => setIsFocus(false)

    return (
      <div
        className={cn(
          "flex items-center rounded-lg border border-slate-200 transition-all focus-visible:ring-1",
          isFocus ? "border-black" : "",
        )}
      >
        <Button
          size="icon"
          className="min-w-10 rounded-r-none hover:bg-gray-200 focus-visible:ring-1"
          variant="secondary"
          onClick={decrement}
        >
          <Minus />
        </Button>
        <Input
          className="text-center w-full border-0 rounded-none focus-visible:ring-0"
          value={current}
          onChange={onChange}
          onInput={onInput}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <Button
          size="icon"
          className="min-w-10 rounded-l-none hover:bg-gray-200 focus-visible:ring-1"
          variant="secondary"
          onClick={increment}
        >
          <Plus />
        </Button>
      </div>
    )
  },
)

NumberField.displayName = "NumberField"
