// EXPECT: violation "../adapters/db/repository"
// A core file at the ROOT of core/, not in a subfolder. Folder-mode element
// patterns never classified this file, so the path-resolved rule skipped it.
import { repository } from "../adapters/db/repository";

export const leaked = repository;
