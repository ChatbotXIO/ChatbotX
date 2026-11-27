"use client"

import { fileTypes } from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { DirectUploadOrInsertLink } from "@/components/direct-upload"
import {
  POLL_CANDIDATE_DESCRIPTION_MAX,
  POLL_CANDIDATE_NAME_MAX,
} from "../schema/action"
import {
  POLL_MAX_CANDIDATES,
  POLL_MIN_CANDIDATES,
  type PollFormValues,
} from "../schema/form"

function CharCounter({ name, max }: { name: string; max: number }) {
  const { control } = useFormContext<PollFormValues>()
  const value = useWatch({ control, name: name as "name" })
  return (
    <span className="text-end text-muted-foreground text-xs">
      {String(value ?? "").length}/{max}
    </span>
  )
}

export function CandidatesField({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations()
  const { control } = useFormContext<PollFormValues>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "candidates",
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("pollManager.form.candidatesTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((field, index) => (
          <div
            className="flex flex-col gap-3 rounded-md border p-4"
            key={field.id}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">
                {t("pollManager.form.candidateNumber", { number: index + 1 })}
              </span>
              <Button
                disabled={fields.length <= POLL_MIN_CANDIDATES}
                onClick={() => remove(index)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trash2Icon />
                {t("actions.delete")}
              </Button>
            </div>
            <InputField
              label={t("fields.name.label")}
              maxLength={POLL_CANDIDATE_NAME_MAX}
              name={`candidates.${index}.name`}
              required
            />
            <CharCounter
              max={POLL_CANDIDATE_NAME_MAX}
              name={`candidates.${index}.name`}
            />
            <TextareaField
              label={t("fields.description.label")}
              maxLength={POLL_CANDIDATE_DESCRIPTION_MAX}
              name={`candidates.${index}.description`}
            />
            <CharCounter
              max={POLL_CANDIDATE_DESCRIPTION_MAX}
              name={`candidates.${index}.description`}
            />
            <div className="flex flex-col gap-1.5">
              <Label>{t("fields.image.label")}</Label>
              <DirectUploadOrInsertLink
                fileType={fileTypes.enum.image}
                parentName={`candidates.${index}.image`}
                uploadPath={`public/space/${workspaceId}/polls`}
                useMediaLibrary
              />
            </div>
          </div>
        ))}
        <Button
          disabled={fields.length >= POLL_MAX_CANDIDATES}
          onClick={() =>
            append({ name: "", description: "", image: { url: "" } })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon />
          {t("actions.addMore")}
        </Button>
      </CardContent>
    </Card>
  )
}
