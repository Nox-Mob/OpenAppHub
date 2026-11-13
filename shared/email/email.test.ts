// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { emailConfigFromEnv, isBlockedAddress, runEmailCycle } from "./deliver";
import { resendTransport } from "./resend";
import { decryptSecret, encryptSecret, signUnsubscribe, verifyUnsubscribe } from "./secret";
import { buildMime, smtpTransport, type SmtpConnect, type SmtpSocket } from "./smtp";
import { renderEmail } from "./templates";
import { EmailSendError, type OutboxRow } from "./types";
import { handleUnsubscribe } from "./unsubscribe";

const row = (over: Partial<OutboxRow> = {}): OutboxRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  org_id: "22222222-2222-4222-8222-222222222222",
  app: "board",
  template: "board.meeting_reminder",
  category: "reminders",
  to_user_id: "33333333-3333-4333-8333-333333333333",
  to_email: "bob@lakeview.test",
  to_name: "Bob Tremblay",
  org_name: "Lakeview <Condo> Association",
  org_time_zone: "America/Chicago",
  data: {
    title: "Budget meeting",
    starts_at: "2026-11-20T00:30:00Z",
    days: 7,
    link: "/board/meetings/m1",
  },
  attempts: 1,
  ...over,
});

const ctx = {
  urls: { hub: "https://openapphub.org", board: "https://board.openapphub.org" },
  preferencesUrl: "https://openapphub.org/account#email",
  unsubscribeUrl: "https://openapphub.org/email/unsubscribe?u=x",
};

