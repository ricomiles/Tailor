// EXPECT: violation "react"
// Pure domain logic has no need of a hook; reaching for one is how rendering
// concerns leak inward.
import { useState } from "react";

export const leaked = useState;
