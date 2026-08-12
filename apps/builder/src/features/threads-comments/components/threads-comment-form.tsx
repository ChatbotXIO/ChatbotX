"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
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
import { useEffect, useRef } from "react"
import type { UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { useAIAgentStore } from "@/features/ai-agents/provider/ai-agent-store-context"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import type { CreateThreadsCommentRequest } from "../schema/action"

type Props = {
  form: UseFormReturn<CreateThreadsCommentRequest>
  isSubmitting: boolean
  submitLabel: string
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}

export function ThreadsCommentForm({
  form,
  isSubmitting,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()
  const aiAgents = useAIAgentStore((state) => state.aiAgents)
  const replyType = useWatch({
    control: form.control,
    name: "publicReply.type",
  })
  const postType = useWatch({ control: form.control, name: "post.type" })
  const includeKeywordsType = useWatch({
    control: form.control,
    name: "includeKeywords.type",
  })
  const replyAfterType = useWatch({
    control: form.control,
    name: "replyAfter.type",
  })
  const aiAgentOptions = aiAgents.map((agent) => ({
    label: agent.name,
    value: String(agent.id),
  }))
  const previousReplyType = useRef(replyType)

  const requiresDelayValue = ["seconds", "minutes", "hours"].includes(
    replyAfterType,
  )

  useEffect(() => {
    if (postType === "all") {
      form.setValue("post.value", [], {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [form, postType])

  useEffect(() => {
    if (includeKeywordsType === "all") {
      form.setValue("includeKeywords.value", [], {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [form, includeKeywordsType])

  useEffect(() => {
    const previous = previousReplyType.current
    if (replyType === "none") {
      form.setValue("publicReply.value", null, {
        shouldDirty: true,
        shouldValidate: true,
      })
    } else if (replyType !== previous) {
      form.setValue("publicReply.value", "", {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
    previousReplyType.current = replyType
  }, [form, replyType])

  useEffect(() => {
    if (!requiresDelayValue) {
      form.setValue("replyAfter.value", 0, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [form, requiresDelayValue])

  return (
    <form className="m-auto w-full max-w-4xl space-y-6" onSubmit={onSubmit}>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <InputField label={t("fields.name.label")} name="name" required />
          <p className="text-muted-foreground text-sm">
            {t("threadsCommentAutomation.publicOnlyNote")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("threadsCommentAutomation.card.targeting")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroupField
            label={t("threadsCommentAutomation.trackCommentsOn")}
            name="post.type"
            options={[
              {
                label: t("threadsCommentAutomation.postType.all"),
                value: "all",
              },
              {
                label: t("threadsCommentAutomation.postType.specificPosts"),
                value: "postIds",
              },
            ]}
            orientation="horizontal"
            required
          />

          {postType === "postIds" ? (
            <FormField
              control={form.control}
              name="post.value"
              render={() => (
                <FormItem>
                  <FormLabel>
                    {t("threadsCommentAutomation.specificPostIds")}
                  </FormLabel>
                  <FormControl>
                    <TagsInputField
                      name="post.value"
                      placeholder={t(
                        "threadsCommentAutomation.postIdPlaceholder",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          <RadioGroupField
            description={t("threadsCommentAutomation.publicReplyDescription")}
            descriptionType="tooltip"
            label={t("threadsCommentAutomation.publicReply")}
            name="publicReply.type"
            options={[
              {
                label: t("threadsCommentAutomation.replyType.text"),
                value: "text",
              },
              {
                label: t("threadsCommentAutomation.replyType.flow"),
                value: "flow",
              },
              {
                label: t("threadsCommentAutomation.replyType.AIAgent"),
                value: "AIAgent",
              },
              {
                label: t("threadsCommentAutomation.replyType.none"),
                value: "none",
              },
            ]}
            orientation="horizontal"
            required
          />

          {replyType === "text" ? (
            <TextareaField
              label={t("threadsCommentAutomation.replyMessage")}
              name="publicReply.value"
              required
            />
          ) : null}
          {replyType === "flow" ? (
            <ComboboxField
              label={t("threadsCommentAutomation.replyFlow")}
              name="publicReply.value"
              options={flowOptions}
              required
            />
          ) : null}
          {replyType === "AIAgent" ? (
            <ComboboxField
              label={t("threadsCommentAutomation.replyAIAgent")}
              name="publicReply.value"
              options={aiAgentOptions}
              required
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("threadsCommentAutomation.card.filters")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SelectField
            label={t("threadsCommentAutomation.includeKeywordsType")}
            name="includeKeywords.type"
            options={[
              {
                label: t("threadsCommentAutomation.keywordsType.all"),
                value: "all",
              },
              {
                label: t("threadsCommentAutomation.keywordsType.equal"),
                value: "equal",
              },
              {
                label: t("threadsCommentAutomation.keywordsType.contain"),
                value: "contain",
              },
            ]}
            required
          />

          {includeKeywordsType === "all" ? null : (
            <FormField
              control={form.control}
              name="includeKeywords.value"
              render={() => (
                <FormItem>
                  <FormLabel>
                    {t("threadsCommentAutomation.includeKeywords")}
                  </FormLabel>
                  <FormControl>
                    <TagsInputField
                      name="includeKeywords.value"
                      placeholder={t(
                        "threadsCommentAutomation.keywordsPlaceholder",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="excludeKeywords"
            render={() => (
              <FormItem>
                <FormLabel>
                  {t("threadsCommentAutomation.excludeKeywords")}
                </FormLabel>
                <FormControl>
                  <TagsInputField
                    name="excludeKeywords"
                    placeholder={t(
                      "threadsCommentAutomation.keywordsPlaceholder",
                    )}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <SwitchField
            label={t("threadsCommentAutomation.options.replyToNewContactsOnly")}
            name="options.replyToNewContactsOnly"
            required
          />
          <SwitchField
            label={t(
              "threadsCommentAutomation.options.replyOncePerUserPerPost",
            )}
            name="options.replyOncePerUserPerPost"
            required
          />
          <SwitchField
            label={t(
              "threadsCommentAutomation.options.replyToUsersWhoCommentedOnOtherPosts",
            )}
            name="options.replyToUsersWhoCommentedOnOtherPosts"
            required
          />
          <SwitchField
            label={t("threadsCommentAutomation.options.ignoreCommentReplies")}
            name="options.ignoreCommentReplies"
            required
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("threadsCommentAutomation.card.replyTiming")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SelectField
            label={t("threadsCommentAutomation.replyAfter")}
            name="replyAfter.type"
            options={[
              {
                label: t("threadsCommentAutomation.replyAfterType.immediately"),
                value: "immediately",
              },
              {
                label: t("threadsCommentAutomation.replyAfterType.seconds"),
                value: "seconds",
              },
              {
                label: t("threadsCommentAutomation.replyAfterType.minutes"),
                value: "minutes",
              },
              {
                label: t("threadsCommentAutomation.replyAfterType.hours"),
                value: "hours",
              },
              {
                label: t(
                  "threadsCommentAutomation.replyAfterType.randomWithin3Minutes",
                ),
                value: "randomWithin3Minutes",
              },
              {
                label: t(
                  "threadsCommentAutomation.replyAfterType.randomWithin5Minutes",
                ),
                value: "randomWithin5Minutes",
              },
              {
                label: t(
                  "threadsCommentAutomation.replyAfterType.randomWithin10Minutes",
                ),
                value: "randomWithin10Minutes",
              },
              {
                label: t(
                  "threadsCommentAutomation.replyAfterType.randomWithin20Minutes",
                ),
                value: "randomWithin20Minutes",
              },
              {
                label: t(
                  "threadsCommentAutomation.replyAfterType.randomWithin30Minutes",
                ),
                value: "randomWithin30Minutes",
              },
              {
                label: t(
                  "threadsCommentAutomation.replyAfterType.randomWithin60Minutes",
                ),
                value: "randomWithin60Minutes",
              },
            ]}
            required
          />
          {requiresDelayValue ? (
            <InputNumberField
              label={t("threadsCommentAutomation.replyAfterValue")}
              min={1}
              name="replyAfter.value"
              required
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <button
          className="rounded-md border px-4 py-2 text-sm"
          onClick={onCancel}
          type="button"
        >
          {t("actions.cancel")}
        </button>
        <button
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
          disabled={isSubmitting}
          type="submit"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
