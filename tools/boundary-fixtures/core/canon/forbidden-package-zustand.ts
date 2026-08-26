// EXPECT: violation "zustand"
// Client state is an outer-layer concern.
import { create } from "zustand";

export const leaked = create;
