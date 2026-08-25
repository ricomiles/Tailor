// EXPECT: violation "next/server"
import { NextResponse } from "next/server";

export const leaked = NextResponse;
