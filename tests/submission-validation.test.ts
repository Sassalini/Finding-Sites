import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWebsiteUrl } from "../src/lib/submissions/validation";

test("normalises public domains and strips fragments", () => {
  assert.deepEqual(normalizeWebsiteUrl("WWW.Example.com/path#private"), { url: "https://www.example.com/path", domain: "example.com" });
});

test("rejects unsafe and local URL protocols", () => {
  assert.ok("error" in normalizeWebsiteUrl("javascript:alert(1)"));
  assert.ok("error" in normalizeWebsiteUrl("http://localhost:3000"));
  assert.ok("error" in normalizeWebsiteUrl("file:///etc/passwd"));
});
