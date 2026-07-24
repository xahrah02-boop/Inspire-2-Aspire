import { state } from "../../shared/state.js";
import { panel, table } from "../../shared/ui.js";

export function render() {
  return panel("Audit logs", table(state.data.auditLogs, ["createdAt", "userId", "action", "module", "record", "oldValue", "newValue"], []));
}
