import { RAW_UNICODE_TO_CHANAKYA_PAIRS } from "./chanakya-data.ts";

type Pair = readonly [string, string];

type TokenRule = {
  source: string;
  target: string;
  token: string;
};

export type UnicodeToChanakyaOptions = {
  protectLatinAndDigits?: boolean;
  protectSymbols?: boolean;
  useFixedKraGlyph?: boolean;
};

const DEVANAGARI_CONSONANT = /[\u0915-\u0939\u0958-\u095f\u0929\u0931\u0933]/u;
const DEVANAGARI_WORD_PART = /[\u0900-\u097f]/u;
const DEPENDENT_MARK = /[ािीुूृॄॢेैोौॉॅंःँ]/u;
const VIRAMA = "्";
const SHORT_I = "ि";
const REPH = "र्";
const REPH_MARKER = "\u00fc";
const RAKAAR_MARKER = "\u00fd";
const SHORT_I_MARKER = "\ue100";
const FINAL_HALANT_MARKER = "\ue101";
const ASCII_TO_FULLWIDTH_OFFSET = 0xfee0;
const PROTECTED_ASCII_START = 0xf0000;
const WALKMAN_KRA_GLYPH = "\u00b7\u00fd\u00a4";
const CHANAKYA_OPEN_DOUBLE_QUOTE = "\u00d2";
const CHANAKYA_CLOSE_DOUBLE_QUOTE = "\u00d3";
const CHANAKYA_OPEN_SINGLE_QUOTE = "\u00d2";
const CHANAKYA_CLOSE_SINGLE_QUOTE = "\u00d3";
const SAFE_COLON = "\u00d1";

const SAFE_ASCII_SYMBOLS = new Map<string, string>([
  ["`", "\uff40"],
  ["!", "\uff01"],
  ["@", "\uff20"],
  ["#", "\uff03"],
  ["$", "\uff04"],
  ["%", "\uff05"],
  ["^", "\uff3e"],
  ["&", "\uff06"],
  ["*", "\uff0a"],
  ["(", "\uff08"],
  [")", "\uff09"],
  ["_", "\uff3f"],
  ["=", "\uff1d"],
  ["+", "\uff0b"],
  ["{", "\uff5b"],
  ["}", "\uff5d"],
  ["[", "\uff3b"],
  ["]", "\uff3d"],
  ["|", "\uff5c"],
  [";", "\uff1b"],
  [":", SAFE_COLON],
  ["\\", "\uff3c"],
  [",", "\uff0c"],
  [".", "\uff0e"],
  ["/", "\uff0f"],
  ["<", "\uff1c"],
  [">", "\uff1e"],
  ["?", "\uff1f"],
  ["~", "\uff5e"],
]);

// User-verified corrections from real Walkman-Chanakya output samples.
// These rules intentionally run before the broad legacy table so closely
// related Sanskrit clusters follow the confirmed publishing workflow.
export const VERIFIED_TRAINING_PAIRS = [
  ["ऋग्", "\u00ab\u00a4\u201a"],
  ["ऋचाओं", "\u00ab\u00a4\u00bf\u00e6\u00a5\u00e6\u00f0\u00b4"],
  ["ओं", "\u00a5\u00e6\u00f0\u00b4"],
  ["शृ", "\u0178\u00e6\u00eb"],
  ["शॄ", "\u0178\u00e6\u00ec"],
  ["च्च", "U\u201c\u00e6"],
  ["फ्र", "\u00c8\u00fd\u00a4"],
  ["म्", "\u0090\u00e6\u00f7"],
  ["ष्ट्र", "c\u00c5\u00feU"],
  ["स्त्र", "S\u02dc\u00e6"],
  ["ह्म", "\u00b1\u00d7"],
] as const satisfies readonly Pair[];

const VERIFIED_TRAINING_MAP = new Map<string, string>(VERIFIED_TRAINING_PAIRS);

