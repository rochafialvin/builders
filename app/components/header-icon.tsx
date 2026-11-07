/**
 * The menus' line icons: the header's menus and the phone's bottom bar. No
 * server imports, so the bottom bar — a client component — can use it too.
 */
export type HeaderIconName =
  | "directory"
  | "pull-request"
  | "pulse"
  | "trophy"
  | "about"
  | "feedback"
  | "community"
  | "profile"
  | "edit"
  | "steps"
  | "inbox"
  | "add"
  | "language"
  | "lock"
  | "signout"
  | "signin";

export function HeaderIcon({ name }: { name: HeaderIconName }) {
  const paths: Record<HeaderIconName, React.ReactNode> = {
    directory: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
    "pull-request": <><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M6 8.5v7M18 15.5V10a3 3 0 0 0-3-3h-4M13 4.5 10.5 7 13 9.5" /></>,
    pulse: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
    trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></>,
    about: <><circle cx="12" cy="12" r="9" /><path d="M12 11.5v5M12 7.8h.01" /></>,
    feedback: <><path d="M4 5h16v11H10l-4 4v-4H4z" /><path d="M8 9h8M8 12.5h5" /></>,
    community: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16.5 14.6A4.5 4.5 0 0 1 21 19" /></>,
    profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    inbox: <><path d="M4 5h16v13H4z" /><path d="M4 14h4l1.5 2h5l1.5-2h4" /></>,
    edit: <><path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="m14 6 4 4" /></>,
    steps: <><path d="M4 7h5v13H4zM9.5 12h5v8h-5zM15 4h5v16h-5z" /></>,
    add: <path d="M12 5v14M5 12h14" />,
    language: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" /></>,
    lock: <><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    signout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9" /></>,
    signin: <><path d="M14 5h5v14h-5M10 8l-4 4 4 4M6 12h9" /></>,
  };

  return <svg className="menu-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
