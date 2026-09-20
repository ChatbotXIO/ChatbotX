"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
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
import { InfoIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef } from "react"
import type { UseFormReturn } from "react-hook-form"
import { useWatch } from "react-hook-form"
import { toast } from "sonner"
import { useAIAgentSelectOptions } from "@/features/ai-agents/hooks/use-ai-agents"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { useWorkspaceId } from "@/hooks/routing"
import type { CreateTiktokCommentRequest } from "../schema/action"

const REPLY_AFTER_TYPES = [
  "immediately",
  "seconds",
  "minutes",
  "hours",
  "randomWithin3Minutes",
  "randomWithin5Minutes",
  "randomWithin10Minutes",
  "randomWithin20Minutes",
  "randomWithin30Minutes",
  "randomWithin60Minutes",
] as const

const SHOW_COMMENTS_AFTER_VALUES = [
  "none",
  "6h",
  "12h",
  "1d",
  "2d",
  "3d",
  "4d",
  "5d",
  "6d",
  "7d",
  "8d",
  "9d",
  "10d",
] as const

type Props = {
  form: UseFormReturn<CreateTiktokCommentRequest>
  isSubmitting: boolean
  submitLabel: string
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}

export function TiktokCommentForm({
  form,
  isSubmitting,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()
  const { options: aiAgentOptions, isError: isAIAgentsError } =
    useAIAgentSelectOptions(useWorkspaceId())
  const replyType = useWatch({
    control: form.control,
    name: "publicReply.type",
  })
  const privateReplyType = useWatch({
    control: form.control,
    name: "privateReply.type",
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
  const hideAll = useWatch({ control: form.control, name: "hideComments.all" })
  const hideHasKeywords = useWatch({
    control: form.control,
    name: "hideComments.hasKeywords",
  })
  const previousReplyType = useRef(replyType)

  const requiresDelayValue = ["seconds", "minutes", "hours"].includes(
    replyAfterType,
  )

  useEffect(() => {
    if (isAIAgentsError) {
      toast.error(t("fields.aiAgent.loadError"))
    }
  }, [isAIAgentsError, t])

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

  // Clearing the keyword list when the switch goes off keeps the stored value
  // consistent with what the form shows, so a re-opened automation cannot
  // display keywords that no longer apply.
  useEffect(() => {
    if (!hideHasKeywords) {
      form.setValue("hideComments.keywords", [], {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [form, hideHasKeywords])

  return (
    <form className="m-auto w-full max-w-4xl space-y-6" onSubmit={onSubmit}>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <InputField label={t("fields.name.label")} name="name" required />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("tiktokCommentAutomation.card.targeting")}</CardTitle>
          <CardDescription>
            {t("tiktokCommentAutomation.deliveryDelayNote")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroupField
            label={t("tiktokCommentAutomation.trackCommentsOn")}
            name="post.type"
            options={[
              {
                label: t("tiktokCommentAutomation.postType.all"),
                value: "all",
              },
              {
                label: t("tiktokCommentAutomation.postType.specificPosts"),
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
                    {t("tiktokCommentAutomation.specificPostIds")}
                  </FormLabel>
                  <FormControl>
                    <TagsInputField
                      name="post.value"
                      placeholder={t(
                        "tiktokCommentAutomation.postIdPlaceholder",
                      )}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          <RadioGroupField
            description={t("tiktokCommentAutomation.publicReplyDescription")}
            descriptionType="tooltip"
            label={t("tiktokCommentAutomation.publicReply")}
            name="publicReply.type"
            options={[
              {
                label: t("tiktokCommentAutomation.replyType.text"),
                value: "text",
              },
              {
                label: t("tiktokCommentAutomation.replyType.flow"),
                value: "flow",
              },
              {
                label: t("tiktokCommentAutomation.replyType.AIAgent"),
                value: "AIAgent",
              },
              {
                label: t("tiktokCommentAutomation.replyType.none"),
                value: "none",
              },
            ]}
            orientation="horizontal"
            required
          />

          {replyType === "text" ? (
            <TextareaField
              label={t("tiktokCommentAutomation.replyMessage")}
              name="publicReply.value"
              required
            />
          ) : null}
          {replyType === "flow" ? (
            <ComboboxField
              label={t("tiktokCommentAutomation.replyFlow")}
              name="publicReply.value"
              options={flowOptions}
              required
            />
          ) : null}
          {replyType === "AIAgent" ? (
            <ComboboxField
              label={t("tiktokCommentAutomation.replyAIAgent")}
              name="publicReply.value"
              options={aiAgentOptions}
              required
            />
          ) : null}

          {/* No `flow` option: Comment-to-Message grants one comment-anchored
              message per comment, and TikTok's flow runner needs a conversation
              for every step after the first. */}
          <RadioGroupField
            description={t("tiktokCommentAutomation.privateReplyDescription")}
            descriptionType="tooltip"
            label={t("tiktokCommentAutomation.privateReply")}
            name="privateReply.type"
            options={[
              {
                label: t("tiktokCommentAutomation.replyType.text"),
                value: "text",
              },
              {
                label: t("tiktokCommentAutomation.replyType.AIAgent"),
                value: "AIAgent",
              },
              {
                label: t("tiktokCommentAutomation.replyType.none"),
                value: "none",
              },
            ]}
            orientation="horizontal"
            required
          />

          {privateReplyType === "text" ? (
            <TextareaField
              label={t("tiktokCommentAutomation.privateReplyMessage")}
              name="privateReply.value"
              required
            />
          ) : null}
          {privateReplyType === "AIAgent" ? (
            <ComboboxField
              label={t("tiktokCommentAutomation.replyAIAgent")}
              name="privateReply.value"
              options={aiAgentOptions}
              required
            />
          ) : null}

          {/* Persistent, not a tooltip: TikTok decides which comments may be
              DM'd, so most matched comments will get the public reply only.
              Without saying so here, that reads as the automation being broken. */}
          {privateReplyType === "none" ? null : (
            <Alert>
              <InfoIcon />
              <AlertTitle>
                {t("tiktokCommentAutomation.privateReplyHighIntentTitle")}
              </AlertTitle>
              <AlertDescription>
                {t("tiktokCommentAutomation.privateReplyHighIntentNotice")}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("tiktokCommentAutomation.card.filters")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SelectField
            label={t("tiktokCommentAutomation.includeKeywordsType")}
            name="includeKeywords.type"
            options={[
              {
                label: t("tiktokCommentAutomation.keywordsType.all"),
                value: "all",
              },
              {
                label: t("tiktokCommentAutomation.keywordsType.equal"),
                value: "equal",
              },
              {
                label: t("tiktokCommentAutomation.keywordsType.contain"),
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
                    {t("tiktokCommentAutomation.includeKeywords")}
                  </FormLabel>
                  <FormControl>
                    <TagsInputField
                      name="includeKeywords.value"
                      placeholder={t(
                        "tiktokCommentAutomation.keywordsPlaceholder",
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
                  {t("tiktokCommentAutomation.excludeKeywords")}
                </FormLabel>
                <FormControl>
                  <TagsInputField
                    name="excludeKeywords"
                    placeholder={t(
                      "tiktokCommentAutomation.keywordsPlaceholder",
                    )}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <SwitchField
            label={t("tiktokCommentAutomation.options.replyToNewContactsOnly")}
            name="options.replyToNewContactsOnly"
            required
          />
          <SwitchField
            label={t("tiktokCommentAutomation.options.replyOncePerUserPerPost")}
            name="options.replyOncePerUserPerPost"
            required
          />
          <SwitchField
            label={t(
              "tiktokCommentAutomation.options.replyToUsersWhoCommentedOnOtherPosts",
            )}
            name="options.replyToUsersWhoCommentedOnOtherPosts"
            required
          />
          <SwitchField
            label={t("tiktokCommentAutomation.options.ignoreCommentReplies")}
            name="options.ignoreCommentReplies"
            required
          />
          {/* TikTok supports liking a comment (`business/comment/like/`);
              Threads does not, which is why this switch exists here and not
              on the Threads form. */}
          <SwitchField
            label={t("tiktokCommentAutomation.options.likeUserComment")}
            name="options.likeUserComment"
            required
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("tiktokCommentAutomation.card.hideComments")}
          </CardTitle>
          <CardDescription>
            {t("tiktokCommentAutomation.hideCommentsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwitchField
            label={t("tiktokCommentAutomation.hide.all")}
            name="hideComments.all"
            required
          />
          {/* The per-rule switches are pointless once everything is hidden. */}
          {hideAll ? null : (
            <>
              <SwitchField
                label={t("tiktokCommentAutomation.hide.hasPhoneNumber")}
                name="hideComments.hasPhoneNumber"
                required
              />
              <SwitchField
                label={t("tiktokCommentAutomation.hide.hasLink")}
                name="hideComments.hasLink"
                required
              />
              <SwitchField
                label={t("tiktokCommentAutomation.hide.hasKeywords")}
                name="hideComments.hasKeywords"
                required
              />
              {hideHasKeywords ? (
                <FormField
                  control={form.control}
                  name="hideComments.keywords"
                  render={() => (
                    <FormItem>
                      <FormLabel>
                        {t("tiktokCommentAutomation.hide.keywords")}
                      </FormLabel>
                      <FormControl>
                        <TagsInputField
                          name="hideComments.keywords"
                          placeholder={t(
                            "tiktokCommentAutomation.keywordsPlaceholder",
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </>
          )}
          <SelectField
            label={t("tiktokCommentAutomation.hide.showCommentsAfter")}
            name="hideComments.showCommentsAfter"
            options={SHOW_COMMENTS_AFTER_VALUES.map((value) => ({
              label: t(`tiktokCommentAutomation.showCommentsAfter.${value}`),
              value,
            }))}
            required
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("tiktokCommentAutomation.card.replyTiming")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SelectField
            label={t("tiktokCommentAutomation.replyAfter")}
            name="replyAfter.type"
            options={REPLY_AFTER_TYPES.map((value) => ({
              label: t(`tiktokCommentAutomation.replyAfterType.${value}`),
              value,
            }))}
            required
          />
          {requiresDelayValue ? (
            <InputNumberField
              label={t("tiktokCommentAutomation.replyAfterValue")}
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