const NUKTA_NORMALIZATION_PAIRS: Pair[] = [
  ["क़", "क़"],
  ["ख़", "ख़"],
  ["ग़", "ग़"],
  ["ज़", "ज़"],
  ["ड़", "ड़"],
  ["ढ़", "ढ़"],
  ["फ़", "फ़"],
  ["य़", "य़"],
  ["ऱ", "ऱ"],
  ["ऩ", "ऩ"],
];

const CURATED_CONJUNCTS = [
  "ऋचाओं",
  "ऋग्",
  "म्",
  "ओं",
  "क्ष",
  "क्ष्",
  "त्र",
  "ज्ञ",
  "ज्ञ्",
  "श्र",
  "श्र्",
  "स्त्र",
  "ह्न",
  "ह्म",
  "ह्म्",
  "ह्य",
  "ह्ल",
  "ह्व",
  "द्य",
  "द्व",
  "द्ग",
  "द्घ",
  "द्द",
  "द्ध",
  "द्ब",
  "द्भ",
  "द्म",
  "च्च",
  "क्त",
  "क्क",
  "क्व",
  "ष्ट्र",
  "ष्ट",
  "ष्ठ",
  "ष्ट्व",
  "ङ्क्ष",
  "ङ्क",
  "ङ्ख",
  "ङ्ग",
  "ङ्घ",
  "ट्ट",
  "ट्ठ",
  "त्त",
  "त्त्",
  "न्न",
  "न्न्",
  "ल्ल",
  "ञ्ज",
  "ञ्च",
  "श्च",
  "छ्व",
  "क्च",
  "प्त",
  "त्न",
];

const CURATED_RAKAAR_CLUSTERS = [
  "क्र",
  "ट्र",
  "ड्र",
  "ढ्र",
  "ख्र",
  "फ्र",
  "द्ब्र",
  "ष्ट्र",
];

const CURATED_HALF_FORMS = ["त्त्", "न्न्", "ह्म्", "क्ष्", "ज्ञ्", "श्र्"];
const RAKAAR_BASE_CONSONANTS = [
  "\u0915",
  "\u0916",
  "\u0917",
  "\u0918",
  "\u0919",
  "\u091a",
  "\u091b",
  "\u091c",
  "\u091d",
  "\u091e",
  "\u091f",
  "\u0920",
  "\u0921",
  "\u0922",
  "\u0923",
  "\u0924",
  "\u0925",
  "\u0926",
  "\u0927",
  "\u0928",
  "\u092a",
  "\u092b",
  "\u092c",
  "\u092d",
  "\u092e",
  "\u092f",
  "\u0930",
  "\u0932",
  "\u0935",
  "\u0936",
  "\u0937",
  "\u0938",
  "\u0939",
  "\u0958",
  "\u0959",
  "\u095a",
  "\u095b",
  "\u095c",
  "\u095d",
  "\u095e",
  "\u095f",
  "\u0929",
  "\u0931",
  "\u0933",
];

const DEDUPED_FINAL_PAIRS = applyPairOverrides(
  dedupePairs(RAW_UNICODE_TO_CHANAKYA_PAIRS),
  VERIFIED_TRAINING_MAP,
);

const FINAL_PAIR_MAP = new Map<string, string>(DEDUPED_FINAL_PAIRS);
const CONJUNCT_RULES = createTokenRules(CURATED_CONJUNCTS, 0xe200);
const RAKAAR_RULES = createRakaarTokenRules(CURATED_RAKAAR_CLUSTERS, 0xe260);
const HALF_FORM_RULES = createTokenRules(CURATED_HALF_FORMS, 0xe340);
const TOKEN_RULES = [...CONJUNCT_RULES, ...RAKAAR_RULES, ...HALF_FORM_RULES];
const TOKEN_PAIR_MAP: Pair[] = TOKEN_RULES.map(({ token, target }) => [token, target]);

const FINAL_RULE_PAIRS = sortPairsBySourceLength([
  [SHORT_I_MARKER, "\u00e7"],
  [FINAL_HALANT_MARKER, "\u00f7"],
  ...TOKEN_PAIR_MAP,
  ...DEDUPED_FINAL_PAIRS,
]);

