let nodemailer;
try {
  nodemailer = require("nodemailer");
} catch (_) {
  nodemailer = null;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getTransport() {
  if (!nodemailer) {
    throw new Error('Nodemailer not installed. Run "npm i nodemailer" in backend/');
  }

  const host = requireEnv("SMTP_HOST");
  const port = parseInt(process.env.SMTP_PORT || "587");
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
  const user = requireEnv("SMTP_USER");
  const pass = requireEnv("SMTP_PASS");

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

async function sendEmail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from) throw new Error("Missing SMTP_FROM or SMTP_USER for from address");
  if (!to) throw new Error("Missing recipient email");

  const transport = getTransport();
  const info = await transport.sendMail({
    from,
    to,
    subject: subject || "(no subject)",
    text: text || "",
    html: html || undefined
  });

  return info;
}

module.exports = {
  sendEmail
};

