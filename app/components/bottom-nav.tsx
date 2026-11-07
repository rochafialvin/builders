"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { HeaderIcon, type HeaderIconName } from "./header-icon";
import { signInPath } from "../lib/urls";

type Place = { href: string; label: string; icon: HeaderIconName };

/** The third tab: the visitor's profile, the way in, or — while the visitor is still being read — nothing yet. */
type Account = { kind: "profile"; username: string; label: string } | { kind: "signin"; label: string } | undefined;

/** Which tab the address belongs to: the activity home, another place on the bar, or the visitor's own profile. */
function tabFor(pathname: string, account: Account): string | null {
  if (pathname === "/") return "/";
  for (const place of ["/leaderboard", "/directory"]) {
    if (pathname === place || pathname.startsWith(`${place}/`)) return place;
  }
  if (account?.kind === "profile" && (pathname === `/u/${account.username}` || pathname.startsWith("/account/profile"))) {
    return `/u/${account.username}`;
  }
  return null;
}

/**
 * The phone's bottom bar. It lives in the root layout, so it is never
 * unmounted by a navigation, and it reads where it is from the address in
 * the browser: the tab you tap lights up at once, before the next page has
 * arrived, instead of after it — and nothing blinks while the page loads.
 */
export function BottomNav({ links, account, label }: { links: Place[]; account: Account; label: string }) {
  const pathname = usePathname();
  // The tab just tapped, and the page it was tapped on: once the address
  // moves on, the address itself says which tab is current again.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const current = tapped && tapped.from === pathname ? tapped.href : tabFor(pathname, account);

  const tab = (href: string, icon: HeaderIconName, text: string, key: string) => {
    const on = current === key;
    return (
      <NextLink
        key={key}
        href={href}
        aria-current={on ? "page" : undefined}
        className={on ? "is-active" : ""}
        onClick={() => {
          if (key !== tabFor(pathname, account)) setTapped({ href: key, from: pathname });
        }}
      >
        <HeaderIcon name={icon} />
        <span>{text}</span>
      </NextLink>
    );
  };

  return (
    <nav className="bottom-nav" aria-label={label}>
      {links.map((link) => tab(link.href, link.icon, link.label, link.href))}
      {account === undefined ? (
        // The skeleton's grey bars, drawn here: its module also reads the
        // request's language on the server, which a client component cannot.
        <span className="bottom-nav-placeholder" aria-hidden="true">
          <span className="skeleton bottom-nav-skel-icon" />
          <span className="skeleton bottom-nav-skel-label" />
        </span>
      ) : account.kind === "profile" ? (
        tab(`/u/${account.username}`, "profile", account.label, `/u/${account.username}`)
      ) : (
        tab(signInPath(pathname), "signin", account.label, "signin")
      )}
    </nav>
  );
}
