function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function htmlFor(text, code) {
  const body = escapeHtml(text).replace(code, `</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:16px 0">${code}</p><p>`);
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;color:#111"><p>${body.replace(/\n\n/g, "</p><p>")}</p></div>`;
}

function createMailer(config) {
  if (config.smtpHost) {
    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
    return {
      mode: "smtp",
      send: ({ to, subject, text, code }) =>
        transport.sendMail({ from: config.mailFrom, to, subject, text, html: htmlFor(text, code) }),
    };
  }

  return {
    mode: "console",
    async send({ to, subject, code }) {
      console.log(`[email not configured] ${subject} for ${to}: ${code}`);
    },
  };
}

module.exports = { createMailer };
