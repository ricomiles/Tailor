// EXPECT: clean
// `zod` is deliberately allowed: the architecture requires every cross-unit
// type declared once in the core as a named schema with its inferred type.
import { z } from "zod";

export const SlugSchema = z.string().min(1);
export type Slug = z.infer<typeof SlugSchema>;
