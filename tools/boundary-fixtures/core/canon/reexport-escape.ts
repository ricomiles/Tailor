// EXPECT: violation "../../adapters/db/reexport-target"
// `boundaries/element-types` never inspects `export … from`, so this form
// linted clean while the equivalent import was an error.
export { reexported } from "../../adapters/db/reexport-target";
