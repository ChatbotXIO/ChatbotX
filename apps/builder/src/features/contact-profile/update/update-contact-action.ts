"use server";

import { authActionClient } from "@/lib/safe-action";
import { prisma, User } from "@ahachat.ai/database";
import {
  FieldType,
  UpdateContactBindSchema,
  updateContactBindSchema,
  UpdateContactFieldAction,
  UpdateContactSchema,
  updateContactSchema,
} from "./update-contact-schema";
import { z, ZodError } from "zod";
import { validateEmail, validatePhoneNumber } from "./validate";
import { returnValidationErrors } from "next-safe-action";
import { createContactSchema } from "@/features/contacts/create/create-contact-schema";
const handleUpdateContactField = async (
  contactId: string,
  name: string,
  fieldType: FieldType,
  parsedInput: UpdateContactSchema,
) => {
  if (fieldType === FieldType.AccountField) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId },
    });

    if (!contact) {
      throw new Error("Contact not found.");
    }

    switch (name) {
      case "email":
        validateEmail(parsedInput.value);
        break;
      case "phoneNumber":
        validatePhoneNumber(parsedInput.value);
        break;
    }

    const data: { [name: string]: string } = {};
    data[name] = parsedInput.value;

    await prisma.contact.update({ where: { id: contact.id }, data });
  } else {
    // TODO: update new custom
  }

  return {
    successful: true,
  };
};

const handleDeleteContactField = async (
  contactId: string,
  name: string,
  fieldType: FieldType,
  parsedInput: UpdateContactSchema,
) => {
  if (fieldType === FieldType.AccountField) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId },
    });

    if (!contact) {
      throw new Error("Contact not found.");
    }

    const data: { [name: string]: null } = {};
    data[name] = null;

    await prisma.contact.update({ where: { id: contact.id }, data });
  } else {
    // TODO: remote custom field
  }

  return {
    successful: true,
  };
};

export const updateContactAction = authActionClient
  .schema(updateContactSchema)
  .bindArgsSchemas(updateContactBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [contactId, name, fieldType],
    }: {
      ctx: { user: User };
      parsedInput: UpdateContactSchema;
      bindArgsParsedInputs: UpdateContactBindSchema;
    }) => {
      if (parsedInput.action === UpdateContactFieldAction.Update) {
        return handleUpdateContactField(
          contactId,
          name,
          fieldType,
          parsedInput,
        );
      }

      if (parsedInput.action === UpdateContactFieldAction.Delete) {
        return handleDeleteContactField(
          contactId,
          name,
          fieldType,
          parsedInput,
        );
      }
    },
  );
