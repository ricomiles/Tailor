// EXPECT: violation "playwright"
import { chromium } from "playwright";

export const leaked = chromium;
