"use client";

import { useActionState, useState } from "react";
import { changeUsername, type UsernameState } from "../actions";
import { site } from "../lib/site";
import { useLanguage } from "./language-provider";

/**
 * Where a member picks their own /u/<username>.
 *
 * Its own form, like GitHubForm, because each section of the profile editor
 * saves on its own. The input is controlled so the address preview updates as
 * you type and the GitHub suggestion can fill it; the shared Field is
 * uncontrolled, so this one is spelled out. The handle offered is the GitHub
 * account linked at sign-in, only when nobody else holds or has left it, and
 * it never changes the name on its own. On success the
 * action redirects to the new profile, so the only state shown here is the
 * reason a change was refused.
 */
export function UsernameForm({ username, suggestion }: { username: string; suggestion?: string }) {
  const [state, formAction, pending] = useActionState(changeUsername, { username } satisfies UsernameState);
  const { tx } = useLanguage();
  const [value, setValue] = useState(state.username);

  return (
    <form className="create-form username-form" action={formAction} id="profile-url">
      <fieldset className="step tone-account">
        <legend>{tx("URL profil", "Profile URL")}</legend>
        <p className="step-intro">
          {tx(
            "Alamat profilmu. Pilih sendiri, misalnya samakan dengan handle GitHub. Huruf kecil, angka dan tanda hubung.",
            "Your profile address. Choose your own, for example the same as your GitHub handle. Lowercase letters, digits and hyphens.",
          )}
        </p>
        {state.error ? (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        ) : null}

        <div className={`field ${state.error ? "has-error" : ""}`}>
          <label htmlFor="username">{tx("Username", "Username")}</label>
          <p className="hint" id="username-preview">
            {site.url.replace(/^https?:\/\//, "")}/u/{value || username}
          </p>
          <input
            id="username"
            name="username"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby="username-preview"
            aria-invalid={state.error ? true : undefined}
            maxLength={48}
            placeholder={username}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {suggestion && suggestion !== username ? (
          <button type="button" className="username-suggest" onClick={() => setValue(suggestion)}>
            {tx(`Pakai handle GitHub-mu: ${suggestion}`, `Use your GitHub handle: ${suggestion}`)}
          </button>
        ) : null}

        <div className="gh-form-actions">
          <button className="ghost-button" type="submit" disabled={pending} aria-busy={pending || undefined}>
            {pending ? tx("Menyimpan…", "Saving…") : tx("Simpan URL", "Save URL")}
          </button>
          {state.unchanged && !pending ? (
            <span className="gh-form-saved" role="status">
              {tx("Itu sudah URL profilmu.", "That is already your profile URL.")}
            </span>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}
