// Shared application state. Exported as a single mutable object so every module
// observes the same instance. Never reassign `state`; mutate its properties or
// use resetState() so importers keep their reference.

function freshState() {
  return {
    user: null,
    data: null,
    csrfToken: "",
    view: "dashboard",
    query: "",
    filter: "all",
    periodFilter: "all",
    employeeNameFilter: "",
    employeeDepartmentFilter: "all",
    employeeRoleFilter: "all",
    employeePage: 1,
    employeePageSize: 5,
    kpiStatusFilter: "all",
    kpiDepartmentFilter: "all",
    kpiRoleFilter: "all",
    kpiFrequencyFilter: "all",
    kpiPage: 1,
    kpiPageSize: 5,
    selectedTemplateId: ""
  };
}

export const state = freshState();

export function resetState() {
  Object.assign(state, freshState());
}
