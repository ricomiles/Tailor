// EXPECT: violation "drizzle-orm"
import { sql } from "drizzle-orm";

export const leaked = sql;
