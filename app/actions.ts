"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireSupabase, type Supabase } from "./lib/supabase";
import {
  MAXIMUM,
  domainOf,
  normaliseTags,
  slugify,
  validateBrief,
  type FieldErrors,
} from "./lib/brief";
import { isProjectType } from "./lib/project-types";
import { isRole } from "./lib/roles";
import { isStage, meetsStage, settleStage, type Stage } from "./lib/stages";
import { hiddenFrom } from "./lib/activity";
import { isReactionKey, isReactionTarget } from "./lib/reactions";
import { getGitHubProjectDraft, isGitHubRepositoryUrl, type GitHubProjectDraft } from "./lib/github";
import { fetchLinkMetadata, normaliseLink, titleFromLink } from "./lib/link-metadata";
import { currentViewer, viewerId } from "./lib/session";
import { normalisePeopleTerms } from "./lib/people";
import { isOssRelation, parseRepoRef } from "./lib/oss";
import { validateRepoSubmission, type RepoSubmissionInput } from "./lib/open-source";
import { isSiteAdmin } from "./lib/data";
import { signInPath } from "./lib/urls";
import {
  PROFILE_LIMITS,
  PROFILE_MAXIMUM,
  isEmail,
  validateProfile,
  validateUsername,
  type ProfileFieldErrors,
  type ProfileInput,
} from "./lib/profile";
import { tags } from "./lib/cache-tags";
import { currentLocale } from "./lib/locale-server";
import { tx, type Locale } from "./lib/locale";

export type CreateState = {
  errors: FieldErrors & {
    form?: string;
    link?: string;
    stage?: string;
    now?: string;
    projectType?: string;
    seatRole?: string;
    seatRoleTitle?: string;
    seatBrief?: string;
    seatCommitment?: string;
    openForGitHubContributions?: string;
    /** Neither kind of help was asked for, so the directory would not list it. */
    help?: string;
  };
  values: Record<string, string>;
};

export type EditState = CreateState;

export type GitHubImportResult =
  | { ok: true; draft: GitHubProjectDraft }
  | { ok: false; error: string };

/** What a pasted link turned out to be, as the form shows it back. */
export type LinkPreview = {
  /** Exactly what was typed, so the form can tell a stale preview from a fresh one. */
  requested: string;
  url: string;
  domain: string;
  title: string;
  tagline: string;
  logoUrl: string;
  imageUrl: string;
  /** False when the page could not be read; the title is then from the address. */
  fetched: boolean;
};

export type LinkPreviewResult =
  | { ok: true; preview: LinkPreview }
  | { ok: false; error: string };

export type RepoFormState = {
  errors: Partial<Record<"repo" | "list" | "reasons" | "why" | "summary" | "starterLabel" | "form", string>>;
  values: RepoSubmissionInput & { contributed: string };
};

export type ProfileState = {
  errors: ProfileFieldErrors & { form?: string };
  values: ProfileInput;
};

const GLYPHS = ["✦", "○○○", "▱", "⌖", "≡", "↗", "◔", "⌁"] as const;

/* ------------------------------------------------------------------ *
 * Retiring what a write has just made wrong
 * ------------------------------------------------------------------ *
 *
 * The public reads in `lib/data.ts` are cached and shared between visitors, so
 * a write has to say what it invalidated or the change would sit unseen behind
 * the cache until it expired on its own.
 *
 * `updateTag` rather than `revalidateTag`: the person who just saved is about
 * to be shown the page they saved. Serving them the previous copy while a fresh
 * one is built in the background — which is what `revalidateTag` does — would
 * read as the edit not having worked.
 *
 * The `revalidatePath` calls below these stay as they were. They clear the
 * router's cache of a rendered route, which is a different store from the
 * tagged data these reads come from; the two are meant to be used together.
 */

/** A project's own page, and every board listing that carries its card. */
function projectChanged(slug: string): void {
  updateTag(tags.project(slug));
  updateTag(tags.projects);
}

/**
 * A seat opened, taken, decided or closed.
 *
 * Wider than one project on purpose: the open-seat counts, the "role yang
 * paling dicari" ranking and the Explore autocomplete are all built from every
 * seat on the site, so any one of them moving dates all of it.
 */
function seatsChanged(slug: string): void {
  projectChanged(slug);
  updateTag(tags.seats);
}

/**
 * Something happened that a trail records.
 *
 * The person's tag covers their profile and, because project trails are filed
 * under the people in them, the projects they already appear on. The project's
 * own tag covers the case this does not: the first time they appear there.
 */
