import { join } from "node:path";
import { getStateDir } from "../audit/config-loader.js";

export function getExtensionsDir(): string {
  return join(getStateDir(), "extensions");
}

export function getLobstercageStateDir(): string {
  return join(getStateDir(), "lobstercage");
}
