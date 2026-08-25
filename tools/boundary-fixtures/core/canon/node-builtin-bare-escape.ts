// EXPECT: violation "path"
import { join } from "path";

export const leaked = join;