function trailChanged(personId: string | null | undefined, slug?: string): void {
  if (personId) updateTag(tags.trail(personId));
  if (slug) updateTag(tags.projectTrail(slug));
  // The site-wide trail, which Home and Explore lead with: any event by
  // anybody can change what sits at the top of it.
  updateTag(tags.activity);
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

/** Reads public GitHub copy into a browser draft; it never writes a project. */
export async function importGitHubReadme(repoUrl: string): Promise<GitHubImportResult> {
  const [viewer, locale] = await Promise.all([currentViewer(), currentLocale()]);
  if (!viewer) return { ok: false, error: tx(locale, "Masuk sebelum mengimpor README.", "Sign in before importing a README.") };

  try {
    return { ok: true, draft: await getGitHubProjectDraft(repoUrl) };
  } catch (error) {
    return { ok: false, error: messageOf(error, locale) };
  }
}

/**
 * Reads a pasted link so the form can show what it found.
 *
 * A preview, not a save: the same read runs again inside `createProject` when
 * the browser never got one, so a person who pastes and submits immediately is
 * not punished for being quick.
 */
export async function previewProjectLink(rawLink: string): Promise<LinkPreviewResult> {
  // Only whether they are signed in; the profile row would be one more trip.
  const [viewer, locale] = await Promise.all([viewerId(), currentLocale()]);
  if (!viewer) return { ok: false, error: tx(locale, "Masuk sebelum menambahkan proyek.", "Sign in before adding a project.") };

  const link = normaliseLink(rawLink);
  if (!link) return { ok: false, error: tx(locale, "Teks itu belum terlihat seperti tautan.", "That does not look like a link yet.") };

  const metadata = await fetchLinkMetadata(link);
  return {
    ok: true,
    preview: {
      requested: rawLink.trim(),
      url: link,
      domain: metadata.domain || domainOf(link),
      title: metadata.title || titleFromLink(link),
      tagline: metadata.description,
      logoUrl: usableLogo(metadata.iconUrl, metadata.imageUrl),
      imageUrl: metadata.imageUrl,
      fetched: metadata.fetched,
    },
  };
}

/**
 * Adds a project from either an existing link or the owner's description.
 *
 * A link submission reads the page's title, description and icon when those
 * fields were left empty. A description submission asks for a name and a short
 * explanation instead, so an idea does not need to invent a website before it
 * can exist here. It starts at the Idea stage unless its owner explicitly
 * chooses another stage and supplies the evidence that stage requires.
 */
export async function createProject(_state: CreateState, formData: FormData): Promise<CreateState> {
  const entryMethod = text(formData, "entryMethod") === "description" ? "description" : "link";
  const values = {
    entryMethod,
    link: text(formData, "link"),
    highlight: text(formData, "highlight").slice(0, MAXIMUM.highlight),
    title: text(formData, "title"),
    tagline: text(formData, "tagline"),
    problem: text(formData, "problem"),
    solution: text(formData, "solution"),
    audience: text(formData, "audience"),
    tags: formTopics(formData),
    now: text(formData, "now").slice(0, MAXIMUM.now),
    stage: text(formData, "stage"),
    projectType: text(formData, "projectType"),
    docUrl: text(formData, "docUrl"),
    repoUrl: text(formData, "repoUrl"),
    liveUrl: text(formData, "liveUrl"),
    logoUrl: text(formData, "logoUrl"),
    seatRole: text(formData, "seatRole"),
    seatRoleTitle: text(formData, "seatRoleTitle").slice(0, MAXIMUM.roleTitle),
    seatBrief: text(formData, "seatBrief"),
    seatCommitment: formCommitment(formData, "seatCommitment"),
    openSeat: text(formData, "openSeat"),
    openForGitHubContributions: text(formData, "openForGitHubContributions"),
  };

  // Only the id is needed; the profile row would be one more trip to the database.
  const [viewer, locale] = await Promise.all([viewerId(), currentLocale()]);
  if (!viewer) return { errors: { form: tx(locale, "Masuk sebelum menampilkan proyek di sini.", "Sign in before showing a project here.") }, values };

  const link = entryMethod === "link" ? normaliseLink(values.link) : "";
  if (entryMethod === "link" && !link) {
    return {
      errors: { link: tx(locale, "Tempel tautan proyek—situs web, halaman aplikasi, atau repositori.", "Paste the project link — a website, an app listing, or a repository.") },
      values,
    };
  }
  /*
   * Where the link belongs on the project.
   *
   * A repository is not the same claim as a product: sending a GitHub URL to
   * `live_url` would badge a pile of source code as something other people can
   * use today. Anything else is treated as the thing itself.
   */
  const repoLink = Boolean(link && isGitHubRepositoryUrl(link));
  const repoUrl = values.repoUrl || (repoLink ? link : "");
  const liveUrl = values.liveUrl || (link && !repoLink ? link : "");

  // Only read the page when nothing has read it yet. The form's preview already
  // did, and its name, summary and logo arrive with the submit; reading the
  // page again would add up to the whole fetch timeout to every submit.
  const alreadyRead = Boolean(link && values.title && text(formData, "previewedLink") === values.link);
  const metadata = !link || alreadyRead || (values.title && values.tagline && values.logoUrl)
    ? null
    : await fetchLinkMetadata(link);
  const title = values.title || metadata?.title || (link ? titleFromLink(link) : "");
  const tagline = values.tagline || (metadata?.description ?? "");
  const logoUrl = values.logoUrl || usableLogo(metadata?.iconUrl, metadata?.imageUrl);

  const brief = {
    ...values,
    title,
    tagline,
    repoUrl,
    liveUrl,
    logoUrl,
  };
  const errors: CreateState["errors"] = validateBrief(brief, locale);
  if (entryMethod === "description" && !values.highlight.trim()) {
    errors.highlight = tx(locale, "Tuliskan deskripsi singkat agar orang memahami idenya.", "Write a short description so people can understand the idea.");
  }
  /*
   * What the project is asking for: optional. The builders directory lists
   * every active product, so one asking for neither PRs nor a role still
   * shows; taking PRs also puts its repository on the open source site. The
   * rest of the brief can be written later from the project's edit page.
   */
  if (values.openSeat === "yes") {
    if (!isRole(values.seatRole)) errors.seatRole = tx(locale, "Pilih peran yang sedang kamu cari.", "Choose the role you are looking for.");
    if (values.seatRole === "other" && !values.seatRoleTitle) {
      errors.seatRoleTitle = tx(locale, "Tuliskan nama peran yang tidak tersedia di katalog.", "Write the name of a role that is not in the catalogue.");
    }
    if (!values.seatBrief) errors.seatBrief = tx(locale, "Jelaskan pekerjaan spesifik yang membutuhkan bantuan.", "Describe the specific work you need help with.");
    if (!values.seatCommitment) {
      errors.seatCommitment = tx(locale, "Berikan perkiraan waktu agar orang tahu apakah mereka dapat bergabung.", "Provide a time estimate so people know whether they can join.");
    }
  }
  if (values.projectType && !isProjectType(values.projectType)) {
    errors.projectType = tx(locale, "Pilih salah satu jenis proyek yang tersedia.", "Choose one of the available project kinds.");
  }
  if (values.openForGitHubContributions === "yes" && !isGitHubRepositoryUrl(repoUrl)) {
    errors.repoUrl = tx(locale, "Untuk membuka kontribusi GitHub, masukkan URL repositori GitHub publik yang valid.", "To open GitHub contributions, enter a valid public GitHub repository URL.");
  }
  if (Object.keys(errors).length > 0) return { errors, values };

  /*
   * The stage nobody explicitly selected.
   *
   * A description-first entry begins as an Idea. For a link entry, a page that
   * opens is evidence a stranger can use the thing today, while a repository
   * is evidence work is happening. Anyone who picked a stage in the details
   * keeps it, and `settleStage` still drops a claim the saved evidence does not
   * support.
   */
  const tags = normaliseTags(values.tags);
  const requestedStage = isStage(values.stage)
    ? values.stage
    : entryMethod === "description"
      ? "idea"
      : repoLink
        ? "building"
        : "live";
  const stage = settleStage(requestedStage, {
    nowText: values.now,
    docUrl: values.docUrl,
    repoUrl,
    liveUrl,
  });

  let slug = "";
  try {
    const supabase = await requireSupabase();
    slug = await freeSlug(supabase, title);

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        slug,
        title,
        tagline,
        owner_id: viewer,
        stage,
        project_type: isProjectType(values.projectType) ? values.projectType : "",
        highlight: values.highlight,
        problem: values.problem,
        solution: values.solution,
        audience: values.audience,
        now_text: values.now,
        // The trigger only touches this on UPDATE, so a project that starts
        // life already saying what it is doing gets its first timestamp here.
        now_updated_at: values.now ? new Date().toISOString() : null,
        doc_url: values.docUrl,
        repo_url: repoUrl,
        open_for_github_contributions: values.openForGitHubContributions === "yes",
        live_url: liveUrl,
        logo_url: logoUrl,
        tags,
        glyph: pick(GLYPHS, tagline || title),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (values.openSeat === "yes" && values.seatBrief && isRole(values.seatRole)) {
      const { error: seatError } = await supabase.from("seats").insert({
        project_id: project.id,
        role: values.seatRole,
        role_title: values.seatRole === "other" ? values.seatRoleTitle : "",
        brief: values.seatBrief.slice(0, MAXIMUM.seatBrief),
        commitment: values.seatCommitment,
      });
      if (seatError) throw new Error(seatError.message);
    }
  } catch (error) {
    return { errors: { form: messageOf(error, locale) }, values };
  }

  // Tags, not revalidatePath("/"): the directory's project list is tagged
  // `projects`, and clearing the whole path would also throw away the
  // catalogue, repository signals and member records it reads, none of which
  // a new project changes, so the next visit to Home rebuilt all of them.
  if (values.openSeat === "yes") seatsChanged(slug);
  else projectChanged(slug);
  trailChanged(viewer, slug);
  redirect(`/projects/${slug}`);
}

/**
 * The mark to store for a project, out of what the page offered.
 *
 * An icon is what a card wants — square, small, already the project's face
 * everywhere else. A social image is the fallback rather than the first choice:
 * it is usually a wide banner with the name written across it, which reads
 * badly at 40 pixels. Either way the column is 500 characters, and a URL longer
 * than that is not worth truncating into a broken image.
 */
function usableLogo(iconUrl?: string, imageUrl?: string): string {
  return [iconUrl, imageUrl].find((url) => url && url.length <= MAXIMUM.logoUrl) ?? "";
}

/**
 * Rewrites a project's brief.
 *
 * The same minimums apply as when it was created, so a project cannot be
 * hollowed out after the fact. The owner can also move its status, as long as
 * the selected status is supported by the brief and links being saved.
 */
export async function updateProject(_state: EditState, formData: FormData): Promise<EditState> {
  const slug = text(formData, "slug");
  const values = {
    title: text(formData, "title"),
    tagline: text(formData, "tagline"),
    highlight: text(formData, "highlight").slice(0, MAXIMUM.highlight),
    problem: text(formData, "problem"),
    solution: text(formData, "solution"),
    audience: text(formData, "audience"),
    tags: formTopics(formData),
    now: text(formData, "now").slice(0, MAXIMUM.now),
    projectType: text(formData, "projectType"),
    docUrl: text(formData, "docUrl"),
    repoUrl: text(formData, "repoUrl"),
    liveUrl: text(formData, "liveUrl"),
    logoUrl: text(formData, "logoUrl"),
    stage: text(formData, "stage"),
    openForGitHubContributions: text(formData, "openForGitHubContributions"),
  };

  const [viewer, locale] = await Promise.all([currentViewer(), currentLocale()]);
  if (!viewer) return { errors: { form: tx(locale, "Masuk untuk mengedit proyek ini.", "Sign in to edit this project.") }, values };

  const errors: EditState["errors"] = validateBrief(values, locale);
  // Empty stays allowed here for the same reason it is allowed in the column:
  // an owner filling in the rest of a link-first project should not be stopped
  // at a question they have no answer for yet.
  if (values.projectType && !isProjectType(values.projectType)) {
    errors.projectType = tx(locale, "Pilih salah satu jenis proyek yang tersedia.", "Choose one of the available project kinds.");
  }
  const requestedStage = isStage(values.stage) ? values.stage : null;
  if (!requestedStage) {
    errors.stage = tx(locale, "Pilih status proyek yang tersedia.", "Choose an available project status.");
  } else if (
    requestedStage === "building" &&
    !values.now &&
    !values.docUrl &&
    !values.repoUrl &&
    !values.liveUrl
  ) {
    errors.now = tx(locale, "Jelaskan pekerjaan yang sedang berjalan atau tambahkan tautan yang dapat diakses.", "Describe the work in progress, or add a working link.");
  } else if (requestedStage === "live" && !values.liveUrl) {
    errors.liveUrl = tx(locale, "Proyek yang sudah berjalan memerlukan tautan yang dapat dibuka orang lain.", "A live project needs a link other people can open.");
  }
  if (values.openForGitHubContributions === "yes" && !isGitHubRepositoryUrl(values.repoUrl)) {
    errors.repoUrl = tx(locale, "Untuk membuka kontribusi GitHub, masukkan URL repositori GitHub publik yang valid.", "To open GitHub contributions, enter a valid public GitHub repository URL.");
  }
  if (Object.keys(errors).length > 0) return { errors, values };

  try {
    const supabase = await requireSupabase();
    const { data: project, error } = await supabase
      .from("project_overview")
      .select("id, owner_id, stage")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) return { errors: { form: tx(locale, "Proyek tidak ditemukan.", "Project not found.") }, values };
    if (project.owner_id !== viewer.id) {
      return { errors: { form: tx(locale, "Hanya pemilik proyek yang dapat mengeditnya.", "Only the project owner can edit it.") }, values };
    }

    const tags = normaliseTags(values.tags);
    const { data: updatedProject, error: updateError } = await supabase
      .from("projects")
      .update({
        title: values.title,
        tagline: values.tagline,
        highlight: values.highlight,
        problem: values.problem,
        solution: values.solution,
        audience: values.audience,
        now_text: values.now,
        doc_url: values.docUrl,
        repo_url: values.repoUrl,
        open_for_github_contributions: values.openForGitHubContributions === "yes",
        live_url: values.liveUrl,
        logo_url: values.logoUrl,
        project_type: values.projectType,
        tags,
        stage: requestedStage,
      })
      .eq("id", project.id)
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updatedProject) {
      return {
        errors: { form: tx(locale, "Proyek tidak dapat disimpan. Muat ulang halaman lalu coba lagi.", "The project could not be saved. Refresh the page and try again.") },
        values,
      };
    }
  } catch (error) {
    return { errors: { form: messageOf(error, locale) }, values };
  }

  projectChanged(slug);
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/directory");
  redirect(`/projects/${slug}`);
}

