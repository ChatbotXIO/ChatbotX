import { tenantService } from "@chatbotx.io/business"
import {
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
  DEFAULT_ACCOUNT_CREDENTIALS_TEMPLATE,
  DEFAULT_FORGOT_PASSWORD_SUBJECT,
  DEFAULT_FORGOT_PASSWORD_TEMPLATE,
  DEFAULT_MAGIC_LINK_SUBJECT,
  DEFAULT_MAGIC_LINK_TEMPLATE,
  DEFAULT_SIGNUP_SUBJECT,
  DEFAULT_SIGNUP_TEMPLATE,
} from "@chatbotx.io/mail"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import {
  type EmailTemplateType,
  emailTemplateTypes,
  storedEmailTemplateSchema,
} from "@/enterprise/features/platform-email-templates/email-template.schema"
import { PlatformEmailTemplateEditor } from "@/enterprise/features/platform-email-templates/platform-email-template-editor"
import { getCurrentUserId } from "@/lib/auth/utils"

type PageProps = {
  params: Promise<{ type: string }>
}

type TemplateConfig = {
  titleKey: string
  descriptionKey: string
  variables: string[]
  settingKey:
    | "signupEmailTemplate"
    | "forgotPasswordEmailTemplate"
    | "magicLinkEmailTemplate"
    | "accountCredentialsEmailTemplate"
  defaultSubject: string
  defaultBody: string
}

const TEMPLATE_CONFIG: Record<EmailTemplateType, TemplateConfig> = {
  signup: {
    titleKey: "platformEmailTemplates.sections.signup.title",
    descriptionKey: "platformEmailTemplates.sections.signup.description",
    variables: ["{{userName}}", "{{verificationUrl}}", "{{brandName}}"],
    settingKey: "signupEmailTemplate",
    defaultSubject: DEFAULT_SIGNUP_SUBJECT,
    defaultBody: DEFAULT_SIGNUP_TEMPLATE,
  },
  forgotPassword: {
    titleKey: "platformEmailTemplates.sections.forgotPassword.title",
    descriptionKey:
      "platformEmailTemplates.sections.forgotPassword.description",
    variables: ["{{userName}}", "{{resetPasswordUrl}}", "{{brandName}}"],
    settingKey: "forgotPasswordEmailTemplate",
    defaultSubject: DEFAULT_FORGOT_PASSWORD_SUBJECT,
    defaultBody: DEFAULT_FORGOT_PASSWORD_TEMPLATE,
  },
  magicLink: {
    titleKey: "platformEmailTemplates.sections.magicLink.title",
    descriptionKey: "platformEmailTemplates.sections.magicLink.description",
    variables: ["{{userName}}", "{{magicUrl}}", "{{brandName}}"],
    settingKey: "magicLinkEmailTemplate",
    defaultSubject: DEFAULT_MAGIC_LINK_SUBJECT,
    defaultBody: DEFAULT_MAGIC_LINK_TEMPLATE,
  },
  accountCredentials: {
    titleKey: "platformEmailTemplates.sections.accountCredentials.title",
    descriptionKey:
      "platformEmailTemplates.sections.accountCredentials.description",
    variables: [
      "{{userName}}",
      "{{loginEmail}}",
      "{{initialPassword}}",
      "{{signInUrl}}",
      "{{brandName}}",
    ],
    settingKey: "accountCredentialsEmailTemplate",
    defaultSubject: DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
    defaultBody: DEFAULT_ACCOUNT_CREDENTIALS_TEMPLATE,
  },
}

export default async function ManageEmailTemplateEditPage({
  params,
}: PageProps) {
  const { type } = await params

  if (!emailTemplateTypes.includes(type as EmailTemplateType)) {
    return notFound()
  }

  const templateType = type as EmailTemplateType
  const config = TEMPLATE_CONFIG[templateType]
  const t = await getTranslations()

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const setting = await tenantService.findByOwner(userId)
  const storedTemplate = storedEmailTemplateSchema.parse(
    setting?.[config.settingKey] ?? null,
  )

  const template = {
    subject: storedTemplate?.subject ?? config.defaultSubject,
    body: storedTemplate?.body ?? config.defaultBody,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          className={buttonVariants({ variant: "outline", size: "icon" })}
          href="/manage/email-templates"
        >
          <ArrowLeftIcon className="size-4 rtl:rotate-180" />
          <span className="sr-only">{t("actions.back")}</span>
        </Link>

        <h3 className="font-bold text-lg sm:text-xl">
          {t(config.titleKey as Parameters<typeof t>[0])}
        </h3>
      </div>

      <PlatformEmailTemplateEditor
        description={t(config.descriptionKey as Parameters<typeof t>[0])}
        template={template}
        title={t(config.titleKey as Parameters<typeof t>[0])}
        type={templateType}
        variables={config.variables}
      />
    </div>
  )
}
