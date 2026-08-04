"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { useAIAgentStore } from "@/features/ai-agents/provider/ai-agent-store-context"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import type { CreateIgStoryRequest, IgStoryVariant } from "../schema/action"
import { SelectInstagramStoriesDialog } from "./select-instagram-stories-dialog"

type IgStoryFormValues = CreateIgStoryRequest

type IgStoryFormProps = {
  form: UseFormReturn<IgStoryFormValues>
  variant: IgStoryVariant
  onSubmit: (e: React.FormEvent) => void
  isSubmitting: boolean
  onCancel: () => void
  submitLabel: string
}

export function IgStoryForm({
  form,
  onSubmit,
  isSubmitting,
  onCancel,
  submitLabel,
}: IgStoryFormProps) {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()
  const aiAgents = useAIAgentStore((state) => state.aiAgents)
  const aiAgentOptions = aiAgents.map((agent) => ({
    label: agent.name,
    value: String(agent.id),
  }))

  const [selectStoriesOpen, setSelectStoriesOpen] = useState(false)

  const storyType = useWatch({ control: form.control, name: "story.type" })
  const storyValue = useWatch({ control: form.control, name: "story.value" })

  const replyType = useWatch({ control: form.control, name: "reply.type" })
  const includeKeywordsType = useWatch({
    control: form.control,
    name: "includeKeywords.type",
  })

  const replyTypeOptions = [
    { label: t("instagramStoryAutomation.replyType.text"), value: "text" },
    { label: t("instagramStoryAutomation.replyType.flow"), value: "flow" },
    {
      label: t("instagramStoryAutomation.replyType.AIAgent"),
      value: "AIAgent",
    },
    { label: t("instagramStoryAutomation.replyType.none"), value: "none" },
  ]

  const storyTypeOptions = [
    { label: t("instagramStoryAutomation.storyType.all"), value: "all" },
    {
      label: t("instagramStoryAutomation.storyType.specificStories"),
      value: "storyIds",
    },
  ]

  const includeKeywordsTypeOptions = [
    { label: t("instagramStoryAutomation.keywordsType.all"), value: "all" },
    {
      label: t("instagramStoryAutomation.keywordsType.equal"),
      value: "equal",
    },
    {
      label: t("instagramStoryAutomation.keywordsType.contain"),
      value: "contain",
    },
  ]

  return (
    <form className="m-auto w-full max-w-200 space-y-6" onSubmit={onSubmit}>
      <InputField label={t("fields.name.label")} name="name" required />

      <Card>
        <CardHeader>
          <CardTitle>{t("instagramStoryAutomation.card.targeting")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 space-y-4">
          <RadioGroupField
            description={t(
              "instagramStoryAutomation.trackStoryReplyOnDescription",
            )}
            descriptionType="tooltip"
            label={t("instagramStoryAutomation.trackStoryReplyOn")}
            name="story.type"
            options={storyTypeOptions}
            orientation="horizontal"
            required
          />

          {storyType === "storyIds" && (
            <>
              <Button
                onClick={() => setSelectStoriesOpen(true)}
                type="button"
                variant="outline"
              >
                {t("instagramStoryAutomation.chooseSpecificStories")}
                {storyValue.length > 0 && ` (${storyValue.length})`}
              </Button>
              <SelectInstagramStoriesDialog
                onChange={(ids) =>
                  form.setValue("story.value", ids, { shouldValidate: true })
                }
                onOpenChange={setSelectStoriesOpen}
                open={selectStoriesOpen}
                value={storyValue}
              />
            </>
          )}

          <div className="flex flex-col gap-2 space-y-2">
            <RadioGroupField
              description={t("instagramStoryAutomation.replyDescription")}
              descriptionType="tooltip"
              label={t("instagramStoryAutomation.reply")}
              name="reply.type"
              options={replyTypeOptions}
              orientation="horizontal"
              required
            />
            {replyType === "text" && (
              <TiptapEditorField
                channels={["instagram"]}
                label={t("instagramStoryAutomation.replyMessage")}
                name="reply.value"
                placeholder={t(
                  "instagramStoryAutomation.replyMessagePlaceholder",
                )}
                required
              />
            )}
            {replyType === "flow" && (
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("fields.flow.label")}
                name="reply.value"
                options={flowOptions}
                placeholder={t("actions.pleaseSelect")}
                required
              />
            )}
            {replyType === "AIAgent" && (
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("fields.aiAgent.label")}
                name="reply.value"
                options={aiAgentOptions}
                placeholder={t("actions.pleaseSelect")}
                required
              />
            )}
          </div>

          <div className="flex items-start gap-2">
            <SelectField
              description={t(
                "instagramStoryAutomation.includeKeywordsTypeDescription",
              )}
              descriptionType="tooltip"
              label={t("instagramStoryAutomation.includeKeywordsType")}
              name="includeKeywords.type"
              options={includeKeywordsTypeOptions}
            />
            {includeKeywordsType !== "all" && (
              <div className="w-full">
                <FormField
                  control={form.control}
                  name="includeKeywords.value"
                  render={() => (
                    <FormItem>
                      <FormLabel>
                        {t("instagramStoryAutomation.includeKeywords")}
                      </FormLabel>
                      <FormControl>
                        <TagsInputField
                          name="includeKeywords.value"
                          placeholder={t(
                            "instagramStoryAutomation.keywordsPlaceholder",
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="ghost">
          {t("actions.cancel")}
        </Button>
        <Button
          disabled={!form.formState.isValid || isSubmitting}
          type="submit"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
