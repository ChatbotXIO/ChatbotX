import { InputField } from "@aha.chat/ui/components/form/input-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { LinkIcon, Loader2Icon } from "lucide-react"
import { redirect } from "next/navigation"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { authClient } from "@/lib/auth-client"
import { type MagicLinkRequest, magicLinkRequest } from "../schemas/signin"

export const MagicLinkSignIn = () => {
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
    <Form {...magicLinkForm}>
      <form
        className="flex w-full flex-col gap-4"
        onSubmit={magicLinkForm.handleSubmit(onSubmitMagicLinkForm)}
      >
        <InputField
          name="email"
          placeholder={t("signin.email")}
          required
          type="email"
        />

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
          <LinkIcon />
          {t("actions.loginWithMagicLink")}
        </Button>
      </form>
    </Form>
  )
}
