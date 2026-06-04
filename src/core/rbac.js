export const Roles = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  HR_ADMIN: "HR_ADMIN",
  LINE_MANAGER: "LINE_MANAGER",
  EMPLOYEE: "EMPLOYEE"
});

const permissions = {
  manageUsers: [Roles.SUPER_ADMIN],
  manageKpis: [Roles.SUPER_ADMIN, Roles.HR_ADMIN],
  manageEmployees: [Roles.SUPER_ADMIN, Roles.HR_ADMIN],
  managePeriods: [Roles.SUPER_ADMIN, Roles.HR_ADMIN],
  reviewAppraisals: [Roles.SUPER_ADMIN, Roles.HR_ADMIN],
  submitAppraisals: [Roles.LINE_MANAGER],
  viewReports: [Roles.SUPER_ADMIN, Roles.HR_ADMIN],
  viewAuditLogs: [Roles.SUPER_ADMIN, Roles.HR_ADMIN],
  viewOwnProfile: [Roles.SUPER_ADMIN, Roles.HR_ADMIN, Roles.LINE_MANAGER, Roles.EMPLOYEE]
};

export function can(role, permission) {
  return Boolean(permissions[permission]?.includes(role));
}

export function assertCan(role, permission) {
  if (!can(role, permission)) {
    throw new Error(`Role ${role} is not allowed to ${permission}.`);
  }
  return true;
}

export function canViewEmployee(user, employee) {
  if ([Roles.SUPER_ADMIN, Roles.HR_ADMIN].includes(user.role)) return true;
  if (user.role === Roles.LINE_MANAGER) return employee.lineManagerUserId === user.id;
  if (user.role === Roles.EMPLOYEE) return employee.userId === user.id;
  return false;
}
