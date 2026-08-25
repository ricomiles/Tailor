// EXPECT: violation "../../app/api/handler"
import { handler } from "../../app/api/handler";

export const leaked = handler;
