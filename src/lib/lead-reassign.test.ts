import assert from "node:assert/strict";
import { test } from "node:test";
import { mayChangeOwner, mayGiveFollowUpTo } from "./lead-reassign";

test("first assignment is free; changing an existing owner needs the access key", () => {
  assert.equal(mayChangeOwner(false, ""), true);
  assert.equal(mayChangeOwner(false, null), true);
  assert.equal(mayChangeOwner(false, "u1"), false);
  assert.equal(mayChangeOwner(true, "u1"), true);
});

test("without access a follow-up can stay with people already on the lead, never a new person", () => {
  const base = { hasAccess: false, meId: "me", ownerId: "owner", leadFollowUpAgentId: "fu", priorFollowUpUserIds: ["old"] };
  assert.equal(mayGiveFollowUpTo({ ...base, agentId: "" }), true);          // default / unchanged
  assert.equal(mayGiveFollowUpTo({ ...base, agentId: "me" }), true);
  assert.equal(mayGiveFollowUpTo({ ...base, agentId: "owner" }), true);
  assert.equal(mayGiveFollowUpTo({ ...base, agentId: "fu" }), true);
  assert.equal(mayGiveFollowUpTo({ ...base, agentId: "old" }), true);
  assert.equal(mayGiveFollowUpTo({ ...base, agentId: "stranger" }), false);
});

test("with access any agent is allowed", () => {
  assert.equal(mayGiveFollowUpTo({ hasAccess: true, meId: "me", agentId: "stranger" }), true);
});