describe("templates", () => {
  it("renders a meeting reminder in the org's time zone, escaped, with text and links", () => {
    const r = renderEmail(row(), ctx);
    expect(r.subject).toBe("Board meeting in 7 days: Budget meeting");
    // 00:30 UTC on the 20th is 6:30 PM on the 19th in Chicago.
    expect(r.text).toContain("When: Nov 19, 2026, 6:30 PM");
    expect(r.html).toContain("Lakeview &lt;Condo&gt; Association");
    expect(r.html).not.toContain("<Condo>");
    expect(r.html).toContain('href="https://board.openapphub.org/board/meetings/m1"');
    expect(r.text).toContain("Unsubscribe: https://openapphub.org/email/unsubscribe?u=x");
  });

  it("renders the digest with overdue tasks marked", () => {
    const r = renderEmail(
      row({
        app: "hub",
        template: "digest",
        category: "digest",
        data: {
          period: "weekly",
          tasks: [
            {
              app: "board",
              title: "Send the budget",
              due_on: "2026-11-01",
              link: "/board/tasks",
              overdue: true,
            },
            { app: "charter", title: "Review 2 join requests", link: "/orgs/x/members" },
          ],
        },
      }),
      ctx,
    );
    expect(r.subject).toBe("2 open tasks this week: Lakeview <Condo> Association");
    expect(r.text).toContain("Send the budget (OpenBoardApp · due Nov 1, 2026, overdue)");
    expect(r.html).toContain("(overdue)");
  });

  it("groups a digest across several organizations", () => {
    const r = renderEmail(
      row({
        app: "hub",
        template: "digest",
        category: "digest",
        org_id: null,
        data: {
          period: "daily",
          orgs: [
            {
              org_id: "a",
              org_name: "Riverside",
              tasks: [{ app: "ledger", title: "Record rent", due_on: "2026-11-01", link: "/x" }],
              meetings: [],
            },
            {
              org_id: "b",
              org_name: "Northstar & Co",
              tasks: [],
              meetings: [
                { title: "Budget", meeting_date: "2026-11-20", start_time: "6:30 PM", link: "/m" },
              ],
            },
          ],
        },
      }),
      ctx,
    );
    expect(r.subject).toBe("1 open task today: 2 organizations");
    expect(r.html).toContain("Northstar &amp; Co");
    expect(r.text).toContain("Riverside");
    expect(r.text).toContain("Budget");
  });

  it("renders a workflow's own message", () => {
    const r = renderEmail(
      row({
        template: "automation.message",
        category: "essential",
        data: {
          subject: "Award for Pat",
          message: "Rank PFC.\n\nPlease review <soon>.",
          workflow: "Award routing",
          link: "/orgs/x",
          link_app: "board",
        },
      }),
      ctx,
    );
    expect(r.subject).toBe("Award for Pat");
    expect(r.text).toContain("Please review <soon>.");
    expect(r.html).toContain("Please review &lt;soon&gt;.");
    expect(r.text).toContain('Sent by the "Award routing" workflow.');
    expect(r.html).toContain("https://board.openapphub.org/orgs/x");
  });

  it("renders a notification with its organization and link", () => {
    const r = renderEmail(
      row({
        template: "notification",
        category: "billing",
        data: {
          title: "A payment didn't go through",
          body: "Update your card to keep your plan.",
          org_name: "Riverside",
          link: "/billing",
          link_app: "hub",
        },
      }),
      ctx,
    );
    expect(r.subject).toBe("A payment didn't go through · Riverside");
    expect(r.text).toContain("Update your card to keep your plan.");
    expect(r.text).toContain("which notifications you get");
  });

  it("has buttons to act when the organization allows it, and says what's waiting either way", () => {
    const token = "a".repeat(64);
    const base = {
      template: "notification",
      category: "essential" as const,
      app: "hub",
      data: {
        title: "An award submission is pending your approval",
        link: "/approvals/x",
        link_app: "hub",
      },
    };
    const off = renderEmail(row({ ...base, data: { ...base.data, actions: [] } }), ctx);
    expect(off.text).toContain("An award submission is pending your approval");
    expect(off.text).not.toContain("/act/");
    expect(off.text).toContain("Open it: https://openapphub.org/approvals/x");
    const on = renderEmail(
      row({
        ...base,
        data: {
          ...base.data,
          actions: [
            { label: "Approve", token },
            { label: "Decline", token: "b".repeat(64) },
            { label: "Bad", token: "not-a-token" },
          ],
        },
      }),
      ctx,
    );
    expect(on.text).toContain(`Approve: https://openapphub.org/act/${token}`);
    expect(on.text).toContain("Decline: https://openapphub.org/act/");
    expect(on.text).not.toContain("Bad:");
    expect(on.text).toContain("work once, for 7 days");
    expect(on.html).toContain(">Approve</a>");
  });

  it("shows Board's meeting date and start time as given", () => {
    const r = renderEmail(
      row({
        data: { title: "Budget", meeting_date: "2026-11-20", start_time: "6:30 PM", days: 1 },
      }),
      ctx,
    );
    expect(r.subject).toBe("Board meeting tomorrow: Budget");
    expect(r.text).toContain("When: Nov 20, 2026, 6:30 PM");
  });

  it("refuses unknown templates", () => {
    expect(() => renderEmail(row({ template: "nope" }), ctx)).toThrow(/Unknown email template/);
  });
});

describe("secret", () => {
  it("signs and verifies unsubscribe links", async () => {
    const sig = await signUnsubscribe("k", "u1", "digest");
    expect(await verifyUnsubscribe("k", "u1", "digest", sig)).toBe(true);
    expect(await verifyUnsubscribe("k", "u1", "reminders", sig)).toBe(false);
    expect(await verifyUnsubscribe("other", "u1", "digest", sig)).toBe(false);
    expect(await verifyUnsubscribe("k", "u1", "digest", "garbage")).toBe(false);
  });

  it("encrypts the SMTP password", async () => {
    const stored = await encryptSecret("k", "p@ss wörd");
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain("p@ss");
    expect(await decryptSecret("k", stored)).toBe("p@ss wörd");
    expect(await decryptSecret("other", stored)).toBeNull();
    expect(await decryptSecret("k", null)).toBeNull();
  });
});

