"use client"

import { cn } from "@/components/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Minus, Plus } from "lucide-react"
import {
  type InputHTMLAttributes,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { Controller, useFormContext } from "react-hook-form"

interface NumberFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  name: string
}

export const NumberField = ({
  ref,
  name,
  ...rest
}: NumberFieldProps & {
  ref?: React.RefObject<HTMLInputElement>
}) => {
  const { control } = useFormContext()

  const [hitMax, setHitMax] = useState(false)
  const [hitMin, setHitMin] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, [])

  const increment = () => {
    inputRef.current?.stepUp()
    inputRef.current?.dispatchEvent(new Event("change", { bubbles: true }))
    setHitMax(inputRef.current?.value === inputRef.current?.max)
    setHitMin(inputRef.current?.value === inputRef.current?.min)
  }

  const decrement = () => {
    inputRef.current?.stepDown()
    inputRef.current?.dispatchEvent(new Event("change", { bubbles: true }))
    setHitMax(inputRef.current?.value === inputRef.current?.max)
    setHitMin(inputRef.current?.value === inputRef.current?.min)
  }

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div
          className={cn(
            "flex items-center rounded-lg border border-slate-200 transition-all focus-visible:ring-1",
          )}
        >
          <Button
            type="button"
            size="icon"
            className="min-w-10 rounded-r-none hover:bg-gray-200 focus-visible:ring-1"
            variant="secondary"
            disabled={hitMin}
            onClick={decrement}
          >
            <Minus />
          </Button>
          <Input
            type="number"
            className="text-center w-full border-0 rounded-none focus-visible:ring-0"
            {...field}
            {...rest}
            ref={inputRef}
          />
          <Button
            type="button"
            size="icon"
            className="min-w-10 rounded-l-none hover:bg-gray-200 focus-visible:ring-1"
            variant="secondary"
            disabled={hitMax}
            onClick={increment}
          >
            <Plus />
          </Button>
        </div>
      )}
    />
  )
}

NumberField.displayName = "NumberField"