/**
 * Removes a project for good, along with its seats, comments and support.
 *
 * Asks for the slug to be typed back because there is no undo — the cascade in
 * the schema takes the discussion with it.
 */
export async function deleteProject(formData: FormData): Promise<void> {
  const slug = text(formData, "slug");
  const confirmation = text(formData, "confirm");
  if (!slug || confirmation !== slug) return;

  const viewer = await currentViewer();
  if (!viewer) return;

  const supabase = await requireSupabase();
  const { error } = await supabase.from("projects").delete().eq("slug", slug);
  if (error) throw new Error(error.message);

  seatsChanged(slug);
  revalidatePath("/directory");
  redirect(`/u/${viewer.username}`);
}

export async function setStage(formData: FormData): Promise<void> {
  const slug = text(formData, "slug");
  const stage = text(formData, "stage");
  if (!isStage(stage)) return;

  const supabase = await requireSupabase();
  const { data: project, error } = await supabase
    .from("project_overview")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!project) return;

  const allowed = meetsStage(stage as Stage, {
    nowText: project.now_text ?? "",
    docUrl: project.doc_url,
    repoUrl: project.repo_url,
    liveUrl: project.live_url,
  });
  if (!allowed) return;

  // Ownership is the database's call: the update matches no rows for anybody
  // else. This only decides whether the level itself is earned.
  const { error: updateError } = await supabase
    .from("projects")
    .update({ stage })
    .eq("id", project.id);
  if (updateError) throw new Error(updateError.message);

  projectChanged(slug);
  trailChanged(await viewerId(), slug);
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/directory");
}