describe("resend", () => {
  const msg = {
    from: "OpenAppHub <n@openapphub.org>",
    to: "bob@lakeview.test",
    subject: "Hi",
    html: "<p>Hi</p>",
    text: "Hi",
    idempotencyKey: "row-1",
  };

  it("posts the email with an idempotency key", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }),
    );
    const t = resendTransport({ apiKey: "re_test", fetch: fetchMock as unknown as typeof fetch });
    expect(await t.send(msg)).toEqual({ id: "re_1" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("row-1");
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: ["bob@lakeview.test"],
      subject: "Hi",
    });
  });

  it("retries 429 and 5xx but not other errors", async () => {
    const reply = (status: number) =>
      resendTransport({
        apiKey: "k",
        fetch: (async () =>
          new Response(JSON.stringify({ message: "nope" }), { status })) as unknown as typeof fetch,
      });
    await expect(reply(429).send(msg)).rejects.toMatchObject({ retry: true });
    await expect(reply(503).send(msg)).rejects.toMatchObject({ retry: true });
    await expect(reply(422).send(msg)).rejects.toMatchObject({
      retry: false,
      message: "Resend 422: nope",
    });
  });
});

/** A fake mail server speaking just enough SMTP. */
function fakeServer(opts: { starttls?: boolean; auth?: string; rejectRcpt?: number } = {}) {
  const log: string[] = [];
  let data = "";
  let tls = false;
  const make = (): SmtpSocket => {
    let push!: (s: string) => void;
    const readable = new ReadableStream<Uint8Array>({
      start(c) {
        push = (s) => c.enqueue(new TextEncoder().encode(s));
      },
    });
    let inData = false;
    let pending = "";
    const ehlo = () =>
      [
        "250-fake.test",
        ...(opts.starttls && !tls ? ["250-STARTTLS"] : []),
        `250 AUTH ${opts.auth ?? "PLAIN LOGIN"}`,
      ].join("\r\n") + "\r\n";
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        pending += new TextDecoder().decode(chunk);
        if (inData) {
          const end = pending.indexOf("\r\n.\r\n");
          if (end === -1) return;
          data = pending.slice(0, end);
          pending = pending.slice(end + 5);
          inData = false;
          push("250 2.0.0 Ok: queued as ABC123\r\n");
          return;
        }
        let nl;
        while ((nl = pending.indexOf("\r\n")) !== -1) {
          const line = pending.slice(0, nl);
          pending = pending.slice(nl + 2);
          log.push(line);
          if (line.startsWith("EHLO")) push(ehlo());
          else if (line === "STARTTLS") push("220 Go ahead\r\n");
          else if (line.startsWith("AUTH PLAIN")) push("235 OK\r\n");
          else if (line === "AUTH LOGIN") push("334 VXNlcm5hbWU6\r\n");
          else if (log.at(-2) === "AUTH LOGIN") push("334 UGFzc3dvcmQ6\r\n");
          else if (log.at(-3) === "AUTH LOGIN") push("235 OK\r\n");
          else if (line.startsWith("MAIL FROM")) push("250 OK\r\n");
          else if (line.startsWith("RCPT TO"))
            push(opts.rejectRcpt ? `${opts.rejectRcpt} No such user\r\n` : "250 OK\r\n");
          else if (line === "DATA") {
            inData = true;
            push("354 End with .\r\n");
          } else if (line === "QUIT") push("221 Bye\r\n");
          else push("500 What?\r\n");
        }
      },
    });
    return {
      readable,
      writable,
      startTls() {
        tls = true;
        log.push("<tls>");
        return make();
      },
      close() {},
    };
  };
  // The first socket sends the greeting before anything else.
  const greetingConnect: SmtpConnect = () => {
    const s = make();
    const reader = s.readable;
    const greeted = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(new TextEncoder().encode("220 fake.test ESMTP\r\n"));
        const r = reader.getReader();
        for (;;) {
          const { value, done } = await r.read();
          if (done) break;
          c.enqueue(value);
        }
      },
    });
    return { ...s, readable: greeted, startTls: s.startTls.bind(s) };
  };
  return { connect: greetingConnect, log, data: () => data };
}

