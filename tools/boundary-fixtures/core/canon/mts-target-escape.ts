// EXPECT: violation "../../adapters/db/modern-repository"
// The target is a .mts file. If the resolver's extension list is narrowed, the
// specifier stops resolving, the boundaries rule skips it, and this escape
// becomes invisible — silently, with every other check still green.
import { modernRepository } from "../../adapters/db/modern-repository";

export const leaked = modernRepository;
