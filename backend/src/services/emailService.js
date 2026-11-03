import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD } =
    process.env;
  const port = Number(SMTP_PORT);

  if (!SMTP_HOST || !Number.isInteger(port) || !process.env.EMAIL_FROM) {
    throw new Error("Email delivery is not configured");
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE === "true",
    ...(SMTP_USER && SMTP_PASSWORD
      ? { auth: { user: SMTP_USER, pass: SMTP_PASSWORD } }
      : {}),
  });

  return transporter;
}

export function buildActionUrl(path, token) {
  const baseUrl = process.env.PUBLIC_APP_URL;

  if (!baseUrl) throw new Error("PUBLIC_APP_URL is not configured");

  const url = new URL(path, baseUrl);
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];

  if (
    (url.protocol !== "https:" && !localHosts.includes(url.hostname)) ||
    url.username ||
    url.password
  ) {
    throw new Error("PUBLIC_APP_URL must use HTTPS outside local development");
  }

  if (!url.searchParams.has("token")) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}

async function sendActionEmail({ to, subject, text }) {
  const from = process.env.EMAIL_FROM;

  if (!from) throw new Error("EMAIL_FROM is not configured");

  await getTransporter().sendMail({ from, to, subject, text });
}

export async function sendClaimInvitation({ email, fullName, token }) {
  const claimUrl = buildActionUrl("/claim", token);

  await sendActionEmail({
    to: email,
    subject: "Claim your LinkBase profile",
    text: `Hello ${fullName},\n\nAn administrator invited you to claim your LinkBase profile. Verify this email address and create your password using this one-time link (expires in 24 hours):\n\n${claimUrl}\n\nIf you were not expecting this invitation, you can ignore this email.`,
  });
}

export async function sendPasswordResetEmail({ email, token }) {
  const resetUrl = buildActionUrl("/reset-password", token);

  await sendActionEmail({
    to: email,
    subject: "Reset your LinkBase password",
    text: `We received a request to reset the password for this LinkBase account. Use this one-time link within 30 minutes:\n\n${resetUrl}\n\nIf you did not request a reset, you can ignore this email.`,
  });
}
