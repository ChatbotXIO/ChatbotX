"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { SliderField } from "@aha.chat/ui/components/form/slider-field"
import { SwitchField } from "@aha.chat/ui/components/form/switch-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm } from "react-hook-form"
import type { AIGenerateTextSchema } from "./schema"
import { aiGenerateTextDefaultFn, aiGenerateTextSchema } from "./schema"

export const AIGenerateTextEditor = () => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const form = useForm<AIGenerateTextSchema>({
    resolver: zodResolver(aiGenerateTextSchema),
    defaultValues: aiGenerateTextDefaultFn(),
    mode: "onChange",
  })

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" variant="outline">
            {t("actions.update")}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("flows.aiGenerateText.label", {
              aiName: t("fields.openai.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col space-y-6">
            <SelectField
              label={t("fields.model.label")}
              name="model"
              options={[]}
              required
            />

            <TextareaField
              label={t("fields.instructions.label")}
              name="instructions"
            />

            <InputField
              isRequired
              label={t("fields.userMessage.label")}
              name="userMessage"
            />

            <SelectField
              label={t("fields.ouputCFId.label")}
              name="ouputCFId"
              required
            />

            <MultiSelectField
              label={t("fields.ouputCFId.label")}
              name="ouputCFId"
              options={[]}
            />

            <SwitchField
              label={t("fields.rememberConversation.label")}
              name="rememberConversation"
              required
            />

            <SliderField
              label={t("fields.temperature.label")}
              name="temperature"
              required
            />

            <SliderField
              label={t("fields.maxOutputTokens.label")}
              name="maxTmaxOutputTokensokens"
              required
            />

            <DialogFooter>
              <DialogClose />
              <Button type="submit">{t("actions.confirm")}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
