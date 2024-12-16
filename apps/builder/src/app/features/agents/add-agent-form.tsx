"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useTranslate } from "@tolgee/react";



const FormSchema = z.object({
  items: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "You have to select at least one item.",
  }),
});

export function AddAgentForm() {
    const {t} = useTranslate();

    const items = [
      {
        id: "super_admin",
        label: "Super Admin",
      },
      {
        id: "analytics",
        label: t('common.analytics'),
      },
      {
        id: "flows",
        label: t('common.flows'),
      },
      {
        id: "contacts_inbox",
        label: `${t('common.contacts')} / ${t('common.inbox')}`,
      },
      {
        id: "contact_view",
        label: t('common.contactView'),
      },
      {
        id: "broadcasts",
        label: t('common.broadcasts'),
      },
      {
        id: "ecommerce",
        label: t('common.ecommerce'),
      },
    ] as const;

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      items: [],
    },
  });

  function onSubmit(data: z.infer<typeof FormSchema>) {
    toast("You submitted successfully");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="items"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <strong className="text-base ">{t("common.permissions")}</strong>
              </div>
              {items.map((item) => (
                <FormField
                  key={item.id}
                  control={form.control}
                  name="items"
                  render={({ field }) => {
                    return (
                      <FormItem
                        key={item.id}
                        className="flex flex-row items-start space-x-3 space-y-0"
                      >
                        <FormControl>
                          <Checkbox
                            checked={field.value?.includes(item.id)}
                            onCheckedChange={(checked) => {
                              return checked
                                ? field.onChange([...field.value, item.id])
                                : field.onChange(
                                    field.value?.filter(
                                      (value) => value !== item.id,
                                    ),
                                  );
                            }}
                          />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">
                          {item.label}
                        </FormLabel>
                      </FormItem>
                    );
                  }}
                />
              ))}
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-between w-full">
          <Button type="button" variant="outline">
          {t('common.cancel-btn')}
          </Button>
          <Button type="submit">{t('common.continue')}</Button>
        </div>
      </form>
    </Form>
  );
}