/* ------------------------------------------------------------------ *
 * Seats — the open contribution slots
 * ------------------------------------------------------------------ */

export async function openSeat(formData: FormData): Promise<void> {
  const slug = text(formData, "slug");
  const role = text(formData, "role");
  const roleTitle = text(formData, "roleTitle").slice(0, MAXIMUM.roleTitle);
  const brief = text(formData, "brief").slice(0, MAXIMUM.seatBrief);
  const commitment = formCommitment(formData, "commitment");
  if (!isRole(role) || !brief || !commitment || (role === "other" && !roleTitle)) return;

  const supabase = await requireSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!project) return;

  const { error } = await supabase
    .from("seats")
    .insert({
      project_id: project.id,
      role,
      role_title: role === "other" ? roleTitle : "",
      brief,
      commitment,
    });
  if (error) throw new Error(error.message);

  seatsChanged(slug);
  revalidatePath(`/projects/${slug}`);
}

/**
 * Closes a role to new proposals, without touching anybody who already sent
 * one.
 *
 * `DELETE` was the only tool already sitting in the database for this
 * (`managers close seats on their project`, since 0004), but it cascades to
 * every proposal aimed at the seat — including a pending one somebody is
 * still waiting on. This instead flips the seat to `closed`: `submit_proposal`
 * already refuses anything but an `open` seat, so new applicants get turned
 * away, while `decide_proposal` now accepts from `closed` too, so whoever
 * applied before the role closed still gets a real accept or decline.
 */
export async function closeSeat(formData: FormData): Promise<void> {
  const slug = text(formData, "slug");
  const seatId = Number(text(formData, "seatId"));
  if (!Number.isInteger(seatId)) return;

  const supabase = await requireSupabase();
  const { error } = await supabase.from("seats").update({ status: "closed" }).eq("id", seatId);
  if (error) throw new Error(error.message);

  seatsChanged(slug);
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/directory");
}

export async function decideProposal(formData: FormData): Promise<void> {
  const slug = text(formData, "slug");
  const proposalId = Number(text(formData, "proposalId"));
  const decision = text(formData, "decision");
  if (!Number.isInteger(proposalId) || (decision !== "terima" && decision !== "tolak")) return;

  const supabase = await requireSupabase();
  const { error } = await supabase.rpc("decide_proposal", {
    proposal_id: proposalId,
    accept: decision === "terima",
  });
  if (error) throw new Error(error.message);

  seatsChanged(slug);
  updateTag(tags.projectTrail(slug));
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/directory");
}

/* ------------------------------------------------------------------ *
 * What the project is doing right now, and how it got here
 * ------------------------------------------------------------------ */

