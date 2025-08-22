"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import z from "zod"
import { authClient } from "@/lib/auth-client"

const magicLinkRequest = z.object({
  email: z.string().email(),
})
type MagicLinkRequest = z.infer<typeof magicLinkRequest>

export const SignInForm = ({
  callbackUrl,
  ...props
}: {
  callbackUrl?: string
}) => {
  const t = useTranslations()
  const magicLinkForm = useForm<MagicLinkRequest>({
    resolver: zodResolver(magicLinkRequest),
    defaultValues: {
      email: "",
    },
    mode: "onChange",
  })

  const onSubmitMagicLinkForm = async (input: MagicLinkRequest) => {
    const { data, error } = await authClient.signIn.magicLink({
      email: input.email,
    })

    if (data) {
      toast.success("We sent verification URL to your email")
      redirect("/signin/magic-link-sent")
    } else {
      toast.error(error.message)
    }
  }

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("signin.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {/* <div className="flex flex-col space-y-4 items-center">
              <GoogleButton
                className="w-full"
                onClick={async () => {
                  await authClient.signIn.social({
                    provider: "google",
                  })
                }}
              />
            </div>
            <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
              <span className="relative z-10 bg-background px-2 text-muted-foreground">
                {t("signin.or")}
              </span>
            </div> */}

            <Form {...magicLinkForm}>
              <form
                className="flex w-full flex-col gap-4"
                onSubmit={magicLinkForm.handleSubmit(onSubmitMagicLinkForm)}
              >
                <InputField isRequired label="Email" name="email" />

                <Button
                  className="w-full"
                  disabled={
                    !magicLinkForm.formState.isValid ||
                    magicLinkForm.formState.isSubmitting
                  }
                  type="submit"
                >
                  {magicLinkForm.formState.isSubmitting && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  {t("actions.continue")}
                </Button>
              </form>
            </Form>
          </div>
        </CardContent>
      </Card>

      <div className="text-balance text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
        {t("signin.acceptTermsAndPolicy", {
          termsOfService: (
            <Link href="/terms-of-service">{t("signin.termsOfService")}</Link>
          ),
          privacyPolicy: (
            <Link href="/privacy-policy">{t("signin.privacyPolicy")}</Link>
          ),
        })}
      </div>
    </div>
  )
}
