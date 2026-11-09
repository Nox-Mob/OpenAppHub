// Public site chrome: header and footer for the landing page and other hub pages.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { docsUrl } from "@shared/docs";
import { openCookieSettings } from "@shared/consent";
import { ThemeToggle } from "@shared/ui/ThemeToggle";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { APPS } from "@/config/apps";

/** The OpenAppHub mark: one frame, the three apps' accents inside. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span
        aria-hidden="true"
        className="grid size-7 grid-cols-2 gap-0.5 rounded-md bg-primary p-1.5 shadow-sm"
      >
        <span data-app="charter" className="rounded-[2px] bg-app-accent" />
        <span data-app="board" className="rounded-[2px] bg-app-accent" />
        <span data-app="ledger" className="rounded-[2px] bg-app-accent" />
        <span className="rounded-[2px] bg-primary-foreground/90" />
      </span>
      OpenAppHub
    </span>
  );
}

export function signupsOpen() {
  return import.meta.env.VITE_SIGNUPS_OPEN !== "false";
}

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="OpenAppHub home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 text-sm md:flex">
          {!signedIn ? (
            <>
              <a
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                href="/#apps"
              >
                Apps
              </a>
              <a
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                href="/#pricing"
              >
                Pricing
              </a>
              <a
                className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                href="/#self-hosting"
              >
                Self-hosting
              </a>
            </>
          ) : null}
          <a
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            href={docsUrl("hub/")}
          >
            Docs
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          {signedIn ? (
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
              {signupsOpen() ? (
                <Button asChild size="sm" className="hidden sm:inline-flex">
                  <Link to="/signup">Start free trial</Link>
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <ul className="mt-3 space-y-2 text-sm">{children}</ul>
    </div>
  );
}

export function SiteFooter() {
  const link = "text-foreground/80 hover:text-foreground hover:underline underline-offset-4";
  return (
    <footer className="border-t bg-sidebar">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Open-source apps for associations, boards and nonprofits. Hosted for you, or run them
            yourself.
          </p>
          <ThemeToggle className="mt-4 sm:hidden" />
        </div>
        <FooterCol title="Apps">
          {APPS.map((a) => (
            <li key={a.id}>
              <a className={link} href={`/#${a.id}`}>
                {a.name}
              </a>
            </li>
          ))}
        </FooterCol>
        <FooterCol title="Resources">
          <li>
            <a className={link} href={docsUrl("hub/")}>
              Docs
            </a>
          </li>
          <li>
            <a className={link} href="/#self-hosting">
              Self-hosting
            </a>
          </li>
          <li>
            <a className={link} href="/#pricing">
              Pricing
            </a>
          </li>
        </FooterCol>
        <FooterCol title="Legal">
          <li>
            <Link className={link} to="/terms">
              Terms of Service
            </Link>
          </li>
          <li>
            <Link className={link} to="/privacy">
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link className={link} to="/cookies">
              Cookie policy
            </Link>
          </li>
          <li>
            <button type="button" className={link} onClick={() => openCookieSettings()}>
              Cookie settings
            </button>
          </li>
        </FooterCol>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          © {new Date().getUTCFullYear()} OpenAppHub. The apps are open source.
        </p>
      </div>
    </footer>
  );
}
