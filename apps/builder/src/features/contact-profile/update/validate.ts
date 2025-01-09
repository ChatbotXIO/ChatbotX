import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";
import { updateContactSchema } from "./update-contact-schema";

const zodFunc = () => {
  return z.function().returns(z.string());
};

export const validateEmail = (value: string): string | Error => {
  const validateFunc = zodFunc()
    .args(z.string().email())
    .implement((x: string) => {
      return x;
    });

  try {
    return validateFunc(value);
  } catch (error) {
    return returnValidationErrors(updateContactSchema, {
      _errors: ["Validation Exception"],
      value: {
        _errors: ["Email invalid."],
      },
    });
  }
};

export const validatePhoneNumber = (value: string): string | Error => {
  const validateFunc = zodFunc()
    .args(
      z
        .string()
        .min(10)
        .max(20)
        .regex(/\+?\d{10,20}/),
    )
    .implement((x: string) => {
      return x;
    });

  try {
    return validateFunc(value);
  } catch (error) {
    return returnValidationErrors(updateContactSchema, {
      _errors: ["Validation Exception"],
      value: {
        _errors: ["Phone invalid."],
      },
    });
  }
};
