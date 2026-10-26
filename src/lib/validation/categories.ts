import { z } from "zod";
import { checkbox, formObject, requiredText } from "./form";
import { type FieldErrors, fieldErrors } from "./auth";

const optionalUuid = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.uuid().safeParse(v).success, { error: "Choose a valid category." });

const createSchema = z.object({
  name: requiredText(60, "a name"),
  kind: z.enum(["income", "expense"], { error: "Choose income or expense." }),
  parent_id: optionalUuid,
});

const updateSchema = z.object({
  name: requiredText(60, "a name"),
  parent_id: optionalUuid,
  is_archived: checkbox,
});

type Result<T> = { ok: true; values: T } | { ok: false; fieldErrors: FieldErrors };

export function parseNewCategory(formData: FormData): Result<z.infer<typeof createSchema>> {
  const r = createSchema.safeParse(formObject(formData));
  return r.success ? { ok: true, values: r.data } : { ok: false, fieldErrors: fieldErrors(r.error) };
}

export function parseCategoryUpdate(formData: FormData): Result<z.infer<typeof updateSchema>> {
  const r = updateSchema.safeParse(formObject(formData));
  return r.success ? { ok: true, values: r.data } : { ok: false, fieldErrors: fieldErrors(r.error) };
}
