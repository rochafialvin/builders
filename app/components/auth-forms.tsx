"use client";

import { useActionState, useState } from "react";
import {
  signIn,
  updatePassword,
  type AuthState,
} from "../auth-actions";
import { useLanguage } from "./language-provider";

const EMPTY: AuthState = { values: {} };

export function SignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, EMPTY);
  const { tx } = useLanguage();

  return (
    <form className="auth-form signin-form" action={formAction}>
      <Message state={state} />
      <input type="hidden" name="next" value={next} />


      <div className="auth-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="nama@email.com"
          required
          defaultValue={state.values.email}
        />
      </div>

      <div className="auth-field">
        {/* No "forgot password": resetting one needs email the site does not send (#211). */}
        <label htmlFor="password">{tx("Kata sandi", "Password")}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder={tx("Masukkan kata sandi", "Enter your password")}
          required
        />
      </div>

      <button className="primary-button auth-submit" type="submit" disabled={pending} aria-busy={pending || undefined}>
        <span>{pending ? tx("Mohon tunggu…", "Please wait…") : tx("Masuk dengan email", "Sign in with email")}</span>
        {!pending ? <span aria-hidden="true">→</span> : null}
      </button>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, EMPTY);
  const { tx } = useLanguage();

  return (
    <form className="auth-form" action={formAction}>
      <Message state={state} />

      <label htmlFor="password">{tx("Kata sandi baru", "New password")}</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
      />
      <p className="hint">{tx("Minimal 8 karakter.", "At least 8 characters.")}</p>

      <label htmlFor="confirm">{tx("Ulangi kata sandi baru", "Repeat new password")}</label>
      <input
        id="confirm"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
      />

      <button className="primary-button" type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? tx("Menyimpan…", "Saving…") : tx("Simpan kata sandi", "Save password")}
      </button>
    </form>
  );
}

/**
 * A link, not a submit button.
 *
 * Starting the sign-in has to hand the browser a cookie — the PKCE verifier —
 * on the same response that sends it to the provider. That is what
 * `/auth/google` and `/auth/github` do. Going through a form action meant the verifier had to survive an action
 * response and a client-side navigation off-site first, which is where it was
 * being lost. A link also works with JavaScript switched off.
 */
export function ProviderButton({ provider, next }: { provider: "google" | "github"; next: string }) {
  const { tx } = useLanguage();
  const [pending, setPending] = useState(false);
  const start = `/auth/${provider}`;
  const href = next === "/" ? start : `${start}?next=${encodeURIComponent(next)}`;

  return (
    <a
      className={`google-auth-button auth-provider-${provider}`}
      href={href}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={(event) => {
        const plainClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
        if (!plainClick) return;
        if (pending) {
          event.preventDefault();
          return;
        }
        setPending(true);
      }}
    >
      {pending ? <span className="action-spinner" aria-hidden="true" /> : provider === "google" ? <GoogleMark /> : <GitHubMark />}
      <span>
        {pending
          ? tx("Menghubungkan…", "Connecting…")
          : provider === "google"
            ? tx("Lanjutkan dengan Google", "Continue with Google")
            : tx("Lanjutkan dengan GitHub", "Continue with GitHub")}
      </span>
    </a>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19">
      <path
        fill="#4285f4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.01v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.38Z"
      />
      <path
        fill="#34a853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.4l-3.24-2.52c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#fbbc05"
        d="M6.39 13.91A6.01 6.01 0 0 1 6.07 12c0-.66.11-1.3.32-1.91v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.51l3.35-2.6Z"
      />
      <path
        fill="#ea4335"
        d="M12 5.96c1.47 0 2.78.5 3.81 1.49l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.49l3.35 2.6C7.18 7.72 9.39 5.96 12 5.96Z"
      />
    </svg>
  );
}

function Message({ state }: { state: AuthState }) {
  if (state.error) {
    return (
      <p className="form-error" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p className="form-notice" role="status">
        {state.notice}
      </p>
    );
  }
  return null;
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
      />
    </svg>
  );
}
