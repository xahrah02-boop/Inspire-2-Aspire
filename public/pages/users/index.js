import { state } from "../../shared/state.js";
import { panel, table } from "../../shared/ui.js";

export function render() {
  return panel("System users", table(state.data.userList || [], ["name", "email", "role", "status"], []));
}
