import { unicodeTo4CGandhi as convertWithGandhiEngine } from "./unicode24cGandhi.js";

// Engine vendored from D:\4cgandhi\src\lib\unicode24cGandhi.js for deterministic frontend builds.
export const GANDHI_REFERENCE_CASES = [
  { input: "\u0915\u093f\u0924\u093e\u092c", output: "dIY°ff¶f" },
  { input: "\u092a\u094d\u0930\u0915\u093e\u0936", output: "´fiIYfVf" },
  { input: "\u0936\u094d\u0930\u0940", output: "ßfe" },
] as const;

export function unicodeTo4CGandhi(input: string): string {
  if (!input) {
    return "";
  }

  return convertWithGandhiEngine(sanitizeTypography(input.normalize("NFC")));
}

function sanitizeTypography(input: string): string {
  return input
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...");
}
