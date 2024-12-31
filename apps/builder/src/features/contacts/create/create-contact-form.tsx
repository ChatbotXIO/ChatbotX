"use client"

import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Gender } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks"
import { useTranslate } from '@tolgee/react'
import { AsteriskIcon, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createContactAction } from "./create-contact-action"
import { createContactSchema } from "./create-contact-schema"

export function CreateContactForm({ chatbotId, onSubmmited, onCancelled }: { chatbotId: string, onSubmmited?: () => void, onCancelled?: () => void }) {
  const { t } = useTranslate()

  const { form, handleSubmitWithAction } = useHookFormAction(
    createContactAction.bind(null, chatbotId),
    zodResolver(createContactSchema),
    {
      actionProps: {
        onSuccess: () => {
          toast.success("Contact created successfully")

          onSubmmited && onSubmmited()
        },
        onError: ({ error }) => {
          if (error.serverError) {
            toast.error(error.serverError.message ?? error.serverError)
          }
        }
      },
      formProps: {
        mode: "onChange",
        defaultValues: {
          phoneNumber: "",
          email: "",
          firstName: "",
          lastName: "",
          gender: Gender.Unknown,
        }
      },
      errorMapProps: {}
    }
  );

  const genderLabels: Record<Gender, string> = {
    Male: t('contacts.gender.male'),
    Female: t('contacts.gender.female'),
    Unknown: t('contacts.gender.unknown')
  }

  return (
    <Form {...form}>
      <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
        <FormField control={form.control} name="phoneNumber" render={({ field }) => (
          <FormItem>
            <FormLabel className="inline-flex gap-1">
              {t('contacts.phoneNumber')}
              <AsteriskIcon size={10} color="red" />
            </FormLabel>
            <FormControl>
              <Input placeholder="090xxxxxxx" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>{t('contacts.email')}</FormLabel>
            <FormControl>
              <Input placeholder="email@example.com" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="firstName" render={({ field }) => (
          <FormItem>
            <FormLabel>{t('contacts.firstName')}</FormLabel>
            <FormControl>
              <Input placeholder={t('contacts.firstName')} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="lastName" render={({ field }) => (
          <FormItem>
            <FormLabel>{t('contacts.lastName')}</FormLabel>
            <FormControl>
              <Input placeholder={t('contacts.lastName')} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="gender" render={({ field }) => (
          <FormItem>
            <FormLabel>{t('contacts.gender')}</FormLabel>
            <FormControl>
              <Select value={field.value} name={field.name} onValueChange={field.onChange} defaultValue="unknown">
                <SelectTrigger>
                  <SelectValue onBlur={field.onBlur} ref={field.ref} />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Gender).map((option: Gender) => (
                    <SelectItem value={option} key={option}>{genderLabels[option]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-end gap-4">
          <Button type="button" variant="ghost" onClick={onCancelled}>{t('common.cancel-btn')}</Button>
          <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            {t('common.confirm-btn')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