const TOKEN_CLASS = buildTokenClass(TOKEN_RULES);
const BASE_UNIT_PATTERN = `(?:${TOKEN_CLASS}|[\\u0915-\\u0939\\u0958-\\u095f\\u0929\\u0931\\u0933])`;
const CONSONANT_CLUSTER_PATTERN = new RegExp(
  `(${BASE_UNIT_PATTERN}(?:${VIRAMA}${BASE_UNIT_PATTERN})*)${SHORT_I}`,
  "gu",
);

export const CHANAKYA_PIPELINE = [
  "Normalize Unicode to NFC and fold decomposed nukta letters into canonical Hindi/Sanskrit forms.",
  "Tokenize high-priority conjuncts first so overlapping ligatures are handled before simpler replacements.",
  "Move every logical reph sequence (र् + cluster) behind its cluster using the Chanakya reph marker.",
  "Apply special rakaar cluster rules, then preserve explicit half-form conjuncts that end in halant.",
  "Reorder the pre-base इ matra so Chanakya receives it before the target cluster.",
  "Run the final longest-match character map while preserving unknown characters untouched.",
] as const;

export const CHANAKYA_REFERENCE_CASES = [
  { input: "कर्म", output: "·¤×ü" },
  { input: "प्रज्ञा", output: "Âý™ææ" },
  { input: "संस्कृत", output: "â´S·¤ëÌ" },
  { input: "श्रीमद्भगवद्गीता", output: "Ÿæè×j»ßeèÌæ" },
  { input: "दृष्टिकोण", output: "ÎëçC·¤ô‡æ" },
  { input: "त्रिकोणमिति", output: "ç˜æ·¤ô‡æç×çÌ" },
  { input: "क्षेत्र", output: "ÿæð˜æ" },
  { input: "दृष्टि", output: "ÎëçC" },
  { input: "क्रय-विक्रय", output: "R¤Ø-çßR¤Ø" },
] as const;

export class UnicodeToChanakyaConverter {
  convert(input: string, options: UnicodeToChanakyaOptions = {}): string {
    if (!input) {
      return "";
    }

    const protectedAscii: string[] = [];
    let text = this.normalizeInput(input, options, protectedAscii);
    text = applyTokenRules(text, CONJUNCT_RULES);
    text = makeWordFinalHalantsVisible(text);
    text = moveReph(text);
    text = applyTokenRules(text, RAKAAR_RULES);
    text = applyTokenRules(text, HALF_FORM_RULES);
    text = this.reorderShortI(text);

    text = applyPairRules(text, FINAL_RULE_PAIRS);
    text = options.useFixedKraGlyph ? applyFixedKraGlyph(text) : text;
    text = applyPhaMatraOverlapFixes(text);

    return restoreProtectedAscii(text, protectedAscii);
  }

  private normalizeInput(
    input: string,
    options: UnicodeToChanakyaOptions,
    protectedAscii: string[],
  ): string {
    let text = normalizeUnsafeAscii(
      normalizeDevanagariDigits(
        normalizeMarkdownBoldMarkers(
          normalizeQuotePunctuation(input.normalize("NFC").replace(/[\u200c\u200d]/gu, "")),
        ),
      ),
      options,
      protectedAscii,
    );

    for (const [source, target] of NUKTA_NORMALIZATION_PAIRS) {
      text = text.replace(new RegExp(escapeRegExp(source), "gu"), () => target);
    }

    return text;
  }

  private reorderShortI(input: string): string {
    return input.replace(CONSONANT_CLUSTER_PATTERN, (_, cluster: string) => {
      return `${SHORT_I_MARKER}${cluster}`;
    });
  }
}

export const unicodeToChanakya = (
  input: string,
  options?: UnicodeToChanakyaOptions,
): string => {
  const converter = new UnicodeToChanakyaConverter();
  return converter.convert(input, options);
};

