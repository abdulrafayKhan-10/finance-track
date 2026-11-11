"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/data/supabase/admin";
import { createClient } from "@/data/supabase/server";
import { requireUser } from "@/lib/auth";
import { MAX_BACKUP_BYTES, parseBackup } from "@/lib/backup";
import { DataError, throwIfError } from "@/lib/errors";
import { type ActionState, failure } from "../action-state";

const RESTORE_ERRORS = {
  FT007: "Restore needs an empty account. Download a backup of what is here, then delete your data first.",
  "23505":
    "These records still exist in another account in this database. Restore into the account they came from, or delete that account first.",
  FT001: "The backup contains a record that doesn't add up, so nothing was restored. Is the file edited or damaged?",
  "23503": "The backup refers to a record that isn't in it, so nothing was restored. Is the file complete?",
  "22P02": "The backup contains a value that isn't valid, so nothing was restored.",
};

export type RestoreResult = { ok: true; summary: string } | { ok: false; error: string };

/** Restores a JSON backup into this (empty) account, all or nothing. */
export async function restoreBackup(text: string): Promise<RestoreResult> {
  await requireUser();
  if (typeof text !== "string" || text.length > MAX_BACKUP_BYTES) {
    return { ok: false, error: "The file is too large to restore (max 10 MB)." };
  }
  const parsed = parseBackup(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("restore_backup", { p: parsed.data });
    throwIfError(error);
    revalidatePath("/", "layout");
    const counts = (data ?? {}) as Record<string, number>;
    return {
      ok: true,
      summary: `Restored ${counts.accounts ?? 0} accounts, ${counts.transactions ?? 0} transactions and ${counts.assets ?? 0} assets.`,
    };
  } catch (error) {
    return { ok: false, error: failure(error, RESTORE_ERRORS).error ?? "Restore failed." };
  }
}

/** Deletes every financial record, keeping the login. Requires typing DELETE. */
export async function deleteMyData(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") {
    return { fieldErrors: { confirm: "Type DELETE in capitals to confirm." } };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_my_data");
    throwIfError(error);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/", "layout");
  return { success: "All your financial records were deleted. Your login and settings remain." };
}

/**
 * Permanently deletes the auth account and, by cascade, every row it owns.
 * Re-checks the password first so a left-open session can't do it alone.
 */
export async function deleteAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "Account deletion needs the server secret key (SUPABASE_SECRET_KEY) to be configured. You can still delete all your data above.",
    };
  }
  if (
    String(formData.get("confirm") ?? "")
      .trim()
      .toLowerCase() !== (user.email ?? "").toLowerCase()
  ) {
    return { fieldErrors: { confirm: "Type your email address exactly to confirm." } };
  }
  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0)
    return { fieldErrors: { password: "Enter your password." } };
  try {
    const supabase = await createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email ?? "", password });
    if (authError) return { fieldErrors: { password: "That password is not correct." } };
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new DataError("account_delete_failed");
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    return failure(error);
  }
  redirect("/login?deleted=1");
}