/**
 * Rewrites the one line that says what the project is working on.
 *
 * Its own action rather than part of the brief, because it is meant to be
 * changed often — a brief is written once and revisited, this is answered
 * every couple of weeks, and burying it behind the whole edit form is what
 * would make it go stale.
 *
 * `set_now()` rather than a plain update, for the reason `move_task` is a
 * function too: row level security is row level, not column level, so the
 * policy that let an admin write this line would also let them rewrite the
 * brief. The function also settles the level, because clearing the line can
 * cost a project the level it stood on — and `now_updated_at` is written by a
 * trigger, so the freshness people read is never something a request can set.
 */
export async function setNow(formData: FormData): Promise<void> {
  const slug = text(formData, "slug");
  const now = text(formData, "now").slice(0, MAXIMUM.now);

  const supabase = await requireSupabase();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!project) return;

  const { error } = await supabase.rpc("set_now", { project: project.id, line: now });
  if (error) throw new Error(error.message);

  projectChanged(slug);
  trailChanged(await viewerId(), slug);
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/directory");
  // The same line is editable from the owner's next-steps page.
  revalidatePath("/get-started");
}

/**
 * Marks every notice read.
 *
 * A button rather than a side effect of opening /inbox: a page that quietly
 * clears its own badge on render can wipe a decision somebody never actually
 * looked at, and a GET should not change anything anyway. The update matches
 * nothing for anybody else — the policy in 0008 sees to that.
 */
export async function markNoticesSeen(): Promise<void> {
  const viewer = await currentViewer();
  if (!viewer) return;

  const supabase = await requireSupabase();
  const { error } = await supabase
    .from("notices")
    .update({ seen: true })
    .eq("recipient_id", viewer.id)
    .eq("seen", false);
  if (error) throw new Error(error.message);

  // Notices belong to one recipient, so they are never part of a shared cache.
  revalidatePath("/inbox");
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

/**
 * Which kinds of trail entry stay public.
 *
 * Separate from updateProfile because it belongs beside the trail rather than
 * beside the bio, and because updateProfile ends in a redirect.
 */
export async function setActivityVisibility(formData: FormData): Promise<void> {
  const viewer = await currentViewer();
  if (!viewer) return;

  const shown = formData.getAll("show").filter((value): value is string => typeof value === "string");

  const supabase = await requireSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ activity_hidden: hiddenFrom(shown, viewer.activityHidden) })
    .eq("id", viewer.id);
  if (error) throw new Error(error.message);

  trailChanged(viewer.id);
  revalidatePath(`/u/${viewer.username}`);
}

/**
 * Saves the profile, or says what is wrong with it.
 *
 * Takes the `useActionState` shape rather than returning void, because the
 * previous version silently dropped whatever it could not use: a website typed
 * without `https://` became an empty column and the page came back looking as
 * though the edit had been ignored. Now nothing is written until every field
 * is acceptable, and the form comes back with what was typed still in it.
 *
 * `profileUrl` and `profileEmail` below stay in place under the validation.
 * Validation is what turns a mistake into a sentence; those two are what keep
 * an unexpected value out of the row when a request skips the form entirely.
 */
export async function updateProfile(
  _state: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const returnTo = safeProjectReturnTo(text(formData, "returnTo"));
  const values: ProfileInput = {
    name: text(formData, "name"),
    profession: text(formData, "profession"),
    headline: text(formData, "headline"),
    bio: text(formData, "bio"),
    skills: text(formData, "skills"),
    website: text(formData, "website"),
    publicEmail: text(formData, "publicEmail"),
    linkedin: text(formData, "linkedin"),
    x: text(formData, "x"),
  };

  const [viewer, locale] = await Promise.all([currentViewer(), currentLocale()]);
  if (!viewer) {
    return { errors: { form: tx(locale, "Sesi kamu telah berakhir. Masuk kembali, lalu simpan sekali lagi.", "You are no longer signed in. Sign in again, then save once more.") }, values };
  }

  const errors = validateProfile(values, locale);
  if (Object.keys(errors).length > 0) return { errors, values };

  const supabase = await requireSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({
      name: values.name.slice(0, PROFILE_MAXIMUM.name),
      profession: values.profession.slice(0, PROFILE_MAXIMUM.profession),
      headline: values.headline.slice(0, PROFILE_MAXIMUM.headline),
      bio: values.bio.slice(0, PROFILE_MAXIMUM.bio),
      skills: normalisePeopleTerms(values.skills, PROFILE_LIMITS.skills),
      // Not here on purpose: years_experience, fields, availability_status
      // and resume_url left the form with the talent pool, so a save leaves
      // whatever is stored in them alone. github has its own form below.
      website: profileUrl(values.website),
      public_email: profileEmail(values.publicEmail),
      linkedin: profileUrl(values.linkedin),
      x_url: profileUrl(values.x),
    })
    .eq("id", viewer.id);
  if (error) return { errors: { form: error.message }, values };

  updateTag(tags.person(viewer.username));
  updateTag(tags.people);
  updateTag(tags.projects);
  revalidatePath(`/u/${viewer.username}`);
  revalidatePath("/get-started");
  revalidatePath("/account/profile");
  redirect(returnTo ?? `/u/${viewer.username}?saved=1`);
}

export type GitHubState = {
  errors: { form?: string };
  values: { shown: boolean };
  saved?: boolean;
};

/**
 * Saves whether the linked GitHub account's activity may be shown on
 * /activity.
 *
 * The account itself is not typed here any more: it is the one linked through
 * OAuth, which the database records on the profile (see
 * 20261103000000_linked_github.sql). Without one there is nothing to show, so
 * the yes is refused rather than stored.
 */
export async function saveGitHub(_state: GitHubState, formData: FormData): Promise<GitHubState> {
  const values = { shown: formData.get("github_activity") === "1" };
  const [viewer, locale] = await Promise.all([currentViewer(), currentLocale()]);
  if (!viewer) {
    return { errors: { form: tx(locale, "Sesi kamu telah berakhir. Masuk kembali, lalu simpan sekali lagi.", "You are no longer signed in. Sign in again, then save once more.") }, values };
  }
  if (values.shown && !viewer.github) {
    return { errors: { form: tx(locale, "Tautkan akun GitHub-mu dulu.", "Link your GitHub account first.") }, values: { shown: false } };
  }

  const supabase = await requireSupabase();
  const { error } = await supabase.from("profiles").update({ github_activity_shown: values.shown }).eq("id", viewer.id);
  if (error) return { errors: { form: error.message }, values };

  updateTag(tags.person(viewer.username));
  updateTag(tags.people);
  updateTag(tags.activity);
  revalidatePath(`/u/${viewer.username}`);
  return { errors: {}, values, saved: true };
}

