import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Centered card used by the sign-in, sign-up and password screens. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <Link to="/" className="mb-8 text-lg font-semibold tracking-tight text-foreground">
        OpenAppHub
      </Link>
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
    </main>
  );
}

export function NotConfigured() {
  return (
    <p className="text-sm text-muted-foreground">
      Sign-in isn't available yet: this site isn't connected to its database. Set{" "}
      <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
    </p>
  );
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.98h5.35c-.23 1.43-1.63 4.2-5.35 4.2-3.22 0-5.85-2.67-5.85-5.96S8.78 6.36 12 6.36c1.84 0 3.07.78 3.77 1.45l2.57-2.47C16.7 3.8 14.55 2.86 12 2.86 6.98 2.86 2.9 6.94 2.9 12s4.08 9.14 9.1 9.14c5.25 0 8.73-3.69 8.73-8.89 0-.6-.07-1.05-.15-1.5Z"
      />
    </svg>
  );
}
