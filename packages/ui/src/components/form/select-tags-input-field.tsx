"use client"

import { Badge } from "@aha.chat/ui/components/ui/badge"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@aha.chat/ui/components/ui/command"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@aha.chat/ui/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { cn } from "@aha.chat/ui/lib/utils"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronDown, X } from "lucide-react"
import { memo, type ReactNode, useRef, useState } from "react"
import { type FieldValues, type Path, useFormContext } from "react-hook-form"

type optionsType = { label: string; value: string }

interface SelectTagsInputFieldProps<TFieldValues extends FieldValues> {
  beautifyName?: string
  className?: string
  description?: string
  disabled?: boolean
  emptyMessage?: string
  endIcon?: ReactNode
  label?: string
  maxTags?: number
  name: Path<TFieldValues>
  onSelect?: (tags: optionsType[]) => void
  options: optionsType[]
  placeholder?: string
  searchPlaceholder?: string
  startIcon?: ReactNode
  tagVariant?: "default" | "secondary" | "outline" | "destructive"
  variant?: "default" | "enterprise" | "minimal"
}

const SelectTagsInputFieldBase = <TFieldValues extends FieldValues>({
  name,
  description,
  label,
  placeholder = "Chọn...",
  disabled = false,
  className,
  maxTags,
  startIcon,
  endIcon,
  options = [],
  variant = "enterprise",
  tagVariant = "default",
  onSelect,
  searchPlaceholder = "Tìm kiếm...",
  emptyMessage = "Không tìm thấy.",
}: SelectTagsInputFieldProps<TFieldValues>) => {
  const { control } = useFormContext()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const removeTag = (
    index: number,
    currentTags: string[],
    onChange: (tags: string[]) => void,
  ) => {
    const newTags = currentTags.filter((_, i) => i !== index)
    onChange(newTags)
    if (onSelect) {
      const selectedObjects = newTags
        .map((val) => options.find((opt) => opt.value === val))
        .filter(Boolean) as optionsType[]
      onSelect(selectedObjects)
    }
  }

  const addTag = (
    tag: string,
    currentTags: string[],
    onChange: (tags: string[]) => void,
  ) => {
    if (currentTags.includes(tag)) {
      const newTags = currentTags.filter((t) => t !== tag)
      onChange(newTags)
      if (onSelect) {
        const selectedObjects = newTags
          .map((val) => options.find((opt) => opt.value === val))
          .filter(Boolean) as optionsType[]
        onSelect(selectedObjects)
      }
    } else {
      if (maxTags && currentTags.length >= maxTags) {
        return
      }
      const newTags = [...currentTags, tag]
      onChange(newTags)
      if (onSelect) {
        const selectedObjects = newTags
          .map((val) => options.find((opt) => opt.value === val))
          .filter(Boolean) as optionsType[]
        onSelect(selectedObjects)
      }
    }
  }

  const getVariantStyles = () => {
    switch (variant) {
      case "enterprise":
        return {
          container:
            "bg-gradient-to-br from-background to-muted/20 dark:bg-muted/20 dark:border-gray-600 border-2 border-muted hover:border-primary/40 transition-all duration-200 hover:shadow-md",
          input: "bg-transparent border-0 focus:ring-0",
          suggestions: "bg-background border border-primary/20 shadow-xl",
        }
      case "minimal":
        return {
          container:
            "bg-background border border-border hover:border-primary/50 transition-colors",
          input: "bg-transparent border-0 focus:ring-0",
          suggestions: "bg-background border border-border shadow-lg",
        }
      default:
        return {
          container:
            "bg-background border border-input hover:border-primary/50 transition-colors",
          input: "bg-transparent border-0 focus:ring-0",
          suggestions: "bg-background border border-border shadow-lg",
        }
    }
  }

  const styles = getVariantStyles()

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const tags = (field.value || []) as string[]

        return (
          <FormItem className={cn("space-y-2", className)}>
            <FormLabel className="flex items-center gap-2">
              {label}
              {maxTags && (
                <Badge
                  className="text-xs dark:border-gray-500"
                  variant="outline"
                >
                  {tags.length}/{maxTags}
                </Badge>
              )}
            </FormLabel>

            <FormControl>
              <div className="relative" ref={containerRef}>
                <Popover onOpenChange={setOpen} open={open}>
                  <PopoverTrigger asChild disabled={disabled}>
                    <div
                      className={cn(
                        "flex min-h-[3.5rem] cursor-pointer flex-wrap items-center gap-2 rounded-md p-2",
                        styles.container,
                      )}
                    >
                      {startIcon && (
                        <span className="text-muted-foreground">
                          {startIcon}
                        </span>
                      )}

                      <AnimatePresence>
                        {tags.map((tag: string, index: number) => {
                          const option = options.find(
                            (opt) => opt.value === tag,
                          )
                          const displayLabel = option?.label || tag

                          return (
                            <motion.div
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              initial={{ opacity: 0, scale: 0.8 }}
                              // biome-ignore lint/suspicious/noArrayIndexKey: safe key
                              key={`${tag}-${index}`}
                              transition={{ duration: 0 }}
                            >
                              <Badge
                                className={cn(
                                  "group flex items-center gap-1 pr-1 transition-colors",
                                  variant === "enterprise" &&
                                    "border-primary/20 bg-primary",
                                )}
                                variant={tagVariant}
                              >
                                <span className="max-w-[150px] truncate">
                                  {displayLabel}
                                </span>
                                <button
                                  className="ml-1 rounded-full p-0.5 transition-colors hover:bg-destructive/20"
                                  onClick={(e) => {
                                    e.stopPropagation()

                                    if (disabled) {
                                      return
                                    }

                                    removeTag(index, tags, field.onChange)
                                  }}
                                  type="button"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            </motion.div>
                          )
                        })}
                      </AnimatePresence>

                      <AnimatePresence mode="wait">
                        {tags.length === 0 && (
                          <motion.span
                            animate={{ opacity: 1 }}
                            className="text-muted-foreground text-sm"
                            initial={{ opacity: 0 }}
                            key="placeholder"
                            transition={{ duration: 0.15, delay: 0 }}
                          >
                            {placeholder}
                          </motion.span>
                        )}
                      </AnimatePresence>

                      {endIcon && (
                        <span className="text-muted-foreground">{endIcon}</span>
                      )}

                      <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-full p-0"
                    style={{ width: containerRef.current?.offsetWidth }}
                  >
                    <Command
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                        }
                      }}
                    >
                      <CommandInput placeholder={searchPlaceholder} />
                      <CommandList>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        <CommandGroup>
                          {options.map((option) => {
                            const isSelected = tags.includes(option.value)
                            return (
                              <CommandItem
                                className="p-2 px-5"
                                disabled={disabled}
                                key={option.value}
                                onSelect={() => {
                                  if (!disabled) {
                                    addTag(option.value, tags, field.onChange)
                                  }
                                }}
                                value={option.value}
                              >
                                {option.label}
                                {isSelected && (
                                  <Check className="ml-auto h-4 w-4 text-primary" />
                                )}
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </FormControl>

            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}

export const SelectTagsInputField = memo(
  SelectTagsInputFieldBase,
) as typeof SelectTagsInputFieldBase
