// EXPECT: violation "@/adapters/db/repository"
import { repository } from "@/adapters/db/repository";

export const leaked = repository;
