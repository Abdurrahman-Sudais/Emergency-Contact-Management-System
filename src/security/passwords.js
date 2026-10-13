const crypto = require("node:crypto");
const { promisify } = require("node:util");

const argon2 = promisify(crypto.argon2);

const PARAMS = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 };

async function derive(password, salt, params) {
  return argon2("argon2id", {
    message: Buffer.from(String(password), "utf8"),
    nonce: salt,
    memory: params.memory,
    passes: params.passes,
    parallelism: params.parallelism,
    tagLength: params.tagLength,
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await derive(password, salt, PARAMS);
  return (
    `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}` +
    `$${salt.toString("base64url")}$${hash.toString("base64url")}`
  );
}

function parse(phc) {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([\w-]+)\$([\w-]+)$/.exec(phc || "");
  if (!m) return null;
  const expected = Buffer.from(m[5], "base64url");
  return {
    params: { memory: +m[1], passes: +m[2], parallelism: +m[3], tagLength: expected.length },
    salt: Buffer.from(m[4], "base64url"),
    expected,
  };
}

async function verifyPassword(password, phc) {
  const parsed = parse(phc);
  if (!parsed) return false;
  const actual = await derive(password, parsed.salt, parsed.params);
  return crypto.timingSafeEqual(actual, parsed.expected);
}

let dummyHash = null;
async function burnTime(password) {
  dummyHash ??= await hashPassword("not-a-real-password!");
  await verifyPassword(password, dummyHash);
  return false;
}

module.exports = { hashPassword, verifyPassword, burnTime };
