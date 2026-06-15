import type { TenantModel } from "@chatbotx.io/database/types"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { PencilIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { storedEmailTemplateSchema } from "./email-template.schema"

type TemplateConfig = {
  settingKey: keyof Pick<
    TenantModel,
    | "signupEmailTemplate"
    | "forgotPasswordEmailTemplate"
    | "magicLinkEmailTemplate"
  >
  type: string
  titleKey:
    | "platformEmailTemplates.sections.signup.title"
    | "platformEmailTemplates.sections.invitation.title"
    | "platformEmailTemplates.sections.forgotPassword.title"
    | "platformEmailTemplates.sections.magicLink.title"
  descriptionKey:
    | "platformEmailTemplates.sections.signup.description"
    | "platformEmailTemplates.sections.invitation.description"
    | "platformEmailTemplates.sections.forgotPassword.description"
    | "platformEmailTemplates.sections.magicLink.description"
}

const TEMPLATES: TemplateConfig[] = [
  {
    settingKey: "signupEmailTemplate",
    type: "signup",
    titleKey: "platformEmailTemplates.sections.signup.title",
    descriptionKey: "platformEmailTemplates.sections.signup.description",
  },
  {
    settingKey: "forgotPasswordEmailTemplate",
    type: "forgotPassword",
    titleKey: "platformEmailTemplates.sections.forgotPassword.title",
    descriptionKey:
      "platformEmailTemplates.sections.forgotPassword.description",
  },
  {
    settingKey: "magicLinkEmailTemplate",
    type: "magicLink",
    titleKey: "platformEmailTemplates.sections.magicLink.title",
    descriptionKey: "platformEmailTemplates.sections.magicLink.description",
  },
]

type PlatformEmailTemplatesSettingsProps = {
  setting: TenantModel | null | undefined
}

export async function PlatformEmailTemplatesSettings({
  setting,
}: PlatformEmailTemplatesSettingsProps) {
  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {t("platformEmailTemplates.description")}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TEMPLATES.map((config) => {
          const template = storedEmailTemplateSchema.parse(
            setting?.[config.settingKey] ?? null,
          )
          const isCustomized = Boolean(template?.body?.trim())

          return (
            <Card className="flex flex-col" key={config.type}>
              <CardHeader className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    {t(config.titleKey)}
                  </CardTitle>
                  <Badge variant={isCustomized ? "default" : "secondary"}>
                    {isCustomized
                      ? t("platformEmailTemplates.status.custom")
                      : t("platformEmailTemplates.status.default")}
                  </Badge>
                </div>
                <CardDescription>{t(config.descriptionKey)}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/manage/email-templates/${config.type}`}>
                    <PencilIcon className="size-3.5" />
                    {t("actions.edit")}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
