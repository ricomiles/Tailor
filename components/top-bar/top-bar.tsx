import type { BoardCount } from "@/core/boards/board-count";
import type { PipelineCounts } from "@/core/pipeline/pipeline-counts";
import { boardsLabel, countLabels } from "./labels";
import styles from "./top-bar.module.css";

/**
 * Global chrome: on every screen, above everything else. A server component —
 * it holds no state and reads nothing at runtime.
 *
 * A thin renderer by design. Both label functions parse what they are handed
 * and throw on anything the schemas reject, so a bad count fails here rather
 * than reaching the page as text; this module stays free of runtime rules that
 * a CSS Module import would put out of the test runner's reach.
 *
 * Each count renders as one interpolated string rather than
 * `{n} {name}`, which React would server-render as `0<!-- --> <!-- -->name`
 * and break any check reading the bar out of the HTML.
 */
export function TopBar({
  counts,
  boardCount,
}: {
  counts: Readonly<PipelineCounts>;
  boardCount: BoardCount;
}) {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>tailor</div>
      {/* Decorative, so it carries no role — the testid is the only stable
          handle a layout test has on an empty 1px element. */}
      <div className={styles.divider} data-testid="divider" />
      {/* `group`, not `status`. The design source carries no role here, and
          `status` is a polite live region: once Epic 2 makes these counts
          change, every update would announce all four labels on every
          screen. A bare aria-label on a roleless div is ignored, so the role
          cannot simply be dropped. */}
      <div className={styles.counts} role="group" aria-label="Pipeline counts">
        {countLabels(counts).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <span className={styles.boards}>{boardsLabel(boardCount)}</span>
    </header>
  );
}
