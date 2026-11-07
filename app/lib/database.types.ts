/**
 * The shape of the database, as the migrations in `supabase/migrations/` define
 * it. Written by hand rather than generated, so it stays readable — keep it in
 * step when you change a migration.
 */
export type ProjectRow = {
  id: number;
  slug: string;
  title: string;
  tagline: string;
  owner_id: string;
  stage: string;
  /**
   * Why the project exists — pet | community | product | commercial, or empty
   * for a project made before the question was asked. See 0016_project_types.sql
   * and app/lib/project-types.ts.
   */
  project_type: string;
  /**
   * Why this is worth a look, in the owner's own words — the one question a
   * link-first submission asks. See 20260829130000_link_first_projects.sql.
   */
  highlight: string;
  problem: string;
  solution: string;
  audience: string;
  doc_url: string;
  live_url: string;
  repo_url: string;
  /** Optional project-owned icon or logo — 0015_project_logo_url.sql. */
  logo_url: string;
  tags: string[];
  glyph: string;
  /** One line: what the project is working on right now — 0010_showcase.sql. */
  now_text: string;
  /** Set by a trigger when now_text changes, never by the app. */
  now_updated_at: string | null;
  /** Explicit maintainer opt-in, not inferred from merely linking a repo. */
  open_for_github_contributions: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectOverviewRow = Omit<ProjectRow, "updated_at"> & {
  owner_username: string;
  owner_name: string;
  seat_count: number;
  open_seat_count: number;
  active_member_count: number;
  /** Distinct roles with an open seat — 0007_open_roles.sql. */
  open_roles: string[];
  boost_count: number;
  follower_count: number;
  comment_count: number;
  update_count: number;
  open_task_count: number;
  done_task_count: number;
  /** Newest of the project's own writes, its updates, comments, tasks, seats. */
  last_activity_at: string;
  /** Generated full brief used by the indexed Explore text search. */
  search_text: string;
};

export type ProfileRow = {
  id: string;
  username: string;
  name: string;
  /** Primary role used by the people directory — 0013_people_directory.sql. */
  profession: string;
  headline: string;
  bio: string;
  /** Searchable capability and domain facets — 0013_people_directory.sql. */
  skills: string[];
  years_experience: number | null;
  fields: string[];
  /** Public opportunity status — 20260830090000_profile_availability.sql. */
  availability_status: string;
  website: string;
  public_email: string;
  /** The linked GitHub account's URL, written only from auth.identities — 20261103000000_linked_github.sql. */
  github: string;
  /** GitHub's numeric id of the linked account; null when none is linked. */
  github_id: number | null;
  /** A handle typed before accounts had to be linked: shown to its owner as what to link, trusted by nothing. */
  github_typed: string;
  linkedin: string;
  x_url: string;
  resume_url: string;
  /** Trail kinds this person keeps off their public profile. */
  activity_hidden: string[];
  /** Agreed to their GitHub activity being shown on /activity; off until they turn it on. */
  github_activity_shown: boolean;
  created_at: string;
  /** When the username last changed, for the cooldown — 20261102000000_custom_username.sql. Null while still system-assigned. */
  username_changed_at: string | null;
};

/** A former username, kept so old /u/<name> links resolve — 20261102000000_custom_username.sql. */
export type UsernameHistoryRow = {
  username: string;
  user_id: string;
  changed_at: string;
};

export type EventRow = {
  id: number;
  actor_id: string;
  project_id: number | null;
  kind: string;
  payload: Record<string, string>;
  created_at: string;
};

export type SeatRow = {
  id: number;
  project_id: number;
  role: string;
  /** Specific label when role is `other`; empty for catalogue roles. */
  role_title: string;
  brief: string;
  status: string;
  /** member | admin — only meaningful on a filled seat. */
  access: string;
  user_id: string | null;
  pitch: string;
  /** Roughly how much time the help would take, in the owner's own words. */
  commitment: string;
  created_at: string;
};

export type TaskRow = {
  id: number;
  project_id: number;
  title: string;
  detail: string;
  /** Optional role this task belongs to — roles and tasks may also stand alone. */
  seat_id: number | null;
  assignee_id: string | null;
  created_by: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ProposalRow = {
  id: number;
  task_id: number | null;
  seat_id: number | null;
  person_id: string;
  pitch: string;
  status: string;
  created_at: string;
  decided_at: string | null;
};

export type CommentRow = {
  id: number;
  project_id: number;
  author_id: string;
  body: string;
  created_at: string;
};

export type UpdateRow = {
  id: number;
  project_id: number;
  author_id: string | null;
  title: string;
  body: string;
  created_at: string;
};

export type FollowRow = {
  project_id: number;
  user_id: string;
  created_at: string;
};

export type BoostRow = {
  project_id: number;
  user_id: string;
  created_at: string;
};

export type NoticeRow = {
  id: number;
  recipient_id: string;
  kind: string;
  payload: Record<string, string>;
  seen: boolean;
  created_at: string;
};

export type FeedbackRow = {
  id: number;
  /** Null for a guest, and null again once the account is deleted. */
  author_id: string | null;
  kind: string;
  message: string;
  contact: string;
  handled: boolean;
  created_at: string;
};

/** 20261020000000_oss_contributions.sql — feeds the directory's people badges. */
export type OssContributionRow = {
  id: number;
  user_id: string;
  /** `owner/name`, lower-cased. */
  repo: string;
  /** contributor | maintainer */
  relation: string;
  created_at: string;
};

/** 20261022000000_repo_signals.sql — GitHub facts per listed repository; written only by the refresh-repos Edge Function. */
export type RepoSignalRow = {
  repo: string;
  stars: number | null;
  language: string;
  description: string;
  pushed_at: string | null;
  archived: boolean;
  outside_prs: number | null;
  checked_at: string;
  last_error: string | null;
};

/** 20261024000000_github_activity.sql — a member's pull request to somebody else's repository. */
export type GitHubPullRequestRow = {
  url: string;
  user_id: string;
  /** `owner/name`, lower-cased. */
  repo: string;
  number: number;
  title: string;
  /** open | merged */
  state: string;
  opened_at: string;
  merged_at: string | null;
  checked_at: string;
  /** 20261030000000_github_own_pull_requests.sql — to the member's own or their organisation's repository. */
  own: boolean;
};

/** 20261024000000_github_activity.sql — commits to a member's own repositories since `since`. */
export type GitHubCommitSummaryRow = {
  user_id: string;
  commits: number;
  /** Most commits first. */
  repos: { repo: string; commits: number }[];
  last_commit_at: string | null;
  since: string;
  checked_at: string;
};

/** 20261027000100_github_contributions.sql — a repository where a member's pull request was merged. */
export type GitHubContributionRow = {
  user_id: string;
  repo: string;
  first_merged_at: string;
  last_merged_at: string;
};

/** 20261025000000_activity_reactions.sql — one emoji, by one member, on one pull request or commit summary. */
export type AdminPickRow = {
  id: number;
  /** Exactly one of repo_id and project_id is set. */
  repo_id: number | null;
  project_id: number | null;
  picked_by: string | null;
  created_at: string;
};

export type ActivityReactionRow = {
  id: number;
  pull_request_url: string;
  user_id: string;
  /** tada | clap | fire | heart | rocket */
  emoji: string;
  created_at: string;
};

/** 20261021000000_oss_catalogue.sql — the open source catalogue. */
export type OssRepoRow = {
  id: number;
  /** `owner/name`, lower-cased. */
  repo: string;
  /** internal | recommended */
  list: string;
  reasons: string[];
  why: string;
  summary: string;
  indonesian: boolean;
  starter_label: string;
  /** pending | approved | rejected */
  status: string;
  submitted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

/** Who curates the catalogue. Added by hand in the SQL editor. */
export type SiteAdminRow = {
  user_id: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string; username: string; name: string };
        // username moves only through change_username(); created_at and
        // username_changed_at are system-kept — 20261102000000_custom_username.sql.
        Update: Partial<Omit<ProfileRow, "id" | "created_at" | "username" | "username_changed_at">>;
      };
      username_history: {
        Row: UsernameHistoryRow;
        // Written only by change_username(); the app reads it for the redirect.
        Insert: never;
        Update: never;
      };
      projects: {
        Row: ProjectRow;
        Insert: Omit<ProjectRow, "id" | "created_at" | "updated_at" | "open_for_github_contributions"> &
          Partial<Pick<ProjectRow, "open_for_github_contributions">> & { id?: never };
        Update: Partial<Omit<ProjectRow, "id" | "owner_id" | "created_at">>;
      };
      seats: {
        Row: SeatRow;
        Insert: Omit<SeatRow, "id" | "created_at" | "user_id" | "pitch" | "status"> &
          Partial<Pick<SeatRow, "status" | "user_id" | "pitch">>;
        Update: Partial<Omit<SeatRow, "id" | "project_id" | "created_at">>;
      };
      comments: {
        Row: CommentRow;
        Insert: Omit<CommentRow, "id" | "created_at">;
        Update: Partial<Pick<CommentRow, "body">>;
      };
      boosts: {
        Row: BoostRow;
        Insert: Omit<BoostRow, "created_at">;
        Update: never;
      };
      follows: {
        Row: FollowRow;
        Insert: Omit<FollowRow, "created_at">;
        Update: never;
      };
      updates: {
        Row: UpdateRow;
        Insert: Omit<UpdateRow, "id" | "created_at">;
        // A log, not a document: it can be written and removed, never edited.
        Update: never;
      };
      events: {
        Row: EventRow;
        // Written only by the triggers in 0005_activity.sql. Typing the write
        // side as `never` turns a stray insert into a compile error rather than
        // a runtime refusal.
        Insert: never;
        Update: never;
      };
      notices: {
        Row: NoticeRow;
        // Written only by record_notice() in 0008_notices.sql — same reasoning
        // as `events`. Marking one read is the single permitted write.
        Insert: never;
        Update: Pick<NoticeRow, "seen">;
      };
      tasks: {
        Row: TaskRow;
        Insert: Omit<TaskRow, "id" | "created_at" | "updated_at" | "status" | "seat_id"> &
          Partial<Pick<TaskRow, "status" | "seat_id">>;
        Update: Partial<Pick<TaskRow, "title" | "detail" | "assignee_id" | "status">>;
      };
      proposals: {
        Row: ProposalRow;
        // Proposal writes go through submit_proposal(), never directly.
        Insert: never;
        Update: never;
      };
      feedback: {
        Row: FeedbackRow;
        // Nothing writes it any more: feedback became GitHub issues
        // (20261101000100_feedback_via_github_issues.sql). What was sent before
        // is read in the Supabase dashboard; the table grants neither role anything.
        Insert: never;
        Update: never;
      };
      oss_repos: {
        Row: OssRepoRow;
        Insert: Pick<OssRepoRow, "repo"> & Partial<Omit<OssRepoRow, "id" | "repo" | "created_at">>;
        // Only a site admin may update; the policy says so, not the type.
        Update: Partial<Omit<OssRepoRow, "id" | "repo" | "created_at" | "submitted_by">>;
      };
      site_admins: {
        Row: SiteAdminRow;
        // Written by hand in the SQL editor, never by the app.
        Insert: never;
        Update: never;
      };
      repo_signals: {
        Row: RepoSignalRow;
        // The service role writes, from the Edge Function; the app only reads.
        Insert: never;
        Update: never;
      };
      github_pull_requests: {
        Row: GitHubPullRequestRow;
        // Written only by the refresh-github-activity Edge Function.
        Insert: never;
        Update: never;
      };
      github_commit_summaries: {
        Row: GitHubCommitSummaryRow;
        Insert: never;
        Update: never;
      };
      github_contributions: {
        Row: GitHubContributionRow;
        // Written only by the refresh-github-activity Edge Function.
        Insert: never;
        Update: never;
      };
      activity_reactions: {
        Row: ActivityReactionRow;
        // user_id defaults to auth.uid(), and the policy insists on it.
        Insert: Pick<ActivityReactionRow, "pull_request_url" | "emoji">;
        // No update policy: changing a reaction is removing one and adding another.
        Update: never;
      };
      admin_picks: {
        Row: AdminPickRow;
        // picked_by defaults to auth.uid(); only admins may insert.
        Insert: Pick<AdminPickRow, "repo_id"> | Pick<AdminPickRow, "project_id">;
        // No update policy: unpicking is deleting the row.
        Update: never;
      };
      oss_contributions: {
        Row: OssContributionRow;
        Insert: Pick<OssContributionRow, "user_id" | "repo"> & Partial<Pick<OssContributionRow, "relation">>;
        // No update policy: changing a row is removing it and adding another.
        Update: never;
      };
    };
    Views: {
      project_overview: { Row: ProjectOverviewRow };
    };
    Functions: {
      move_task: { Args: { task_id: number; next_status: string }; Returns: undefined };
      is_site_admin: { Args: Record<string, never>; Returns: boolean };
      submit_proposal: {
        Args: { target_task_id?: number | null; target_seat_id?: number | null; message?: string };
        Returns: undefined;
      };
      decide_proposal: { Args: { proposal_id: number; accept: boolean }; Returns: undefined };
      set_now: { Args: { project: number; line: string }; Returns: undefined };
      change_username: { Args: { new_name: string }; Returns: string };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
