import { expect, test } from "@playwright/test";

/**
 * What the unit suite cannot reach: the bar's rendered geometry and its
 * position in the document. `components/top-bar/labels.ts` is covered by
 * `tests/top-bar-labels.test.mts`; the component that assembles those labels
 * imports a CSS Module, so only a real browser can say whether the assembled
 * result is 39px tall, sticky, and ahead of the page content.
 */

const BAR = "header:has-text('tailor')";

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
  const rendered = await page.evaluate(() => {
    const children = Array.from(document.body.children);
    const visible = children.filter(
      (el) => !(el instanceof HTMLElement && el.hidden) && el.tagName !== "SCRIPT",
    );
    return visible.map((el) => el.tagName.toLowerCase());
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

test("the zero state reads the four counts in order, then no boards yet", async ({
  page,
}) => {
  const counts = page.locator(BAR).getByRole("status");
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
