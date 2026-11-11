import assert from "node:assert/strict";
import test from "node:test";
import {
  isDevelopmentAuthBypassEnabled,
  isAllowedGithubAccount,
  isWorkspaceUserAllowed,
} from "../.test-tmp/workspace-authorization.js";

test("the test authentication bypass is limited to development", () => {
  assert.equal(isDevelopmentAuthBypassEnabled("development", "1"), true);
  assert.equal(isDevelopmentAuthBypassEnabled("production", "1"), false);
  assert.equal(isDevelopmentAuthBypassEnabled("development", "true"), false);
});

test("workspace access requires an authenticated user and configured allowlist", () => {
  assert.equal(isWorkspaceUserAllowed(null, "user_123"), false);
  assert.equal(isWorkspaceUserAllowed("user_123", ""), false);
  assert.equal(isWorkspaceUserAllowed("user_123", " ,  "), false);
  assert.equal(isWorkspaceUserAllowed("user_123", undefined), false);
});

test("workspace access matches only exact IDs from the comma-separated allowlist", () => {
  assert.equal(isWorkspaceUserAllowed("12345", " 12345, 67890 "), true);
  assert.equal(isWorkspaceUserAllowed("1234", "12345"), false);
});

test("GitHub sign-in is restricted to allowlisted numeric account IDs", () => {
  assert.equal(isAllowedGithubAccount("github", "12345", "12345,67890"), true);
  assert.equal(isAllowedGithubAccount("github", "1234", "12345"), false);
  assert.equal(isAllowedGithubAccount("github", "collaborator", "collaborator"), false);
  assert.equal(isAllowedGithubAccount("google", "12345", "12345"), false);
  assert.equal(isAllowedGithubAccount("github", "12345", ""), false);
});
