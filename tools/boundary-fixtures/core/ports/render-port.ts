// A stand-in for a real core port, so the legal inward import resolves.
export interface RenderPort {
  render(html: string, outPath: string): Promise<string>;
}
