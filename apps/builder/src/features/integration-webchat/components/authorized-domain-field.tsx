import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"

export default function AuthorizedDomainField() {
  const t = useTranslations()

  const { control } = useFormContext()
  const {
    fields: authorizedDomains,
    append: appendAuthorizedDomains,
    remove: removeAuthorizedDomains,
  } = useFieldArray({
    control,
    name: "authorizedDomains",
  })

  const handleAddDomain = useCallback(() => {
    appendAuthorizedDomains({
      value: "",
    })
  }, [appendAuthorizedDomains])

  const handleRemoveDomain = useCallback(
    (index: number) => {
      removeAuthorizedDomains(index)
    },
    [removeAuthorizedDomains],
  )

  return (
    <div className="space-y-2">
      <Label htmlFor="authorizedDomains">
        {t("fields.authorizedDomain.label", { plural: 1 })}
      </Label>
      <p className="text-muted-foreground text-sm">
        {t("fields.authorizedDomain.description")}
      </p>
      {authorizedDomains.map((field, index) => (
        <div className="flex gap-2" key={field.id}>
          <InputField name={`authorizedDomains.${index}.value`} />

          <Button
            aria-label={t("actions.delete")}
            onClick={() => handleRemoveDomain(index)}
            type="button"
            variant="outline"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button
        onClick={handleAddDomain}
        size="sm"
        type="button"
        variant="outline"
      >
        <PlusIcon className="h-4 w-4" />
        {t("actions.addFeature", {
          feature: t("fields.authorizedDomain.label", { plural: 0 }),
        })}
      </Button>
    </div>
  )
}
