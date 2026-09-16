"use client"

import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import {
  MM_MAX_QUICK_REPLIES,
  MM_QUICK_REPLY_TITLE_MAX,
  type MmQuickReply,
  mmQuickReplyActionDefaultFn,
  mmQuickReplyDefaultFn,
  mmQuickReplySchema,
} from "../../schema/content"
import { ButtonActionEditor } from "./button-action-editor"
import { ItemListField } from "./item-list-field"

/**
 * The fields of one quick reply, bound to the editor dialog's own form.
 *
 * Only a text reply carries a title and an action. Tapping a phone or email
 * reply sends the contact's own value back, so both the title and the action
 * picker are hidden for those — and the stale action is cleared, since leaving
 * a half-filled one behind would keep the item invalid with no visible field to
 * fix it.
 */
function QuickReplyFields() {
  const t = useTranslations()
  const { control, getValues, setValue } = useFormContext()
  const contentType = useWatch({ control, name: "contentType" }) as
    | string
    | undefined

  const onContentTypeChange = (value?: string) => {
    if (value === "text") {
      if (!getValues("action")) {
        setValue("action", mmQuickReplyActionDefaultFn(), {
          shouldValidate: true,
        })
      }
      return
    }

    setValue("action", undefined, { shouldValidate: true })
  }

  return (
    <>
      <SelectField
        label={t("facebookMarketingMessages.fields.templateType")}
        name="contentType"
        options={[
          { value: "text", label: t("fields.text.label") },
          { value: "user_phone_number", label: t("fields.phone.label") },
          { value: "user_email", label: t("fields.email.label") },
        ]}
        required
        triggerValueChange={onContentTypeChange}
      />

      {contentType === "text" && (
        <>
          <InputField
            label={t("fields.title.placeholder")}
            maxLength={MM_QUICK_REPLY_TITLE_MAX}
            name="title"
            required
          />

          <ButtonActionEditor allowWebUrl={false} parentName="action" />
        </>
      )}
    </>
  )
}

/**
 * Meta allows up to 13 quick replies — NOT the flow package's 10 — and offers
 * no URL quick reply, hence `allowWebUrl={false}` on the action editor.
 *
 * `user_phone_number` and `user_email` carry no title: Facebook renders the
 * contact's own value as the label, so the chip falls back to naming the type.
 *
 * Chips wrap across one line and the action lives in the dialog, mirroring
 * `react-flow/nodes/editor.tsx`'s quick replies.
 */
export function QuickReplyListField({ name }: { name: string }) {
  const t = useTranslations()

  // A literal map, never a runtime key handed to `t()`.
  const contentTypeLabels: Record<MmQuickReply["contentType"], string> = {
    text: t("fields.text.label"),
    user_phone_number: t("fields.phone.label"),
    user_email: t("fields.email.label"),
  }

  return (
    <ItemListField<MmQuickReply>
      addLabel={t("fields.quickReply.label")}
      defaultItem={mmQuickReplyDefaultFn}
      dialogTitle={t("messages.editFeature", {
        feature: t("fields.quickReply.label"),
      })}
      inline
      label={t("facebookMarketingMessages.fields.quickReplies")}
      limitMessage={t("flows.quickReplies.limitReached", {
        max: MM_MAX_QUICK_REPLIES,
      })}
      max={MM_MAX_QUICK_REPLIES}
      name={name}
      renderRow={(quickReply) =>
        (quickReply.contentType === "text" && quickReply.title) ||
        contentTypeLabels[quickReply.contentType]
      }
      schema={mmQuickReplySchema}
    >
      <QuickReplyFields />
    </ItemListField>
  )
}
