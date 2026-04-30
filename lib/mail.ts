import nodemailer from "nodemailer";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** True when minimal SMTP env is present (does not verify credentials). */
export function isSmtpConfigured(): boolean {
  const host = env("SMTP_HOST");
  const portRaw = env("SMTP_PORT");
  const from = env("SMTP_FROM") || env("SMTP_USER");
  return Boolean(host && portRaw && from);
}

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail(input: SendMailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const host = env("SMTP_HOST");
  const portRaw = env("SMTP_PORT");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  const from = env("SMTP_FROM") || user;

  if (!host || !portRaw || !from) {
    console.info("[mail:not-configured] set SMTP_HOST, SMTP_PORT, SMTP_FROM (and usually SMTP_USER + SMTP_PASS)", {
      to: input.to,
      subject: input.subject,
    });
    return { ok: false, error: "SMTP_NOT_CONFIGURED" };
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    return { ok: false, error: "SMTP_INVALID_PORT" };
  }

  const secureEnv = env("SMTP_SECURE").toLowerCase();
  const secure =
    secureEnv === "true" || secureEnv === "1"
      ? true
      : secureEnv === "false" || secureEnv === "0"
        ? false
        : port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    ...(port === 587 ? { requireTLS: true } : {}),
  });

  try {
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

