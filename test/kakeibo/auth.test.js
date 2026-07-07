import { test } from "node:test";
import assert from "node:assert/strict";

import { ALLOWED_EMAILS } from "../../src/kakeibo/authConfig.js";
import {
  decodeGoogleJwtPayload,
  isEmailAllowed,
  isSessionValid,
  sessionFromJwtPayload,
  validateGoogleCredential,
} from "../../src/kakeibo/googleAuth.js";

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

test("isEmailAllowed accepts only the configured Gmail addresses", () => {
  assert.equal(isEmailAllowed("tsu4480@gmail.com", ALLOWED_EMAILS), true);
  assert.equal(isEmailAllowed("TOMOPRI320@GMAIL.COM", ALLOWED_EMAILS), true);
  assert.equal(isEmailAllowed("other@gmail.com", ALLOWED_EMAILS), false);
  assert.equal(isEmailAllowed("", ALLOWED_EMAILS), false);
});

test("decodeGoogleJwtPayload decodes a JWT payload", () => {
  const jwt = makeJwt({ email: "tsu4480@gmail.com", name: "Test User", exp: 4_102_444_800 });
  const payload = decodeGoogleJwtPayload(jwt);
  assert.equal(payload.email, "tsu4480@gmail.com");
  assert.equal(payload.name, "Test User");
});

test("validateGoogleCredential accepts an allowlisted email", () => {
  const jwt = makeJwt({
    email: "tomopri320@gmail.com",
    name: "Tomo",
    picture: "https://example.com/avatar.png",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const session = validateGoogleCredential(jwt, ALLOWED_EMAILS);
  assert.deepEqual(session, sessionFromJwtPayload({
    email: "tomopri320@gmail.com",
    name: "Tomo",
    picture: "https://example.com/avatar.png",
    exp: Math.floor(Date.now() / 1000) + 3600,
  }));
});

test("validateGoogleCredential rejects a non-allowlisted email", () => {
  const jwt = makeJwt({
    email: "stranger@gmail.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  assert.throws(
    () => validateGoogleCredential(jwt, ALLOWED_EMAILS),
    /ログインが許可されていません/
  );
});

test("validateGoogleCredential rejects an expired credential", () => {
  const jwt = makeJwt({
    email: "tsu4480@gmail.com",
    exp: Math.floor(Date.now() / 1000) - 60,
  });
  assert.throws(() => validateGoogleCredential(jwt, ALLOWED_EMAILS), /有効期限が切れています/);
});

test("isSessionValid checks email and expiry", () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const past = Math.floor(Date.now() / 1000) - 60;
  assert.equal(isSessionValid({ email: "tsu4480@gmail.com", exp: future }), true);
  assert.equal(isSessionValid({ email: "tsu4480@gmail.com", exp: past }), false);
  assert.equal(isSessionValid(null), false);
});
