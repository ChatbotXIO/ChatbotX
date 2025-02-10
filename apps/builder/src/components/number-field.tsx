"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Minus, Plus } from "lucide-react"
import {
  type InputHTMLAttributes,
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

interface NumberFieldProps extends InputHTMLAttributes<HTMLInputElement> {}

export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(
  ({ ...props }, ref) => {
    const [hitMax, setHitMax] = useState(false)
    const [hitMin, setHitMin] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(
      ref,
      () => (inputRef.current ? inputRef.current : null),
      [],
    )

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
          ref={inputRef}
          {...props}
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
    )
  },
)

NumberField.displayName = "NumberField"
