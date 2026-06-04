import test from "node:test";
import assert from "node:assert/strict";
import { Roles, can, canViewEmployee } from "../src/core/rbac.js";

test("HR can manage KPIs and line managers cannot", () => {
  assert.equal(can(Roles.HR_ADMIN, "manageKpis"), true);
  assert.equal(can(Roles.LINE_MANAGER, "manageKpis"), false);
});

test("line managers only see assigned employees", () => {
  const manager = { id: "u-mgr-1", role: Roles.LINE_MANAGER };
  assert.equal(canViewEmployee(manager, { lineManagerUserId: "u-mgr-1" }), true);
  assert.equal(canViewEmployee(manager, { lineManagerUserId: "u-mgr-2" }), false);
});

test("employees only see their own record", () => {
  const employeeUser = { id: "u-emp-1", role: Roles.EMPLOYEE };
  assert.equal(canViewEmployee(employeeUser, { userId: "u-emp-1" }), true);
  assert.equal(canViewEmployee(employeeUser, { userId: "u-emp-2" }), false);
});
