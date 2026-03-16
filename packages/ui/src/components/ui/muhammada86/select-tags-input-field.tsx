"use client";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@aha.chat/ui/components/ui/form";
import { Badge } from "@aha.chat/ui/components/ui/badge";
import { cn } from "@aha.chat/ui/lib/utils";
import { type ReactNode, useState, useRef, useEffect, memo } from "react";
import { type FieldValues, type Path, useFormContext } from "react-hook-form";
import { X, ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@aha.chat/ui/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover";

type optionsType = { label: string; value: string };

interface SelectTagsInputFieldProps<TFieldValues extends FieldValues> {
  name: Path<TFieldValues>;
  beautifyName?: string;
  description?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxTags?: number;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  options: optionsType[];
  variant?: "default" | "enterprise" | "minimal";
  tagVariant?: "default" | "secondary" | "outline" | "destructive";
  onSelect?: (tags: optionsType[]) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

const SelectTagsInputFieldBase = <TFieldValues extends FieldValues>({
  name,
  beautifyName,
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
  const { control } = useFormContext();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const removeTag = (
    index: number,
    currentTags: string[],
    onChange: (tags: string[]) => void
  ) => {
    const newTags = currentTags.filter((_, i) => i !== index);
    onChange(newTags);
    if (onSelect) {
      const selectedObjects = newTags
        .map((val) => options.find((opt) => opt.value === val))
        .filter(Boolean) as optionsType[];
      onSelect(selectedObjects);
    }
  };

  const addTag = (
    tag: string,
    currentTags: string[],
    onChange: (tags: string[]) => void
  ) => {
    if (currentTags.includes(tag)) {
      const newTags = currentTags.filter((t) => t !== tag);
      onChange(newTags);
      if (onSelect) {
        const selectedObjects = newTags
          .map((val) => options.find((opt) => opt.value === val))
          .filter(Boolean) as optionsType[];
        onSelect(selectedObjects);
      }
    } else {
      if (maxTags && currentTags.length >= maxTags) return;
      const newTags = [...currentTags, tag];
      onChange(newTags);
      if (onSelect) {
        const selectedObjects = newTags
          .map((val) => options.find((opt) => opt.value === val))
          .filter(Boolean) as optionsType[];
        onSelect(selectedObjects);
      }
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case "enterprise":
        return {
          container:
            "bg-gradient-to-br from-background to-muted/20 dark:bg-muted/20 dark:border-gray-600 border-2 border-muted hover:border-primary/40 transition-all duration-200 hover:shadow-md",
          input: "bg-transparent border-0 focus:ring-0",
          suggestions: "bg-background border border-primary/20 shadow-xl",
        };
      case "minimal":
        return {
          container:
            "bg-background border border-border hover:border-primary/50 transition-colors",
          input: "bg-transparent border-0 focus:ring-0",
          suggestions: "bg-background border border-border shadow-lg",
        };
      default:
        return {
          container:
            "bg-background border border-input hover:border-primary/50 transition-colors",
          input: "bg-transparent border-0 focus:ring-0",
          suggestions: "bg-background border border-border shadow-lg",
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const tags = (field.value || []) as string[];

        return (
          <FormItem className={cn("space-y-2", className)}>
            <FormLabel className="flex items-center gap-2">
              {label}
              {maxTags && (
                <Badge
                  variant="outline"
                  className="text-xs dark:border-gray-500"
                >
                  {tags.length}/{maxTags}
                </Badge>
              )}
            </FormLabel>

            <FormControl>
              <div ref={containerRef} className="relative">
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild disabled={disabled}>
                    <div
                      className={cn(
                        "min-h-[3.5rem] p-2 rounded-md flex flex-wrap gap-2 items-center cursor-pointer",
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
                            (opt) => opt.value === tag
                          );
                          const displayLabel = option?.label || tag;

                          return (
                            <motion.div
                              key={`${tag}-${index}`}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0 }}
                            >
                              <Badge
                                variant={tagVariant}
                                className={cn(
                                  "flex items-center gap-1 pr-1 group transition-colors",
                                  variant === "enterprise" &&
                                    "bg-primary border-primary/20"
                                )}
                              >
                                <span className="max-w-[150px] truncate">
                                  {displayLabel}
                                </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();

                                      if (disabled) return;

                                      removeTag(index, tags, field.onChange);
                                    }}
                                    className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                              </Badge>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>

                      <AnimatePresence mode="wait">
                        {tags.length === 0 && (
                          <motion.span
                            key="placeholder"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.15, delay: 0 }}
                            className="text-muted-foreground text-sm"
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
                    className="w-full p-0"
                    align="start"
                    style={{ width: containerRef.current?.offsetWidth }}
                  >
                    <Command
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                        }
                      }}
                    >
                      <CommandInput placeholder={searchPlaceholder} />
                      <CommandList>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        <CommandGroup>
                          {options.map((option) => {
                            const isSelected = tags.includes(option.value);
                            return (
                              <CommandItem
                                className="p-2 px-5"
                                key={option.value}
                                value={option.value}
                                disabled={disabled}
                                onSelect={() => {
                                  if (!disabled) {
                                    addTag(option.value, tags, field.onChange);
                                  }
                                }}
                              >
                                {option.label}
                                {isSelected && (
                                  <Check className="h-4 w-4 ml-auto text-primary" />
                                )}
                              </CommandItem>
                            );
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
        );
      }}
    />
  );
};

export const SelectTagsInputField = memo(
  SelectTagsInputFieldBase
) as typeof SelectTagsInputFieldBase;
