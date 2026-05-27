"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"
import { useTagStore } from "@/features/tags/provider/tag-store-context"
import { getTagChipStyle } from "@/features/tags/tag-colors"
import { useUserStore } from "@/features/users/provider/user-store-context"
import { createContactAction } from "./actions/create-contact.action"
import { createContactRequest } from "./schemas/action"

// Pixel-perfect Respond.io 2026-05-26 (Pedro): form do drawer "Novo
// Contato" segue ordem exata do print:
//   First Name | Last Name | Phone Number* | Email | Assignee |
//   Tags (popover) | Custom Fields (accordion)
// Footer: Cancel (ghost) + Create (azul) — sticky no rodapé do Sheet.
export function CreateContactForm({
  workspaceId,
  onSubmitted,
  onCancelled,
}: {
  workspaceId: string
  onSubmitted?: () => void
  onCancelled?: () => void
}) {
  const t = useTranslations()
  const workspaceMembers = useUserStore((s) => s.workspaceMembers)
  const allTags = useTagStore((s) => s.tags)
  const customFields = useCustomFieldStore((s) => s.customFields)

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, string>
  >({})
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)

  const assigneeOptions = useMemo(
    () =>
      workspaceMembers.map((m) => ({
        value: m.user?.id ?? "",
        label: m.user?.name ?? m.user?.email ?? "—",
      })),
    [workspaceMembers],
  )

  const { form, handleSubmitWithAction, resetFormAndAction } =
    useHookFormAction(
      createContactAction.bind(null, workspaceId),
      zodResolver(createContactRequest),
      {
        actionProps: {
          onSuccess: () => {
            resetFormAndAction()
            setSelectedTagIds([])
            setCustomFieldValues({})
            toast.success(
              t("messages.createdSuccess", {
                feature: t("fields.contact.label"),
              }),
            )
            onSubmitted?.()
          },
          onError: ({ error }) => {
            if (error.serverError) {
              toast.error(error.serverError)
            }
          },
        },
        formProps: {
          mode: "onChange",
          defaultValues: {
            phoneNumber: "",
            email: "",
            firstName: "",
            lastName: "",
            assigneeUserId: "",
            tagIds: [],
            customFields: {},
          },
        },
        errorMapProps: {},
      },
    )

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
      form.setValue("tagIds", next, { shouldValidate: true })
      return next
    })
  }

  const updateCustomField = (customFieldId: string, value: string) => {
    setCustomFieldValues((prev) => {
      const next = { ...prev, [customFieldId]: value }
      form.setValue("customFields", next, { shouldValidate: true })
      return next
    })
  }

  const selectedTags = allTags.filter((tag) => selectedTagIds.includes(tag.id))

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={handleSubmitWithAction}
      >
        {/* Body scrollável */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-4">
            <InputField
              label={t("fields.firstName.label")}
              name="firstName"
              placeholder={t("contacts.placeholders.addFirstName")}
            />
            <InputField
              label={t("fields.lastName.label")}
              name="lastName"
              placeholder={t("contacts.placeholders.addLastName")}
            />
            <InputField
              label={t("fields.phoneNumber.label")}
              name="phoneNumber"
              placeholder="+5511999998888"
              required
            />
            <InputField
              label={t("fields.email.label")}
              name="email"
              placeholder={t("contacts.placeholders.addEmail")}
            />
            <ComboboxField
              label={t("fields.assignee.label")}
              name="assigneeUserId"
              options={assigneeOptions}
              placeholder={t("contacts.placeholders.selectAssignee")}
            />

            {/* Tags — botão + abre popover */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[14px] text-text-secondary">
                  {t("tags.title")}
                </span>
                <Popover onOpenChange={setTagPopoverOpen} open={tagPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      aria-label={t("tags.addTag")}
                      className="size-6 rounded-md text-text-secondary hover:bg-white/[0.06]"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <PlusIcon className="size-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[280px] p-0">
                    <Command>
                      <CommandInput placeholder={t("tags.searchPlaceholder")} />
                      <CommandList>
                        <CommandEmpty>{t("tags.emptyState")}</CommandEmpty>
                        <div className="max-h-60 overflow-y-auto py-1">
                          {allTags.map((tag) => {
                            const checked = selectedTagIds.includes(tag.id)
                            return (
                              <button
                                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-white/[0.06]"
                                key={tag.id}
                                onClick={() => toggleTag(tag.id)}
                                type="button"
                              >
                                <Checkbox checked={checked} />
                                <span
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-[11px] leading-4"
                                  style={getTagChipStyle(tag.color)}
                                >
                                  {tag.emoji && (
                                    <span aria-hidden>{tag.emoji}</span>
                                  )}
                                  <span>{tag.name}</span>
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedTags.map((tag) => (
                    <span
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-[11px] leading-4"
                      key={tag.id}
                      style={getTagChipStyle(tag.color)}
                    >
                      {tag.emoji && <span aria-hidden>{tag.emoji}</span>}
                      <span>{tag.name}</span>
                      <button
                        aria-label={`${t("actions.remove")} ${tag.name}`}
                        className="ml-0.5 inline-flex"
                        onClick={() => toggleTag(tag.id)}
                        type="button"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Fields — accordion */}
            {customFields.length > 0 && (
              <Accordion collapsible type="single">
                <AccordionItem className="border-0" value="custom-fields">
                  <AccordionTrigger className="px-0 py-2 font-medium text-[14px] text-text-secondary hover:no-underline">
                    {t("customFields.title")}
                  </AccordionTrigger>
                  <AccordionContent className="px-0 pt-2 pb-1">
                    <div className="flex flex-col gap-3">
                      {customFields.map((cf) => (
                        <div className="flex flex-col gap-1" key={cf.id}>
                          <label
                            className="font-normal text-[12px] text-text-secondary"
                            htmlFor={`cf-${cf.id}`}
                          >
                            {cf.name}
                          </label>
                          <input
                            className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            id={`cf-${cf.id}`}
                            onChange={(e) =>
                              updateCustomField(cf.id, e.target.value)
                            }
                            placeholder={t("customFields.addValue", {
                              field: cf.name,
                            })}
                            type="text"
                            value={customFieldValues[cf.id] ?? ""}
                          />
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        </div>

        {/* Footer sticky — Cancel + Create */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-border border-t px-4 py-3">
          <Button onClick={onCancelled} type="button" variant="ghost">
            {t("actions.cancel")}
          </Button>
          <Button
            disabled={!form.formState.isValid || form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting && (
              <Loader2Icon className="animate-spin" />
            )}
            {t("actions.create")}
          </Button>
        </div>
      </form>
    </Form>
  )
}
