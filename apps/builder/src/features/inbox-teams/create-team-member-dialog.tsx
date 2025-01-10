"use client"

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { T, useTranslate } from '@tolgee/react';
import { Loader2, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createTeamMemberAction } from "./actions/create-team-member-action";
import { createTeamMemberSchema } from "./schemas/create-team-member-schema";
import { MultiSelect } from "@/components/ui/multi-select";

export function CreateTeamMemberDialog({ chatbotId, teamId, listUsers }: { chatbotId: string, teamId: string, listUsers: any }) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(createTeamMemberAction.bind(null, chatbotId, teamId), zodResolver(createTeamMemberSchema), {
    actionProps: {
      onSuccess: () => {
        toast.success(`Tag created successfully`)

        setOpen(false)
        router.refresh()
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
        userIds: []
      }
    },
    errorMapProps: {}
  });

  const userOptions = listUsers.map((user: { id: string; name: string }) => ({
    value: user.id,
    label: user.name,
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <PlusIcon />
            <T keyName="members.addBtn" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('members.create.title')}</DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2">
            <Form {...form}>
              <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
                <FormField
                  control={form.control}
                  name="userIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Users</FormLabel>
                      <FormControl>
                        <MultiSelect
                          options={userOptions}
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          placeholder="Select users"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-4">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel-btn')}</Button>
                  <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                    {t('common.confirm-btn')}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