function dedupePairs(entries: Iterable<Pair>): Pair[] {
  const seen = new Set<string>();
  const pairs: Pair[] = [];

  for (const [source, target] of entries) {
    if (seen.has(source)) {
      continue;
    }

    seen.add(source);
    pairs.push([source, target]);
  }

  return pairs;
}

function applyPairOverrides(pairs: readonly Pair[], overrides: ReadonlyMap<string, string>): Pair[] {
  const overridden = pairs.filter(([source]) => !overrides.has(source));

  return [...overridden, ...overrides.entries()];
}

function normalizeQuotePunctuation(input: string): string {
  let isOpeningDoubleQuote = true;
  let isOpeningSingleQuote = true;

  return input
    .replace(/["“”]/gu, () => {
      const quote = isOpeningDoubleQuote
        ? CHANAKYA_OPEN_DOUBLE_QUOTE
        : CHANAKYA_CLOSE_DOUBLE_QUOTE;
      isOpeningDoubleQuote = !isOpeningDoubleQuote;

      return quote;
    })
    .replace(/['‘’]/gu, () => {
      const quote = isOpeningSingleQuote
        ? CHANAKYA_OPEN_SINGLE_QUOTE
        : CHANAKYA_CLOSE_SINGLE_QUOTE;
      isOpeningSingleQuote = !isOpeningSingleQuote;

      return quote;
    });
}

function normalizeMarkdownBoldMarkers(input: string): string {
  return input.replace(/\*/g, "");
}

function normalizeDevanagariDigits(input: string): string {
  return input.replace(/[०-९]/g, (digit) => {
    return String.fromCodePoint(digit.codePointAt(0)! - 0x0966 + 0x30);
  });
}

