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
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { T } from "@/tolgee/server";
import { zodResolver } from "@hookform/resolvers/zod";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { useTranslate } from '@tolgee/react';
import { Loader2, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createTeamAction } from "./actions/create-team-action";
import { createTeamSchema } from "./schemas/create-team-schema";

export function CreateTeamDialog({ chatbotId, allUsers }: { chatbotId: string, allUsers: any }) {
  const { t } = useTranslate();
  const [open, setOpen] = useState(false);
  const router = useRouter()

  const { form, handleSubmitWithAction } = useHookFormAction(createTeamAction.bind(null, chatbotId), zodResolver(createTeamSchema), {
    actionProps: {
      onSuccess: () => {
        toast.success(`Team created successfully`)

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
        name: "",
        userIds: []
      }
    },
    errorMapProps: {}
  });

  const userOptions = allUsers.map((user: { id: string; name: string }) => ({
    value: user.id,
    label: user.name,
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          <T keyName="teams.addBtn" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('teams.create.title')}</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <Form {...form}>
            <form onSubmit={handleSubmitWithAction} className="flex-1 space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
  )
}
