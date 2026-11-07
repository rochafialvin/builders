import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { getSupabase } from "./supabase";
import type { Person } from "./data";
import type { ProfileRow } from "./database.types";
import { availabilityStatus } from "./availability";

export type Viewer = Person & {
  email: string;
  /** A GitHub handle they typed before accounts had to be linked, or empty: what the editor asks them to link. */
  githubTyped: string;
};

type AuthIdentity = {
  id: string;
  email: string;
  userMetadata: Record<string, unknown>;
};

/**
 * The account the request is signed in as, or `null` for a guest.
 *
 * Uses `getClaims()` rather than trusting `getSession()`: the claims are
 * verified against Supabase's signing key. With the default asymmetric JWT
 * keys this happens locally after the JWKS key is cached, rather than calling
 * the Auth user endpoint on every navigation. Pages decide what to show from
 * this, but the database decides what may actually happen — see
 * `supabase/migrations/0003_policies.sql`.
 *
 * Wrapped in cache() so both `viewerId` and `currentViewer` share one verified
 * identity within a render, however many times they ask for it.
 */
const authUser = cache(async (): Promise<AuthIdentity | null> => {
  try {
    const supabase = await getSupabase();
    if (!supabase) return null;

    const preview = await devPreviewIdentity(supabase);
    if (preview) return preview;

    const { data, error } = await supabase.auth.getClaims();
    if (error) throw error;

    const claims = data?.claims;
    if (!claims?.sub) return null;

    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : "",
      userMetadata: isRecord(claims.user_metadata) ? claims.user_metadata : {},
    };
  } catch (error) {
    unstable_rethrow(error);
    if (isAbortError(error)) return null;
    // Identity only personalises public pages. If Auth is temporarily down,
    // keep those pages available as a guest and let protected actions deny the
    // request normally instead of breaking the whole streamed response.
    console.error("[builders] Visitor session could not be read; continuing as a guest.", error);
    return null;
  }
});

/**
 * Who is asking, and nothing else about them.
 *
 * `currentViewer()` also reads the profile row, which is a second round trip
 * and everything a header needs. A caller that only wants to look something up
 * by id — the board's role history, an activity tag on a write — should not
 * wait for a name and a bio it will not render.
 */
export async function viewerId(): Promise<string | null> {
  return (await authUser())?.id ?? null;
}

/**
 * The signed-in visitor with their public profile, or `null` for a guest.
 */
export const currentViewer = cache(async (): Promise<Viewer | null> => {
  try {
    const supabase = await getSupabase();
    if (!supabase) return null;

    const user = await authUser();
    if (!user) return null;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    if (profile) return toViewer(profile, user.email ?? "");

    // The sign-up trigger creates the profile, so this is the unlikely path:
    // an auth user that lost its public half. Put it back rather than showing
    // somebody a half-signed-in site they cannot escape.
    const fallbackName =
      (user.userMetadata.name as string | undefined)?.trim() ||
      user.email?.split("@")[0] ||
      "Person";
    const { data: created, error: createError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        username: `person-${user.id.slice(0, 8)}`,
        name: fallbackName.slice(0, 80),
      })
      .select("*")
      .maybeSingle();
    if (createError) throw new Error(createError.message);

    return created ? toViewer(created, user.email ?? "") : null;
  } catch (error) {
    unstable_rethrow(error);
    if (isAbortError(error)) return null;
    // Identity only personalises public pages. If Auth is temporarily down,
    // keep those pages available as a guest and let protected actions deny the
    // request normally instead of breaking the whole streamed response.
    console.error("[builders] Visitor session could not be read; continuing as a guest.", error);
    return null;
  }
});

/**
 * Local preview only: `DEV_VIEW_AS=<username>` in .env.local shows the site as
 * that member under `next dev`, because signing in through GitHub returns to
 * the deployed site rather than to localhost.
 *
 * It only changes what pages *show*. The database still sees a guest, so every
 * write is refused by its policies, and anything only an owner may read stays
 * hidden. Never on in a production build or on Vercel.
 */
async function devPreviewIdentity(supabase: NonNullable<Awaited<ReturnType<typeof getSupabase>>>): Promise<AuthIdentity | null> {
  const username = process.env.DEV_VIEW_AS?.trim();
  if (!username || process.env.NODE_ENV !== "development" || process.env.VERCEL) return null;

  const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  if (!data) {
    console.warn(`[builders] DEV_VIEW_AS: no member is called "${username}"; continuing as a guest.`);
    return null;
  }
  return { id: data.id, email: "", userMetadata: {} };
}

/** An interrupted navigation cancels its session request; that is not an outage. */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toViewer(profile: ProfileRow, email: string): Viewer {
  return {
    id: profile.id,
    username: profile.username,
    name: profile.name,
    profession: profile.profession ?? "",
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    skills: profile.skills ?? [],
    yearsExperience: profile.years_experience ?? null,
    fields: profile.fields ?? [],
    availability: availabilityStatus(profile.availability_status),
    website: profile.website ?? "",
    publicEmail: profile.public_email ?? "",
    github: profile.github ?? "",
    linkedin: profile.linkedin ?? "",
    x: profile.x_url ?? "",
    resume: profile.resume_url ?? "",
    activityHidden: profile.activity_hidden ?? [],
    githubActivityShown: profile.github_activity_shown === true,
    githubTyped: profile.github_typed ?? "",
    email,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