function normalizeUnsafeAscii(
  input: string,
  options: UnicodeToChanakyaOptions,
  protectedAscii: string[],
): string {
  const protectLatinAndDigits = options.protectLatinAndDigits ?? false;
  const protectSymbols = options.protectSymbols ?? true;

  return input.replace(/[A-Za-z0-9`!@#$%^&*()_=+{}\[\]|;:\\,.\\/<>?~]/g, (character) => {
    if (/[A-Za-z0-9]/.test(character)) {
      if (/[0-9]/.test(character)) {
        return protectAsciiCharacter(character, protectedAscii);
      }

      return protectLatinAndDigits
        ? String.fromCodePoint(character.codePointAt(0)! + ASCII_TO_FULLWIDTH_OFFSET)
        : protectAsciiCharacter(character, protectedAscii);
    }

    return protectSymbols ? (SAFE_ASCII_SYMBOLS.get(character) ?? character) : character;
  });
}

function protectAsciiCharacter(character: string, protectedAscii: string[]): string {
  const index = protectedAscii.push(character) - 1;

  return String.fromCodePoint(PROTECTED_ASCII_START + index);
}

function restoreProtectedAscii(input: string, protectedAscii: readonly string[]): string {
  let text = input;

  protectedAscii.forEach((character, index) => {
    text = text.replaceAll(String.fromCodePoint(PROTECTED_ASCII_START + index), character);
  });

  return text;
}

function applyFixedKraGlyph(input: string): string {
  return input.replaceAll("R\u00a4", WALKMAN_KRA_GLYPH);
}

function applyPhaMatraOverlapFixes(input: string): string {
  return input.replace(/\u00c8([\u00e9\u00ea])(?=\u201e)/g, "\u00c8$1 ");
}

function createTokenRules(sources: readonly string[], startCodePoint: number): TokenRule[] {
  return sources
    .map((source, index) => {
      const target = FINAL_PAIR_MAP.get(source) ?? VERIFIED_TRAINING_MAP.get(source);

      if (!target) {
        return null;
      }

      return {
        source,
        target,
        token: String.fromCodePoint(startCodePoint + index),
      };
    })
    .filter((rule): rule is TokenRule => rule !== null)
    .sort((left, right) => right.source.length - left.source.length);
}

function createRakaarTokenRules(sources: readonly string[], startCodePoint: number): TokenRule[] {
  const curatedRules = createTokenRules(sources, startCodePoint);
  const usedSources = new Set(curatedRules.map((rule) => rule.source));
  const generatedRules = RAKAAR_BASE_CONSONANTS.map((consonant) => {
    const source = `${consonant}${VIRAMA}र`;

    if (usedSources.has(source)) {
      return null;
    }

    const target = FINAL_PAIR_MAP.get(source) ?? createDefaultRakaarTarget(consonant);

    if (!target) {
      return null;
    }

    usedSources.add(source);

    return {
      source,
      target,
      token: String.fromCodePoint(startCodePoint + usedSources.size),
    };
  }).filter((rule): rule is TokenRule => rule !== null);

  return [...curatedRules, ...generatedRules].sort(
    (left, right) => right.source.length - left.source.length,
  );
}

function createDefaultRakaarTarget(consonant: string): string | undefined {
  const consonantTarget = FINAL_PAIR_MAP.get(consonant);

  return consonantTarget ? `${consonantTarget}${RAKAAR_MARKER}` : undefined;
}

function buildTokenClass(rules: readonly TokenRule[]): string {
  const tokens = rules.map((rule) => escapeRegExp(rule.token)).join("");
  return tokens ? `[${tokens}]` : "(?!)";
}

function applyTokenRules(input: string, rules: readonly TokenRule[]): string {
  let text = input;

  for (const rule of rules) {
    text = text.replace(new RegExp(escapeRegExp(rule.source), "gu"), () => rule.token);
  }

  return text;
}

function makeWordFinalHalantsVisible(input: string): string {
  return input.replace(
    /([\u0915-\u0939\u0958-\u095f\u0929\u0931\u0933])्(?=$|[^\u0900-\u097f])/gu,
    (_, consonant: string) => `${consonant}${FINAL_HALANT_MARKER}`,
  );
}

function sortPairsBySourceLength(pairs: readonly Pair[]): Pair[] {
  return [...pairs].sort((left, right) => right[0].length - left[0].length);
}

function applyPairRules(input: string, pairs: readonly Pair[]): string {
  let output = "";
  let index = 0;

  while (index < input.length) {
    const pair = pairs.find(([source]) => input.startsWith(source, index));

    if (pair) {
      output += pair[1];
      index += pair[0].length;
      continue;
    }

    const codePoint = input.codePointAt(index)!;
    const character = String.fromCodePoint(codePoint);
    output += character;
    index += character.length;
  }

  return output;
}

function moveReph(input: string): string {
  let text = input;
  let index = text.indexOf(REPH);

  while (index !== -1) {
    const clusterStart = index + REPH.length;
    const clusterEnd = findClusterEnd(text, clusterStart);

    if (!isWordInternalReph(text, index) || clusterEnd === clusterStart) {
      index = text.indexOf(REPH, clusterStart);
      continue;
    }

    const cluster = text.slice(clusterStart, clusterEnd);
    text = `${text.slice(0, index)}${cluster}${REPH_MARKER}${text.slice(clusterEnd)}`;
    index = text.indexOf(REPH, index + cluster.length + 1);
  }

  return text;
}

function isWordInternalReph(text: string, index: number): boolean {
  return index > 0 && DEVANAGARI_WORD_PART.test(text.charAt(index - 1));
}

function findClusterEnd(text: string, start: number): number {
  let index = start;
  const firstCharacter = text.charAt(index);

  if (!isBaseUnit(firstCharacter)) {
    return start;
  }

  index += 1;

  while (text.charAt(index) === VIRAMA && isBaseUnit(text.charAt(index + 1))) {
    index += 2;
  }

  while (DEPENDENT_MARK.test(text.charAt(index))) {
    index += 1;
  }

  return index;
}

function isBaseUnit(character: string): boolean {
  return Boolean(character) && (DEVANAGARI_CONSONANT.test(character) || TOKEN_RULES.some((rule) => rule.token === character));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
