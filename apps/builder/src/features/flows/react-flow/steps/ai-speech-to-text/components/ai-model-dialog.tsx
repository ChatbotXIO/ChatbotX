"use client"

import {
  type AISpeechToTextProvider,
  aiSpeechToTextSchema,
  MUSE_TRANSCRIBE_MAX_KEYWORD_LENGTH,
  MUSE_TRANSCRIBE_MAX_KEYWORDS,
  type MuseVoiceLanguage,
  museVoiceLanguages,
} from "@chatbotx.io/flow-config"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"

// Values stay the English names the Meta API takes; only labels are translated.
const museLanguageLabelKeys = {
  Arabic: "flows.aiSpeechToText.languages.Arabic",
  Bengali: "flows.aiSpeechToText.languages.Bengali",
  Dutch: "flows.aiSpeechToText.languages.Dutch",
  English: "flows.aiSpeechToText.languages.English",
  French: "flows.aiSpeechToText.languages.French",
  German: "flows.aiSpeechToText.languages.German",
  Hebrew: "flows.aiSpeechToText.languages.Hebrew",
  Hindi: "flows.aiSpeechToText.languages.Hindi",
  Indonesian: "flows.aiSpeechToText.languages.Indonesian",
  Italian: "flows.aiSpeechToText.languages.Italian",
  Japanese: "flows.aiSpeechToText.languages.Japanese",
  Kannada: "flows.aiSpeechToText.languages.Kannada",
  Korean: "flows.aiSpeechToText.languages.Korean",
  Malay: "flows.aiSpeechToText.languages.Malay",
  "Mandarin Chinese": "flows.aiSpeechToText.languages.MandarinChinese",
  Marathi: "flows.aiSpeechToText.languages.Marathi",
  Polish: "flows.aiSpeechToText.languages.Polish",
  Portuguese: "flows.aiSpeechToText.languages.Portuguese",
  Spanish: "flows.aiSpeechToText.languages.Spanish",
  Tagalog: "flows.aiSpeechToText.languages.Tagalog",
  Tamil: "flows.aiSpeechToText.languages.Tamil",
  Telugu: "flows.aiSpeechToText.languages.Telugu",
  Thai: "flows.aiSpeechToText.languages.Thai",
  Turkish: "flows.aiSpeechToText.languages.Turkish",
  Vietnamese: "flows.aiSpeechToText.languages.Vietnamese",
} as const satisfies Record<MuseVoiceLanguage, string>

type AIModelDialogProps = {
  parentName: string
  provider: AISpeechToTextProvider
}

export const AIModelDialog = ({ parentName, provider }: AIModelDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { getValues: getParentValues, setValue: setParentValue } =
    useFormContext()

  const form = useForm({
    resolver: zodResolver(aiSpeechToTextSchema),
    defaultValues: getParentValues(parentName),
  })

  useEffect(() => {
    if (!open) {
      return
    }
    form.reset(getParentValues(parentName))
  }, [open, parentName, form, getParentValues])

  const handleSubmit = form.handleSubmit((values) => {
    const currentValues = getParentValues(parentName)

    setParentValue(parentName, {
      ...currentValues,
      ...values,
    })

    setOpen(false)
  })

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            {t("actions.edit")}
          </Button>
        }
      />
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t("fields.flows.aiSpeechToText", {
              aiName: t(getAiProviderLabelKey(provider)),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col space-y-6" onSubmit={handleSubmit}>
            <div className="flex max-h-[calc(100vh-200px)] flex-col space-y-6 overflow-y-auto">
              <CustomFieldSelect
                includeReserved={false}
                label={t("fields.audio.label")}
                name="inputFieldId"
                required
              />

              <CustomFieldSelect
                allowCreate={true}
                includeBotFields
                includeReserved={false}
                label={t("fields.outputFieldId.label")}
                name="outputFieldId"
                required
              />

              {provider === "muse" && (
                <>
                  <Alert>
                    <AlertDescription>
                      {t("flows.aiSpeechToText.muse.formatHint")}
                    </AlertDescription>
                  </Alert>

                  <MultiSelectField
                    description={t(
                      "flows.aiSpeechToText.muse.languageBias.description",
                    )}
                    label={t("flows.aiSpeechToText.muse.languageBias.label")}
                    name="languageBias"
                    options={museVoiceLanguages.options.map((language) => ({
                      label: t(museLanguageLabelKeys[language]),
                      value: language,
                    }))}
                    placeholder={t(
                      "flows.aiSpeechToText.muse.languageBias.placeholder",
                    )}
                  />

                  <TagsInputField
                    description={t(
                      "flows.aiSpeechToText.muse.keywords.description",
                    )}
                    label={t("flows.aiSpeechToText.muse.keywords.label")}
                    maxLength={MUSE_TRANSCRIBE_MAX_KEYWORD_LENGTH}
                    maxTags={MUSE_TRANSCRIBE_MAX_KEYWORDS}
                    name="keywords"
                    placeholder={t(
                      "flows.aiSpeechToText.muse.keywords.placeholder",
                    )}
                  />
                </>
              )}
            </div>

            <DialogFooter className="flex items-end">
              <DialogClose
                render={
                  <Button size="sm" type="button" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button size="sm" type="submit">
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
