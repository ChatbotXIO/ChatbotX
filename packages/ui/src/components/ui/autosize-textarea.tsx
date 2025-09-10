import { cn } from "@aha.chat/ui/lib/utils"
import type * as React from "react"
import TextareaAutosizeComponent from "react-textarea-autosize"

const textareaStyles =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(textareaStyles, className)}
      data-slot="textarea"
      {...props}
    />
  )
}

// TextareaAutosize component that uses the same styling as the Textarea component
function TextareaAutosize({
  className,
  ...props
}: React.ComponentProps<typeof TextareaAutosizeComponent>) {
  return (
    <TextareaAutosizeComponent
      className={cn(textareaStyles, className)}
      data-slot="textarea"
      {...props}
    />
  )
}

export { Textarea, TextareaAutosize }
