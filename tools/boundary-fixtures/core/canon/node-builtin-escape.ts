// EXPECT: violation "node:fs"
import { readFileSync } from "node:fs";

export const leaked = readFileSync;
