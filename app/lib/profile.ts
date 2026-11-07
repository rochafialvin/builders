/**
 * What a profile may carry, and what to say when it does not.
 *
 * The ceilings here are the same ones `profiles` checks in
 * `0001_schema.sql`, `0013_people_directory.sql`, and `0014_profile_links.sql`.
 * They are repeated rather than inferred on purpose: a mismatch would turn a
 * fixable typo into a Postgres constraint error nobody can read.
 *
 * No Next.js or Supabase imports, so `tests/profile.test.mjs` can call these
 * directly.
 */

import { isHttpUrl } from "./brief";
import { githubHandle } from "./oss";
import { tx, type Locale } from "./locale";

export const PROFILE_MAXIMUM = {
  name: 80,
  profession: 80,
  headline: 140,
  bio: 800,
  publicEmail: 254,
  /** website, github, linkedin, x, resume — one ceiling, five columns. */
  link: 300,
} as const;

export const PROFILE_LIMITS = {
  skills: 20,
  fields: 10,
  yearsExperience: 60,
} as const;

/**
 * The raw form values, before skills are split into a list.
 *
 * Only what the site shows today. Years of experience, fields, opportunity
 * status and a résumé link belonged to the talent pool, which left the menu
 * with the directory redesign; the columns stay, and saving this form leaves
 * them as they were. GitHub has a form of its own — see `validateGitHub`.
 */
export type ProfileInput = {
  name: string;
  profession: string;
  headline: string;
  bio: string;
  skills: string;
  website: string;
  publicEmail: string;
  linkedin: string;
  x: string;
};

export type ProfileFieldErrors = Partial<Record<keyof ProfileInput, string>>;

const LINK_FIELDS = ["website", "linkedin", "x"] as const;

const LABELS: Record<keyof ProfileInput, string> = {
  name: "Name",
  profession: "Profession",
  headline: "Your one-line introduction",
  bio: "Short bio",
  skills: "Skills",
  website: "Website",
  publicEmail: "Public email",
  linkedin: "LinkedIn",
  x: "X / Twitter",
};

const TEXT_CEILINGS = {
  name: PROFILE_MAXIMUM.name,
  profession: PROFILE_MAXIMUM.profession,
  headline: PROFILE_MAXIMUM.headline,
  bio: PROFILE_MAXIMUM.bio,
} as const;

/**
 * Everything wrong with a profile, by field.
 *
 * Only `name` is required — a profile that says nothing about its owner is
 * their business. What this refuses is input that would be silently thrown
 * away instead: a link with no scheme, an address that is not an address, a
 * bio past the column's ceiling.
 */
export function validateProfile(input: ProfileInput, locale: Locale = "en"): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};

  const name = input.name.trim();
  if (!name) {
    errors.name = tx(locale, "Masukkan namamu.", "Enter your name.");
  } else if (name.length > PROFILE_MAXIMUM.name) {
    errors.name = tooLong("name", PROFILE_MAXIMUM.name, locale);
  }

  for (const field of ["profession", "headline", "bio"] as const) {
    if (input[field].trim().length > TEXT_CEILINGS[field]) {
      errors[field] = tooLong(field, TEXT_CEILINGS[field], locale);
    }
  }

  for (const field of LINK_FIELDS) {
    const value = input[field].trim();
    if (!value) continue;
    if (!isHttpUrl(value)) {
      errors[field] = tx(locale, `${labelId(field)} harus diawali http:// atau https://.`, `${LABELS[field]} must start with http:// or https://.`);
    } else if (value.length > PROFILE_MAXIMUM.link) {
      errors[field] = tooLong(field, PROFILE_MAXIMUM.link, locale);
    }
  }

  const email = input.publicEmail.trim();
  if (email && !isEmail(email)) {
    errors.publicEmail = tx(locale, "Masukkan alamat email publik yang valid.", "Enter a valid public email address.");
  } else if (email.length > PROFILE_MAXIMUM.publicEmail) {
    errors.publicEmail = tooLong("publicEmail", PROFILE_MAXIMUM.publicEmail, locale);
  }

  return errors;
}

/**
 * The GitHub account as it is stored: `https://github.com/<handle>`, or empty.
 *
 * A username, an `@username` or a profile URL all work — people paste
 * whichever they have open. Anything that is not plainly one GitHub account
 * is refused rather than stored, because the directory's badges, the
 * Activity page and the profile picture are all built from it.
 */
export function validateGitHub(value: string, locale: Locale = "en"): { url: string } | { error: string } {
  const raw = value.trim();
  if (!raw) return { url: "" };
  const handle = githubHandle(raw);
  if (!handle) {
    return {
      error: tx(
        locale,
        "Isi username GitHub-mu (misalnya zikrulihsan) atau tautan profilnya.",
        "Enter your GitHub username (for example zikrulihsan) or a link to your profile.",
      ),
    };
  }
  return { url: `https://github.com/${handle}` };
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * The shape a username must take, same as `profiles_username_format` in
 * `0001_schema.sql`: 2 to 48 characters, lowercase letters, digits or hyphens,
 * starting with a letter or digit.
 */
export const USERNAME_FORMAT = /^[a-z0-9][a-z0-9-]{1,47}$/;

/**
 * Names that are site routes or would read as the site itself. Mirrors
 * `is_reserved_username` in `20261102000000_custom_username.sql`; the database
 * is the real gate, this is the one that gives a kind message before the round
 * trip. Keep the two in step.
 */
export const RESERVED_USERNAMES = new Set([
  "about", "account", "activity", "admin", "api", "auth", "community",
  "dashboard", "directory", "explore", "feedback", "forgot-password",
  "get-started", "help", "how-it-works", "inbox", "leaderboard", "login",
  "logout", "me", "new", "people", "privacy", "profile", "projects",
  "recommend", "register", "search", "settings", "signin", "signup",
  "submit", "support", "terms", "u",
]);

/**
 * A username ready to save, or why it cannot be. The database enforces the same
 * rules and also owns availability and the cooldown, which only it can see.
 */
export function validateUsername(value: string, locale: Locale = "en"): { username: string } | { error: string } {
  const candidate = value.trim().toLowerCase();
  if (!candidate) {
    return { error: tx(locale, "Masukkan username.", "Enter a username.") };
  }
  if (!USERNAME_FORMAT.test(candidate)) {
    return {
      error: tx(
        locale,
        "Username harus 2 sampai 48 karakter: huruf kecil, angka atau tanda hubung, diawali huruf atau angka.",
        "A username is 2 to 48 characters: lowercase letters, digits or hyphens, starting with a letter or digit.",
      ),
    };
  }
  if (RESERVED_USERNAMES.has(candidate)) {
    return { error: tx(locale, "Username itu dipakai oleh sistem.", "That username is used by the system.") };
  }
  return { username: candidate };
}

function tooLong(field: keyof ProfileInput, ceiling: number, locale: Locale): string {
  return tx(locale, `${labelId(field)} terlalu panjang—maksimal ${ceiling} karakter.`, `${LABELS[field]} is too long—at most ${ceiling} characters.`);
}

function labelId(field: keyof ProfileInput): string {
  const labels: Record<keyof ProfileInput, string> = {
    name: "Nama",
    profession: "Profesi",
    headline: "Perkenalan singkat",
    bio: "Bio singkat",
    skills: "Keahlian",
    website: "Situs web",
    publicEmail: "Email publik",
    linkedin: "LinkedIn",
    x: "X / Twitter",
  };
  return labels[field];
}