const message = {
  from: "Lakeview Board <board@lakeview.test>",
  to: "Bob Tremblay <bob@lakeview.test>",
  subject: "Réunion du conseil",
  html: "<p>Hi</p>",
  text: "Hi\n.leading dot",
};

describe("smtp", () => {
  it("sends with STARTTLS and AUTH PLAIN", async () => {
    const server = fakeServer({ starttls: true });
    const t = smtpTransport(
      { host: "mail.test", port: 587, security: "starttls", username: "u", password: "p" },
      { connect: server.connect },
    );
    expect(await t.send(message)).toEqual({ id: "ABC123" });
    expect(server.log).toEqual([
      "EHLO openapphub.local",
      "STARTTLS",
      "<tls>",
      "EHLO openapphub.local",
      `AUTH PLAIN ${btoa("\0u\0p")}`,
      "MAIL FROM:<board@lakeview.test>",
      "RCPT TO:<bob@lakeview.test>",
      "DATA",
      "QUIT",
    ]);
    expect(server.data()).toContain("Subject: =?UTF-8?B?");
    expect(server.data()).toContain('From: "Lakeview Board" <board@lakeview.test>');
  });

  it("uses AUTH LOGIN when PLAIN isn't offered", async () => {
    const server = fakeServer({ auth: "LOGIN" });
    const t = smtpTransport(
      { host: "mail.test", port: 465, security: "tls", username: "u", password: "p" },
      { connect: server.connect },
    );
    await t.send(message);
    expect(server.log.slice(1, 4)).toEqual(["AUTH LOGIN", btoa("u"), btoa("p")]);
  });

  it("refuses STARTTLS when the server doesn't offer it, without retrying", async () => {
    const server = fakeServer({ starttls: false });
    const t = smtpTransport(
      { host: "mail.test", port: 587, security: "starttls" },
      { connect: server.connect },
    );
    await expect(t.send(message)).rejects.toMatchObject({ retry: false });
  });

  it("treats 5xx as permanent and 4xx as temporary", async () => {
    const perm = smtpTransport(
      { host: "m", port: 587, security: "none" },
      { connect: fakeServer({ rejectRcpt: 550 }).connect },
    );
    await expect(perm.send(message)).rejects.toMatchObject({ retry: false });
    const temp = smtpTransport(
      { host: "m", port: 587, security: "none" },
      { connect: fakeServer({ rejectRcpt: 451 }).connect },
    );
    await expect(temp.send(message)).rejects.toBeInstanceOf(EmailSendError);
    await expect(
      smtpTransport(
        { host: "m", port: 587, security: "none" },
        { connect: fakeServer({ rejectRcpt: 451 }).connect },
      ).send(message),
    ).rejects.toMatchObject({ retry: true });
  });

  it("builds MIME with both parts in base64", () => {
    const mime = buildMime(
      { ...message, to: "bob@lakeview.test" },
      { now: new Date("2026-11-12T10:00:00Z"), messageId: "<m@x>" },
    );
    expect(mime).toContain("Date: Thu, 12 Nov 2026 10:00:00 +0000");
    expect(mime).toContain("Content-Type: multipart/alternative");
    expect(mime).toContain(btoa("<p>Hi</p>"));
    expect(mime).toContain("To: bob@lakeview.test");
  });
});

