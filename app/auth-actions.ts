"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSupabase } from "./lib/supabase";
import { safeNextPath, startPath } from "./lib/urls";
import { currentLocale } from "./lib/locale-server";
import { tx, type Locale } from "./lib/locale";

export type AuthState = {
  error?: string;
  notice?: string;
  values: { email?: string; name?: string; next?: string };
};

const MIN_PASSWORD = 8;

export async function signIn(_state: AuthState, formData: FormData): Promise<AuthState> {
  const locale = await currentLocale();
  const email = text(formData, "email").toLowerCase();
  const password = raw(formData, "password");
  const next = safeNextPath(text(formData, "next"));

  const supabase = await requireSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translate(error.message, locale), values: { email, next } };

  revalidatePath("/", "layout");
  redirect(startPath(next));
}

/**
 * Sets the new password, using the session the recovery link established.
 *
 * Without that session there is nobody to update, so this refuses rather than
 * guessing — an expired link should send somebody back to ask for a new one.
 */
export async function updatePassword(_state: AuthState, formData: FormData): Promise<AuthState> {
  const locale = await currentLocale();
  const password = raw(formData, "password");
  const confirm = raw(formData, "confirm");

  if (password.length < MIN_PASSWORD) {
    return { error: tx(locale, `Kata sandi harus terdiri dari minimal ${MIN_PASSWORD} karakter.`, `Your password must be at least ${MIN_PASSWORD} characters.`), values: {} };
  }
  if (password !== confirm) return { error: tx(locale, "Konfirmasi kata sandi tidak cocok.", "The password confirmation does not match."), values: {} };

  const supabase = await requireSupabase();
  const { data: session } = await supabase.auth.getUser();
  if (!session.user) {
    return {
      error:
        tx(locale, "Tautan ini telah kedaluwarsa atau sudah digunakan. Minta tautan baru melalui “Lupa kata sandi”.", "This link has expired or has already been used. Request a new one through “Forgot password.”"),
      values: {},
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: translate(error.message, locale), values: {} };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await requireSupabase();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Passwords keep their whitespace — trimming would silently change them. */
function raw(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Supabase answers in English; these are the ones people actually hit. */
function translate(message: string, locale: Locale): string {
  const known: Record<string, { id: string; en: string }> = {
    "Invalid login credentials": { id: "Alamat email atau kata sandi salah.", en: "The email address or password is incorrect." },
    "Email not confirmed": { id: "Alamat email belum dikonfirmasi. Periksa kotak masukmu terlebih dahulu.", en: "Your email address has not been confirmed. Check your inbox first." },
    "User already registered": { id: "Alamat email ini sudah terdaftar. Coba masuk ke akunmu.", en: "This email address is already registered. Try signing in instead." },
    "New password should be different from the old password.": {
      id: "Kata sandi baru harus berbeda dari kata sandi lama.",
      en: "Your new password must be different from the old one.",
    },
  };

  const copy = known[message];
  return copy ? tx(locale, copy.id, copy.en) : message;
}