/**
 * Keeps a repository off the site: `owner/name`, a GitHub link, or `owner/*`
 * for a whole account or organisation. The database clears what was stored
 * for it at once (20261105000000_github_hidden_repos.sql).
 */
export async function hideGitHubRepo(formData: FormData): Promise<void> {
  const viewer = await currentViewer();
  if (!viewer) return;
  const raw = String(formData.get("repo") ?? "").trim();
  const owner = raw.match(/^([A-Za-z0-9-]+)\/\*$/)?.[1];
  const pattern = owner ? `${owner.toLowerCase()}/*` : parseRepoRef(raw);
  if (!pattern) return;

  const supabase = await requireSupabase();
  const { error } = await supabase.from("github_hidden_repos").upsert({ user_id: viewer.id, pattern }, { onConflict: "user_id,pattern", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  githubReposChanged(viewer.username);
}

/** Shows a hidden repository again; the refresh function fetches it back within minutes. */
export async function showGitHubRepo(formData: FormData): Promise<void> {
  const viewer = await currentViewer();
  if (!viewer) return;
  const pattern = String(formData.get("pattern") ?? "");

  const supabase = await requireSupabase();
  const { error } = await supabase.from("github_hidden_repos").delete().eq("user_id", viewer.id).eq("pattern", pattern);
  if (error) throw new Error(error.message);
  githubReposChanged(viewer.username);
}

function githubReposChanged(username: string): void {
  updateTag(tags.activity);
  updateTag(tags.oss);
  updateTag(tags.people);
  updateTag(tags.person(username));
  revalidatePath("/account/profile");
}

export type UsernameState = {
  error?: string;
  username: string;
  /** The name typed was already theirs: nothing to save, but say so. */
  unchanged?: boolean;
};

/**
 * Changes the member's profile URL.
 *
 * The format and reserved rules are checked here first for a kind message, but
 * the database is the real gate: `change_username` owns availability, the
 * cooldown and keeping the old name resolvable, none of which the client can
 * see. Its raised message is Indonesian; the common outcomes are mapped by
 * error code so the English site stays English, and anything unmapped falls
 * back to what the function said.
 */
export async function changeUsername(_state: UsernameState, formData: FormData): Promise<UsernameState> {
  const typed = text(formData, "username");
  const [viewer, locale] = await Promise.all([currentViewer(), currentLocale()]);
  if (!viewer) {
    return { error: tx(locale, "Sesi kamu telah berakhir. Masuk kembali, lalu coba sekali lagi.", "You are no longer signed in. Sign in again, then try once more."), username: typed };
  }

  const checked = validateUsername(typed, locale);
  if ("error" in checked) return { error: checked.error, username: typed };
  if (checked.username === viewer.username) return { username: viewer.username, unchanged: true };

  const supabase = await requireSupabase();
  const { data, error } = await supabase.rpc("change_username", { new_name: checked.username });
  if (error) {
    const message =
      error.hint === "github_login"
        ? tx(locale, "Itu username akun GitHub member lain. Coba yang lain.", "That is another member's GitHub username. Try another.")
        : error.code === "23505"
          ? tx(locale, "Username itu sudah dipakai. Coba yang lain.", "That username is taken. Try another.")
          : error.code === "55000"
            ? tx(locale, "Username baru bisa diubah lagi 30 hari setelah perubahan terakhir.", "A username can only be changed again 30 days after the last change.")
            : error.code === "22023"
              ? tx(
                  locale,
                  "Username harus 2 sampai 48 karakter: huruf kecil, angka atau tanda hubung, diawali huruf atau angka.",
                  "A username is 2 to 48 characters: lowercase letters, digits or hyphens, starting with a letter or digit.",
                )
              : error.message;
    return { error: message, username: checked.username };
  }

  const next = typeof data === "string" ? data : checked.username;
  // Both names change views: the old /u redirects now, the new one is live,
  // and every list and badge shows the handle. Their trail and the teams on
  // projects link to them too, and the layout's account menu and bottom bar
  // carry the name, so the whole tree is refreshed: a rename is rare enough.
  updateTag(tags.person(viewer.username));
  updateTag(tags.person(next));
  updateTag(tags.people);
  updateTag(tags.projects);
  updateTag(tags.seats);
  updateTag(tags.activity);
  updateTag(tags.oss);
  trailChanged(viewer.id);
  revalidatePath("/", "layout");
  redirect(`/u/${next}?saved=1`);
}

export type ReactionResult = { ok: true } | { ok: false; reason: "signin" | "failed" };

/**
 * Leaves an emoji on a pull request or a commit summary on /activity, or
 * takes it back. `url` is the entry's key: the PR's URL, or
 * `commits:<user_id>`. Who may react to what is the table's
 * policies' business — the PR has to be one the page shows — and the notice
 * to the PR's author is a trigger's; see 20261025000000_activity_reactions.sql.
 */
export async function setReaction(url: string, emoji: string, on: boolean): Promise<ReactionResult> {
  if (!isReactionKey(emoji) || !isReactionTarget(url)) return { ok: false, reason: "failed" };
  const viewer = await viewerId();
  if (!viewer) return { ok: false, reason: "signin" };

  const supabase = await requireSupabase();
  const { error } = on
    ? await supabase.from("activity_reactions").insert({ pull_request_url: url, emoji })
    : await supabase.from("activity_reactions").delete().eq("pull_request_url", url).eq("user_id", viewer).eq("emoji", emoji);
  // Pressing twice before the first press lands is not a failure: the
  // reaction is there, which is what was asked for.
  if (error && error.code !== "23505") {
    console.warn(`[builders] Reaction could not be saved: ${error.message}`);
    return { ok: false, reason: "failed" };
  }

  updateTag(tags.reactions);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Never turn a hidden form value into an open redirect. */
function safeProjectReturnTo(value: string): string | null {
  return value.startsWith("/projects/") && !value.startsWith("//") ? value : null;
}

/** Last gate before a link reaches the row, however the request arrived. */
function profileUrl(raw: string): string {
  const value = raw.slice(0, PROFILE_MAXIMUM.link);
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}

function profileEmail(raw: string): string {
  const value = raw.toLowerCase().slice(0, PROFILE_MAXIMUM.publicEmail);
  return isEmail(value) ? value : "";
}

/** Topic chips and the free-text escape hatch share the old comma-list shape. */
function formTopics(formData: FormData): string {
  const selected = formData
    .getAll("topics")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  const custom = text(formData, "customTags");
  const legacy = text(formData, "tags");
  return [...selected, custom || (selected.length === 0 ? legacy : "")].filter(Boolean).join(", ");
}

/** A preset is stored as ordinary copy; custom text takes its place when chosen. */
function formCommitment(formData: FormData, key: string): string {
  const preset = text(formData, `${key}Preset`);
  const custom = text(formData, key);
  return (preset === "custom" ? custom : preset || custom).slice(0, MAXIMUM.commitment);
}

async function freeSlug(supabase: Supabase, title: string): Promise<string> {
  const base = slugify(title);

  for (let suffix = 0; suffix < 50; suffix += 1) {
    const ending = suffix === 0 ? "" : `-${suffix + 1}`;
    const candidate = `${base.slice(0, 48 - ending.length).replace(/-+$/g, "")}${ending}`;
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }

  const ending = `-${Date.now().toString(36)}`;
  return `${base.slice(0, 48 - ending.length).replace(/-+$/g, "")}${ending}`;
}

/** Stable pick so a project keeps the same colour and glyph on every render. */
function pick<T>(options: readonly T[], seed: string): T {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  return options[hash % options.length];
}

function messageOf(error: unknown, locale: Locale): string {
  if (error instanceof Error) {
    if (locale === "en") return error.message;
    const known: Record<string, string> = {
      "Only http and https links can be read.": "Hanya tautan http dan https yang dapat dibaca.",
      "A link cannot carry credentials.": "Tautan tidak boleh memuat kredensial.",
      "That address is not publicly reachable.": "Alamat tersebut tidak dapat diakses secara publik.",
      "Use a public GitHub repository URL, for example https://github.com/organization/project.": "Gunakan URL repositori GitHub publik, misalnya https://github.com/organization/project.",
      "That GitHub repository was not found or is not public.": "Repositori GitHub tersebut tidak ditemukan atau tidak bersifat publik.",
      "GitHub is limiting requests. Please try again shortly.": "GitHub sedang membatasi permintaan. Coba lagi sebentar lagi.",
      "GitHub repository data could not be read. Please try again shortly.": "Data repositori GitHub tidak dapat dibaca. Coba lagi sebentar lagi.",
      "The GitHub README could not be read. Please try again shortly.": "README GitHub tidak dapat dibaca. Coba lagi sebentar lagi.",
    };
    return known[error.message] ?? tx(locale, "Terjadi masalah saat menyimpan. Coba lagi sebentar lagi.", error.message);
  }
  return tx(locale, "Terjadi masalah saat menyimpan. Coba lagi sebentar lagi.", "Something went wrong while saving. Please try again shortly.");
}

/**
 * Adds a repository to the viewer's open source record.
 *
 * A plain form post that comes back to the editor with `?oss=` saying what
 * happened, so it works before any JavaScript arrives. The repo is normalised
 * here — a pasted pull-request URL becomes `owner/name` — and the database's
 * check constraint refuses anything that slips past.
 */
export async function addOssContribution(formData: FormData): Promise<void> {
  const viewer = await currentViewer();
  if (!viewer) redirect(signInPath("/account/profile#open-source"));

  const back = (status: string) => `/account/profile?oss=${status}#open-source`;
  const repo = parseRepoRef(text(formData, "repo"));
  const relation = text(formData, "relation");
  if (!repo || !isOssRelation(relation)) redirect(back("invalid"));

  const supabase = await requireSupabase();
  const { error } = await supabase.from("oss_contributions").insert({ user_id: viewer.id, repo, relation });
  if (error) {
    // 23505: the unique (user_id, repo) — already listed, which is not a failure.
    if (error.code === "23505") redirect(back("exists"));
    throw new Error(error.message);
  }

  ossChanged(viewer.username);
  redirect(back("added"));
}

/** Removes one repository from the viewer's record. RLS keeps it to their own rows. */
export async function removeOssContribution(formData: FormData): Promise<void> {
  const viewer = await currentViewer();
  if (!viewer) redirect(signInPath("/account/profile#open-source"));

  const repo = parseRepoRef(text(formData, "repo"));
  if (!repo) redirect("/account/profile#open-source");

  const supabase = await requireSupabase();
  const { error } = await supabase.from("oss_contributions").delete().eq("user_id", viewer.id).eq("repo", repo);
  if (error) throw new Error(error.message);

  ossChanged(viewer.username);
  redirect("/account/profile?oss=removed#open-source");
}

function ossChanged(username: string): void {
  updateTag(tags.oss);
  revalidatePath("/directory");
  revalidatePath(`/u/${username}`);
  revalidatePath("/get-started");
}

/**
 * Saves a repository to the open source catalogue.
 *
 * One action, three callers, told apart by `mode`:
 *
 *   - `submit` — a member on /recommend. Written as `pending`, under their
 *     name; it reaches the directory once an admin approves it. If they say
 *     they contributed to it or maintain it, that goes on their own record
 *     too, so the badge is there the moment the repo is.
 *   - `add` — an admin on /admin, written straight as `approved`.
 *   - `edit` — an admin changing an existing row, by `id`.
 *
 * Whether somebody may do the last two is the database's call (the policies
 * in 20261021000000_oss_catalogue.sql); the check here only turns a refusal
 * into a sentence.
 */
export async function saveRepo(_state: RepoFormState, formData: FormData): Promise<RepoFormState> {
  const locale = await currentLocale();
  const values: RepoFormState["values"] = {
    repo: text(formData, "repo"),
    list: text(formData, "list") || "recommended",
    reasons: formData.getAll("reasons").filter((value): value is string => typeof value === "string"),
    why: text(formData, "why"),
    summary: text(formData, "summary"),
    indonesian: formData.get("indonesian") === "on",
    starterLabel: text(formData, "starterLabel"),
    contributed: text(formData, "contributed"),
  };
  const mode = text(formData, "mode");

  // Only the id is needed: the profile row would be a round trip for nothing.
  const viewer = await viewerId();
  if (!viewer) redirect(signInPath("/recommend"));

  const checked = validateRepoSubmission(values, locale);
  if (!checked.ok) return { errors: checked.errors, values };
  const repo = checked.value;

  const admin = mode === "submit" ? false : await isSiteAdmin();
  if (mode !== "submit" && !admin) {
    return { errors: { form: tx(locale, "Hanya admin yang bisa melakukan ini.", "Only an admin can do this.") }, values };
  }

  const supabase = await requireSupabase();
  const row = {
    repo: repo.repo,
    list: repo.list,
    reasons: repo.reasons,
    summary: repo.summary,
    indonesian: repo.indonesian,
    starter_label: repo.starterLabel,
  };

  if (mode === "edit") {
    const id = Number(text(formData, "id"));
    if (!Number.isInteger(id)) return { errors: { form: tx(locale, "Repo tidak ditemukan.", "Repo not found.") }, values };
    const { error } = await supabase.from("oss_repos").update(row).eq("id", id);
    if (error) return { errors: repoWriteError(error, locale), values };
  } else {
    const { error } = await supabase.from("oss_repos").insert({
      ...row,
      // Reasons are picked from a list now; the old free-text column stays
      // empty for new rows, and an edit leaves an old row's text alone.
      why: repo.why,
      submitted_by: viewer,
      ...(mode === "add"
        ? { status: "approved", reviewed_by: viewer, reviewed_at: new Date().toISOString() }
        : {}),
    });
    if (error) return { errors: repoWriteError(error, locale), values };

    // "I contributed to this" / "I maintain this" also goes on the person's
    // own record, which is where the directory's people badges come from.
    if (values.contributed === "contributor" || values.contributed === "maintainer") {
      const { error: recordError } = await supabase
        .from("oss_contributions")
        .insert({ user_id: viewer, repo: repo.repo, relation: values.contributed });
      if (recordError && recordError.code !== "23505") {
        console.warn(`[builders] The submitter's own record was not updated: ${recordError.message}`);
      }
      updateTag(tags.oss);
    }
  }

  catalogueChanged();
  if (mode === "submit") redirect("/recommend?sent=1");
  redirect(`/admin?saved=${encodeURIComponent(repo.repo)}`);
}

function repoWriteError(error: { code?: string; message: string }, locale: Locale): RepoFormState["errors"] {
  // 23505: oss_repos_once — the repo is already listed, approved or not.
  if (error.code === "23505") {
    return { repo: tx(locale, "Repo ini sudah ada di katalog atau sedang direview.", "This repo is already in the catalogue or awaiting review.") };
  }
  // 42501: a policy refused it.
  if (error.code === "42501") {
    return { form: tx(locale, "Kamu tidak punya izin untuk ini.", "You do not have permission for this.") };
  }
  throw new Error(error.message);
}

/**
 * Puts a catalogue repo or a product first in the directory, or takes it back.
 * Only admins may; the table's policies are what enforce it.
 */
export async function setAdminPick(formData: FormData): Promise<void> {
  const viewer = await viewerId();
  if (!viewer) redirect(signInPath("/admin"));

  const kind = text(formData, "kind");
  const id = Number(text(formData, "id"));
  const on = text(formData, "on") === "1";
  if ((kind !== "repo" && kind !== "project") || !Number.isInteger(id)) redirect("/admin");

  const column = kind === "repo" ? "repo_id" : "project_id";
  const supabase = await requireSupabase();
  const { error } = on
    ? await supabase.from("admin_picks").insert(kind === "repo" ? { repo_id: id } : { project_id: id })
    : await supabase.from("admin_picks").delete().eq(column, id);
  // Picking twice — two tabs, a double press — leaves it picked, as asked.
  if (error && error.code !== "23505") throw new Error(error.message);

  updateTag(tags.adminPicks);
  redirect(`/admin#${kind}-${id}`);
}

/** An admin's decision on a submission: approve or reject. */
export async function reviewRepo(formData: FormData): Promise<void> {
  const viewer = await viewerId();
  if (!viewer) redirect(signInPath("/admin"));

  const id = Number(text(formData, "id"));
  const decision = text(formData, "decision");
  if (!Number.isInteger(id) || (decision !== "approved" && decision !== "rejected")) redirect("/admin");

  const supabase = await requireSupabase();
  const { error } = await supabase
    .from("oss_repos")
    .update({ status: decision, reviewed_by: viewer, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  catalogueChanged();
  redirect("/admin");
}

/**
 * Removes a repository: an admin from the catalogue, or a member withdrawing
 * their own submission while it still waits. RLS decides which applies.
 */
export async function deleteRepo(formData: FormData): Promise<void> {
  const viewer = await viewerId();
  const back = text(formData, "returnTo") === "/admin" ? "/admin" : "/recommend";
  if (!viewer) redirect(signInPath(back));

  const id = Number(text(formData, "id"));
  if (!Number.isInteger(id)) redirect(back);

  const supabase = await requireSupabase();
  const { error } = await supabase.from("oss_repos").delete().eq("id", id);
  if (error) throw new Error(error.message);

  catalogueChanged();
  redirect(back);
}

function catalogueChanged(): void {
  updateTag(tags.catalogue);
  revalidatePath("/directory");
  revalidatePath("/recommend");
  revalidatePath("/admin");
}
