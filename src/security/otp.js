const crypto = require("node:crypto");

const CODE_TTL = 10 * 60 * 1000;
const RESEND_AFTER = 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

const SUBJECTS = {
  signup: "Your BeSafe verification code",
  email_change: "Confirm your new BeSafe email",
};

function createOtp({ store, mailer, dataKey, now }) {
  const hash = (userId, purpose, code) =>
    crypto.createHmac("sha256", dataKey).update(`${userId}:${purpose}:${code}`).digest("hex");

  async function issue(user, purpose, email) {
    const t = now();
    const existing = await store.codes.get(user.id, purpose);
    let hourStarted = t;
    let hourSends = 1;
    if (existing) {
      const wait = existing.sent_at + RESEND_AFTER - t;
      if (wait > 0) return { sent: false, waitSeconds: Math.ceil(wait / 1000) };
      if (t - existing.hour_started < HOUR) {
        if (existing.hour_sends >= MAX_SENDS_PER_HOUR) {
          return { sent: false, waitSeconds: Math.ceil((existing.hour_started + HOUR - t) / 1000), limited: true };
        }
        hourStarted = existing.hour_started;
        hourSends = existing.hour_sends + 1;
      }
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    await store.codes.save(user.id, purpose, email, hash(user.id, purpose, code), {
      expiresAt: t + CODE_TTL,
      hourStarted,
      hourSends,
    });
    await mailer.send({
      to: email,
      subject: SUBJECTS[purpose],
      text:
        `Hi ${user.name.split(" ")[0]},\n\n` +
        `Your BeSafe code is ${code}\n\n` +
        `It expires in 10 minutes. If you didn't ask for this, you can ignore this email - nobody can use it without your password.\n\n` +
        `BeSafe`,
      code,
    });
    return { sent: true, waitSeconds: RESEND_AFTER / 1000 };
  }

  async function check(user, purpose, code) {
    const row = await store.codes.get(user.id, purpose);
    if (!row || row.expires_at <= now()) return { ok: false, reason: "expired" };
    const given = Buffer.from(hash(user.id, purpose, String(code)));
    const expected = Buffer.from(row.code_hash);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
      await store.codes.remove(user.id, purpose);
      return { ok: true, email: row.email };
    }
    const attempts = await store.codes.addAttempt(user.id, purpose);
    if (attempts >= MAX_ATTEMPTS) {
      await store.codes.expire(user.id, purpose);
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "wrong", left: MAX_ATTEMPTS - attempts };
  }

  return { issue, check };
}

module.exports = { createOtp, CODE_TTL, RESEND_AFTER, MAX_ATTEMPTS, MAX_SENDS_PER_HOUR };
