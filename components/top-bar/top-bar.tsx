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
  boardCount: number;
}) {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>tailor</div>
      <div className={styles.divider} />
      <div className={styles.counts} role="status" aria-label="Pipeline counts">
        {countLabels(counts).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <span className={styles.boards}>{boardsLabel(boardCount)}</span>
    </header>
  );
}
