import { expect, test } from "@playwright/test";

/**
 * What the unit suite cannot reach: the bar's rendered geometry and its
 * position in the document. `components/top-bar/labels.ts` is covered by
 * `tests/top-bar-labels.test.mts`; the component that assembles those labels
 * imports a CSS Module, so only a real browser can say whether the assembled
 * result is 39px tall, sticky, and ahead of the page content.
 */

// Structural, not textual. `header:has-text('tailor')` selected the bar by the
// same copy this suite asserts elsewhere, so a copy change failed all nine
// tests with "resolved to 0 elements" instead of the one that owns the copy —
// and a second header containing that substring would be a strict-mode
// violation across the whole file.
const BAR = "body > header";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the bar's border-box is exactly 39px, the 2px rule included", async ({
  page,
}) => {
  const box = await page.locator(BAR).boundingBox();
  expect(box?.height).toBe(39);

  const borderBottom = await page
    .locator(BAR)
    .evaluate((el) => getComputedStyle(el).borderBottomWidth);
  expect(borderBottom).toBe("2px");
});

test("the bar precedes the page content in the document", async ({ page }) => {
  // The AC's intent, stated against what actually ships: React reserves the
  // first slot in <body> for its own hidden preamble container, so "first
  // element" is measured among what the layout renders.
  //
  // The skip-set is explicit rather than "everything except SCRIPT": the filter
  // was tuned to one React/Next preamble form, so a framework-injected style,
  // template, link or live-region announcer would have made rendered[0] fail
  // spuriously and read as a regression in this story.
  const rendered = await page.evaluate(() => {
    const SKIP = new Set([
      "SCRIPT",
      "STYLE",
      "LINK",
      "TEMPLATE",
      "NOSCRIPT",
      "META",
    ]);
    return Array.from(document.body.children)
      .filter((el) => !(el instanceof HTMLElement && el.hidden))
      .filter((el) => !SKIP.has(el.tagName))
      .map((el) => el.tagName.toLowerCase());
  });
  expect(rendered[0]).toBe("header");
  expect(rendered).toContain("main");
});

test("the bar stays pinned while the page scrolls beneath it", async ({
  page,
}) => {
  await page.evaluate(() => {
    document.body.style.minHeight = "300vh";
    window.scrollTo(0, 500);
  });
  await expect
    .poll(async () => (await page.locator(BAR).boundingBox())?.y)
    .toBe(0);

  const position = await page
    .locator(BAR)
    .evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe("sticky");
});

test("the brand reads tailor in the heading face at 800 and 16px", async ({
  page,
}) => {
  const brand = page.locator(BAR).getByText("tailor", { exact: true });
  const style = await brand.evaluate((el) => {
    const computed = getComputedStyle(el);
    return {
      weight: computed.fontWeight,
      size: computed.fontSize,
      family: computed.fontFamily,
    };
  });
  expect(style.weight).toBe("800");
  expect(style.size).toBe("16px");
  expect(style.family).toContain("Archivo");
});

test("the divider after the brand is a 1px x 18px vertical rule", async ({
  page,
}) => {
  // The other half of AC #3, which nothing measured. The element has no content
  // and sits in an align-items: center flex row, so dropping either dimension
  // collapses it to zero and removes the divider from the bar with the bar's
  // own height, border, position, x, width and text content all unchanged.
  const box = await page.locator(`${BAR} [data-testid="divider"]`).boundingBox();
  expect(box?.width).toBe(1);
  expect(box?.height).toBe(18);
});

test("the zero state reads the four counts in order, then no boards yet", async ({
  page,
}) => {
  const counts = page.locator(BAR).getByRole("group");
  await expect(counts).toHaveAttribute("aria-label", "Pipeline counts");
  // textContent, not innerText: the design uppercases these in CSS, and the
  // copy under that transform is what the unit tests and the spec pin.
  const labels = await counts
    .locator("span")
    .evaluateAll((spans) => spans.map((span) => span.textContent));
  expect(labels).toEqual([
    "0 discovered",
    "0 tailored",
    "0 approved",
    "0 submitted",
  ]);
  const transform = await counts.evaluate(
    (el) => getComputedStyle(el).textTransform,
  );
  expect(transform).toBe("uppercase");
  await expect(page.locator(BAR).getByText("no boards yet")).toBeVisible();
});

test("a narrow viewport does not grow the bar past 39px", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 800 });
  const box = await page.locator(BAR).boundingBox();
  expect(box?.height).toBe(39);
});

/**
 * The three tests below pin Story 1.2's design-system port, which the geometry
 * tests above reach only by accident. Each covers a regression that the rest of
 * the suite — and `pnpm build` — lets through completely silently.
 */

