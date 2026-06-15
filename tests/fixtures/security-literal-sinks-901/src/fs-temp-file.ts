import * as fs from "node:fs";
import { writeFileSync } from "node:fs";

export function writeTemporaryToken(token: string): void {
  fs.writeFileSync("/tmp/plow-token", token);
  writeFileSync("/var/tmp/plow-token", token);
}
