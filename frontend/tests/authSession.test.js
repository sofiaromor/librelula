import test from "node:test";
import assert from "node:assert/strict";

import {
  isValidVerificationCode,
  normalizeAuthEmail,
  normalizeVerificationCode,
} from "../src/lib/authUtils.js";

test("verification codes are six numeric characters", () => {
  assert.equal(isValidVerificationCode("123456"), true);
  assert.equal(isValidVerificationCode("123 456"), true);
  assert.equal(isValidVerificationCode("12345a"), false);
  assert.equal(isValidVerificationCode("12345"), false);
});

test("auth values are normalized before Supabase receives them", () => {
  assert.equal(normalizeAuthEmail("  Lector@EJEMPLO.COM "), "lector@ejemplo.com");
  assert.equal(normalizeVerificationCode(" 123 456 "), "123456");
});