describe("sender", () => {
  it("blocks demo and documentation addresses", () => {
    expect(isBlockedAddress("demo@demo.openapphub.org")).toBe(true);
    expect(isBlockedAddress("someone@example.org")).toBe(true);
    expect(isBlockedAddress("bob@lakeview.org")).toBe(false);
  });

  it("chooses Resend, then SMTP from the environment, then the saved settings", async () => {
    expect((await emailConfigFromEnv({ RESEND_API_KEY: "re" }, null))?.source).toBe("resend");
    expect((await emailConfigFromEnv({ SMTP_HOST: "mail.test" }, null))?.source).toBe("smtp-env");
    expect(await emailConfigFromEnv({}, null)).toBeNull();
    const enc = await encryptSecret("srk", "pw");
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                smtp_host: "mail.test",
                smtp_port: 465,
                smtp_security: "tls",
                smtp_username: "u",
                smtp_password_enc: enc,
                from_address: "b@l.test",
                from_name: "Lakeview",
                reply_to: null,
              },
            }),
          }),
        }),
      }),
    };
    const c = await emailConfigFromEnv({ SUPABASE_SERVICE_ROLE_KEY: "srk" }, admin as never);
    expect(c).toMatchObject({ source: "smtp-settings", from: "Lakeview <b@l.test>" });
  });

  it("runs jobs, sends, suppresses demo addresses and records failures", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const rows = [
      row(),
      row({ id: "demo", to_email: "demo@demo.openapphub.org" }),
      row({ id: "bad", template: "nope" }),
      row({ id: "boom", to_email: "boom@lakeview.test" }),
    ];
    const admin = {
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        calls.push([fn, args]);
        if (fn === "run_email_jobs") return { data: 2, error: null };
        if (fn === "claim_emails") return { data: rows, error: null };
        return { data: null, error: null };
      },
    };
    const send = vi.fn(async (m: { to: string; headers?: Record<string, string> }) => {
      if (m.to.includes("boom")) throw new EmailSendError("Recipient refused", false);
      return { id: "p1" };
    });
    const result = await runEmailCycle({
      admin: admin as never,
      config: {
        transport: { kind: "resend", send },
        from: "OpenAppHub <n@openapphub.org>",
        source: "resend",
      },
      urls: ctx.urls,
      preferencesUrl: ctx.preferencesUrl,
      unsubscribeBase: "https://openapphub.org",
      secret: "srk",
    });
    expect(result).toEqual({ queuedByJobs: 2, sent: 1, retried: 0, failed: 2, suppressed: 1 });
    const first = send.mock.calls[0]![0] as { to: string; headers: Record<string, string> };
    expect(first.to).toBe("Bob Tremblay <bob@lakeview.test>");
    expect(first.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const finishes = calls
      .filter(([fn]) => fn === "finish_email")
      .map(([, a]) => [a?.["p_id"], a?.["p_outcome"]]);
    expect(finishes).toEqual([
      [rows[0]!.id, "sent"],
      ["demo", "suppressed"],
      ["bad", "failed"],
      ["boom", "failed"],
    ]);
  });
});

describe("unsubscribe", () => {
  const user = "33333333-3333-4333-8333-333333333333";
  it("asks first on GET, unsubscribes on POST, and refuses bad links", async () => {
    const sig = await signUnsubscribe("srk", user, "digest");
    const url = `https://openapphub.org/email/unsubscribe?u=${user}&c=digest&s=${sig}`;
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const opts = {
      admin: { rpc } as never,
      secret: "srk",
      preferencesUrl: "https://openapphub.org/account",
    };
    const get = await handleUnsubscribe(new Request(url), opts);
    expect(await get.text()).toContain('<form method="post">');
    expect(rpc).not.toHaveBeenCalled();
    const post = await handleUnsubscribe(new Request(url, { method: "POST" }), opts);
    expect(await post.text()).toContain("You're unsubscribed");
    expect(rpc).toHaveBeenCalledWith("email_unsubscribe", { p_user: user, p_category: "digest" });
    const bad = await handleUnsubscribe(new Request(url.replace("c=digest", "c=reminders")), opts);
    expect(bad.status).toBe(400);
  });
});
