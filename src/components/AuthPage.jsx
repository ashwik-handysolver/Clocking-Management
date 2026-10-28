import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, Clock, FileText, Gauge, KeyRound, LogIn, Mail, Timer, UserPlus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Button, Field, cx, inputClass } from "./ui";

/*
 * Sign in / sign up / reset password with email and password (Supabase Auth).
 * A new account automatically gets a team member profile (never admin) — see the
 * on_auth_user_created trigger in the database. The store notices the session by itself.
 *
 * Password reset: "Forgot password?" emails a link. The link opens the app signed in for
 * recovery (Supabase's PASSWORD_RECOVERY event), and the store shows this page with
 * mode="recovery" to choose a new password.
 */
export default function AuthPage({ mode: initialMode = "signin", onRecovered }) {
  // Always light, whatever the saved or system theme; the app's theme comes back after sign-in.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => root.classList.toggle("dark", wasDark);
  }, []);

  const [mode, setMode] = useState(initialMode); // signin | signup | forgot | recovery
  const [form, setForm] = useState({ name: "", role: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Back from Google (or a sign-in link) with an error, e.g. sign-in cancelled: say so and tidy the address bar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search + "&" + window.location.hash.replace(/^#/, ""));
    const code = params.get("error");
    if (!code) return;
    const description = params.get("error_description") ?? "";
    setError(
      code === "access_denied" || /cancel|denied|exchange external code/i.test(description)
        ? "Google sign-in was cancelled. Try again, or sign in with email."
        : /expired|invalid/i.test(description)
          ? "That link has expired or was already used. Request a new one."
          : friendly(description || code),
    );
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const signup = mode === "signup";

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setNotice("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    const email = form.email.trim();

    if (mode === "recovery") {
      if (form.password.length < 8) return setError("Use at least 8 characters.");
      if (form.password !== form.confirm) return setError("The two passwords don't match.");
      setBusy(true);
      const { error: err } = await supabase.auth.updateUser({ password: form.password });
      setBusy(false);
      if (err) return setError(friendly(err.message));
      return onRecovered?.(); // signed in with the new password
    }

    setBusy(true);
    if (mode === "forgot") {
      // The link comes back to this app (add this address under Supabase → Authentication → URL Configuration).
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
      setBusy(false);
      if (err) return setError(friendly(err.message));
      setNotice(`If ${email} has an account, we've sent a link to reset the password. Check your inbox.`);
      return;
    }

    const { data, error: err } = signup
      ? await supabase.auth.signUp({ email, password: form.password, options: { data: { name: form.name.trim(), role: form.role.trim() } } })
      : await supabase.auth.signInWithPassword({ email, password: form.password });
    setBusy(false);
    if (err) return setError(friendly(err.message));
    if (signup && !data.session) {
      // Email confirmation is on: no session until they click the link.
      setNotice(`We sent a confirmation link to ${email}. Open it, then sign in.`);
      setMode("signin");
      setForm((f) => ({ ...f, password: "" }));
    }
  };

  // Google sign-in: leaves for Google and comes back signed in (first time: a team member profile is created).
  const google = async () => {
    setError("");
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (err) {
      setBusy(false);
      setError(friendly(err.message));
    }
  };

  const tabs = mode === "signin" || mode === "signup";
  const heading = { forgot: "Reset your password", recovery: "Choose a new password" }[mode];
  const button = {
    signin: ["Sign in", LogIn],
    signup: ["Create account", UserPlus],
    forgot: ["Send reset link", Mail],
    recovery: ["Save new password", KeyRound],
  }[mode];

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-[linear-gradient(135deg,#fff4ea_0%,#f6efe8_45%,#efeaf8_100%)] p-4">
      {/* Background: colour blobs, a faint grid that fades out at the edges, and floating time chips */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 -left-40 size-[620px] rounded-full bg-[radial-gradient(closest-side,rgb(255_150_90/0.55),transparent)] blur-2xl" />
        <div className="absolute -right-48 -bottom-56 size-[680px] rounded-full bg-[radial-gradient(closest-side,rgb(167_139_250/0.45),transparent)] blur-2xl" />
        <div className="absolute top-1/3 right-1/4 size-[360px] rounded-full bg-[radial-gradient(closest-side,rgb(45_212_191/0.22),transparent)] blur-2xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgb(28_25_23/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(28_25_23/0.05)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <span className="absolute top-[7%] left-[3%] hidden rotate-[-8deg] rounded-2xl bg-white/80 px-3.5 py-2 text-xs font-bold text-stone-700 shadow-soft ring-1 ring-stone-900/5 backdrop-blur xl:block">
          <span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500" />
          Clocked in · 02:14:36
        </span>
        <span className="absolute right-[3%] bottom-[7%] hidden rotate-[6deg] rounded-2xl bg-white/80 px-3.5 py-2 text-xs font-bold text-stone-700 shadow-soft ring-1 ring-stone-900/5 backdrop-blur xl:block">
          <span className="mr-1.5 text-brand-600">●</span>
          32h of 40h this week
        </span>
        <span className="absolute top-[9%] right-[4%] hidden rotate-[10deg] rounded-2xl bg-white/80 px-3.5 py-2 text-xs font-bold text-stone-700 shadow-soft ring-1 ring-stone-900/5 backdrop-blur 2xl:block">
          <span className="mr-1.5 text-violet-600">●</span>
          Report ready
        </span>
      </div>

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[28px] bg-surface shadow-float ring-1 ring-stone-900/5 md:grid-cols-[1.05fr_1fr]">
        {/* Brand panel (wide screens) */}
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-orange-700 p-9 text-white md:flex md:flex-col">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.12)_1px,transparent_1px)] [background-size:18px_18px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full border-[40px] border-white/10" />
          <div className="relative flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
              <Clock className="size-5" />
            </span>
            <span className="text-xl font-extrabold tracking-tight">HandySolver</span>
          </div>
          <div className="relative mt-auto pt-16">
            <h2 className="text-3xl leading-tight font-black tracking-tight">Every hour, accounted for.</h2>
            <ul className="mt-6 space-y-3 text-sm font-medium text-white/90">
              {[
                [Timer, "Clock in on your subtasks with one click"],
                [Gauge, "Client hours and billing cycles at a glance"],
                [FileText, "Billable reports ready to download"],
              ].map(([Icon, text]) => (
                <li key={text} className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <Icon className="size-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Form */}
        <div className="p-6 sm:p-9">
          <div className="mb-6 flex items-center gap-2.5 md:hidden">
            <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow">
              <Clock className="size-5" />
            </span>
            <span className="text-xl font-extrabold tracking-tight text-stone-900">HandySolver</span>
          </div>
          {tabs && (
            <div className="mb-5">
              <h1 className="text-2xl font-black tracking-tight text-stone-900">{signup ? "Create your account" : "Welcome back"}</h1>
              <p className="mt-1 text-sm text-stone-500">{signup ? "Join your team's workspace." : "Sign in to track your time."}</p>
            </div>
          )}
          {tabs ? (
            <div role="tablist" aria-label="Sign in or sign up" className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-stone-100 p-1">
              {[
                ["signin", "Sign in"],
                ["signup", "Sign up"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mode === key}
                  onClick={() => switchMode(key)}
                  className={cx(
                    "rounded-xl py-2 text-sm font-bold transition-colors",
                    mode === key ? "bg-surface text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-5">
              {mode === "forgot" && (
                <button type="button" onClick={() => switchMode("signin")} className="mb-3 flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-stone-800">
                  <ArrowLeft className="size-3.5" /> Back to sign in
                </button>
              )}
              <h1 className="text-lg font-extrabold tracking-tight text-stone-900">{heading}</h1>
              {mode === "forgot" && <p className="mt-1 text-sm text-stone-500">Enter your email and we'll send you a link.</p>}
            </div>
          )}

          {tabs && (
            <>
              <button
                type="button"
                onClick={google}
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl bg-surface text-sm font-bold text-stone-800 shadow-sm ring-1 ring-stone-200 transition hover:bg-stone-50 hover:ring-stone-300 disabled:opacity-60"
              >
                <GoogleLogo />
                Continue with Google
              </button>
              <div className="my-4 flex items-center gap-3 text-[11px] font-bold tracking-widest text-stone-400 uppercase">
                <span className="h-px flex-1 bg-stone-200" /> or with email <span className="h-px flex-1 bg-stone-200" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-3.5">
            {signup && (
              <>
                <Field label="Full name" required>
                  <input required autoComplete="name" value={form.name} onChange={set("name")} className={inputClass} />
                </Field>
                <Field label="Role" hint="Optional">
                  <input autoComplete="organization-title" value={form.role} onChange={set("role")} className={inputClass} />
                </Field>
              </>
            )}

            {mode !== "recovery" && (
              <Field label="Email" required>
                <input required type="email" autoComplete="email" value={form.email} onChange={set("email")} className={inputClass} />
              </Field>
            )}

            {(mode === "signin" || mode === "signup") && (
              <Field label="Password" required hint={signup ? "At least 8 characters" : undefined}>
                <input
                  required
                  type="password"
                  minLength={signup ? 8 : undefined}
                  autoComplete={signup ? "new-password" : "current-password"}
                  value={form.password}
                  onChange={set("password")}
                  className={inputClass}
                />
              </Field>
            )}

            {mode === "recovery" && (
              <>
                <Field label="New password" required hint="At least 8 characters">
                  <input required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={set("password")} className={inputClass} />
                </Field>
                <Field label="Repeat new password" required>
                  <input required type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} className={inputClass} />
                </Field>
              </>
            )}

            {mode === "signin" && (
              <div className="-mt-1 flex justify-end">
                <button type="button" onClick={() => switchMode("forgot")} className="text-xs font-bold text-brand-700 hover:underline">
                  Forgot password?
                </button>
              </div>
            )}

            {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {notice && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

            <Button type="submit" variant="primary" size="lg" icon={button[1]} disabled={busy} className="w-full justify-center">
              {busy ? "Please wait…" : button[0]}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** The Google "G" (official colours). */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function friendly(message) {
  if (/provider is not enabled|unsupported provider/i.test(message)) return "Google sign-in isn't switched on yet. Ask the admin, or use email.";
  if (/invalid login credentials/i.test(message)) return "That email and password don't match.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first. Check your inbox for the link.";
  if (/already registered/i.test(message)) return "There's already an account with this email. Sign in instead.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  if (/should be different/i.test(message)) return "Choose a password different from your old one.";
  if (/weak|pwned|compromised/i.test(message)) return "That password is too easy to guess. Choose a stronger one.";
  return message;
}
