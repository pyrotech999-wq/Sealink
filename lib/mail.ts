import nodemailer from "nodemailer";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
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
    // Dev fallback: no SMTP configured.
    console.info("[mail:dev-fallback]", { to: input.to, subject: input.subject, text: input.text });
    return { ok: false, error: "SMTP_NOT_CONFIGURED" };
  }

  const port = Number(portRaw);
  const secure = port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
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

