// EXPECT: violation "../../adapters/root-repository"
// The target sits at the root of adapters/, not in a subfolder.
import { rootRepository } from "../../adapters/root-repository";

export const leaked = rootRepository;