test("the Archivo faces the chrome renders are loaded, across both subsets", async ({
  page,
}) => {
  // The brand test above asserts `computed.fontWeight === "800"`, but that
  // reads the CSS declaration (--font-heading-weight), not which faces the
  // browser has.
  //
  // Enumerating document.fonts is not enough either: a CSS-connected FontFace
  // exists for every @font-face rule as soon as the stylesheet parses,
  // regardless of whether the file was ever fetched. With the woff2 responses
  // blocked, every weight below still enumerates while the page renders in the
  // metric-adjusted fallback. `document.fonts.check` is what distinguishes
  // declared from usable, and `document.fonts.ready` is what keeps this from
  // racing stylesheet parsing.
  await page.evaluate(() => document.fonts.ready);
  const faces = await page.evaluate(() =>
    Array.from(document.fonts)
      .filter(
        (f) => f.family.includes("Archivo") && !f.family.includes("Fallback"),
      )
      .map((f) => f.weight),
  );
  expect(faces).toEqual(
    expect.arrayContaining(["400", "600", "800"]),
  );

  // latin-ext carries the accented characters in Epic 2's employer and
  // candidate names. It cannot be observed through document.fonts: next/font
  // emits an @font-face for every subset regardless of the `subsets` array and
  // lets unicode-range pick between them, so the nine faces above are identical
  // with or without latin-ext. What `subsets` actually controls is which subset
  // files are preloaded — one link per subset — so that is what pins it.
  const preloaded = await page.evaluate(
    () =>
      document.querySelectorAll('link[rel="preload"][as="font"]').length,
  );
  expect(preloaded).toBe(2);

  // Only the weights the chrome actually renders. 600 is declared but
  // deliberately unused today — spec-1-2 records it as preloaded dead payload —
  // so asserting it is loaded would fail on a healthy build.
  const usable = await page.evaluate(() => ({
    brand: document.fonts.check('800 16px "Archivo"'),
    body: document.fonts.check('400 14px "Archivo"'),
  }));
  expect(usable).toEqual({ brand: true, body: true });
});

test("the chrome's color and space tokens resolve rather than falling back", async ({
  page,
}) => {
  // `background: var(--color-bg)` is invalid at computed-value time if the
  // token is renamed or dropped, which paints the sticky bar transparent and
  // scrolls page content through it. Height, border, position and y all still
  // pass in that state, so nothing else in this suite notices.
  //
  // Each pair is compared against the token read back off a probe element
  // rather than against a literal. Hard-coding `rgb(243, 242, 242)` put a
  // second copy of the palette in this file, outside the token table and
  // outside the reach of the story's no-hex-literal grep, so a legitimate
  // retune failed here with an opaque numeric mismatch. A dropped token is
  // still caught: `var(--missing)` is invalid at computed-value time, so the
  // probe and the bar fall back differently and the comparison fails.
  //
  // All four of the bar's token references are read. --color-divider is covered
  // by the borderBottomWidth assertion above (it is the only value in that
  // shorthand, so losing it invalidates the whole declaration); the three below
  // sit in single-property declarations with no such fallout.
  const mismatches = await page.evaluate(() => {
    const resolve = (property: string, token: string) => {
      const probe = document.createElement("span");
      probe.style.setProperty(property, `var(${token})`);
      document.body.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return value;
    };

    const bar = document.querySelector("body > header")!;
    const counts = bar.querySelector('[role="group"]')!;
    const boards = bar.lastElementChild!;

    const cases: [string, string, string][] = [
      ["bar background", getComputedStyle(bar).backgroundColor, resolve("color", "--color-bg")],
      ["bar padding", getComputedStyle(bar).paddingLeft, resolve("padding-left", "--space-4")],
      ["counts color", getComputedStyle(counts).color, resolve("color", "--color-neutral-700")],
      // The boards label carries the story's escalated WCAG deviation, so its
      // token is the one most likely to be retuned by the eventual fix.
      ["boards color", getComputedStyle(boards).color, resolve("color", "--color-neutral-600")],
    ];
    return cases
      .filter(([, actual, expected]) => actual !== expected)
      .map(([name, actual, expected]) => `${name}: ${actual} !== ${expected}`);
  });
  expect(mismatches).toEqual([]);
});

test("the chrome spans the viewport, so the port's body reset still holds", async ({
  page,
}) => {
  // The port replaced the placeholder's `html, body { margin: 0 }` with the
  // source's `body { margin: 0; ... }`. Lose that declaration while retuning
  // the verbatim block and the UA's 8px body margin returns, insetting the
  // "global" chrome — with height, border, position and y all unchanged.
  const box = await page.locator(BAR).boundingBox();
  const clientWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  expect(box?.x).toBe(0);
  expect(box?.width).toBe(clientWidth);
});
