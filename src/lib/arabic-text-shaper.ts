/**
 * arabic-text-shaper.ts
 *
 * Enterprise Arabic Text Shaping & BiDi Normalizer Engine for Ahmed Bahri Store.
 * Converts raw Arabic character sequences into contextual connected glyphs
 * (Unicode Presentation Forms-B \uFE70 - \uFEFF) with Lam-Alef ligature support,
 * right-to-left word ordering, and smart multi-line Canvas text wrapping.
 */

// Contextual Form Types
type FormType = "isolated" | "initial" | "medial" | "final";

// Glyph Variant Mapping: [isolated, initial, medial, final]
interface CharacterGlyph {
  isolated: string;
  initial: string;
  medial: string;
  final: string;
}

const ARABIC_GLYPH_MAP: Record<string, CharacterGlyph> = {
  // Alef variants
  "\u0621": { isolated: "\uFE80", initial: "\uFE80", medial: "\uFE80", final: "\uFE80" }, // ء
  "\u0622": { isolated: "\uFE81", initial: "\uFE81", medial: "\uFE82", final: "\uFE82" }, // آ
  "\u0623": { isolated: "\uFE83", initial: "\uFE83", medial: "\uFE84", final: "\uFE84" }, // أ
  "\u0624": { isolated: "\uFE85", initial: "\uFE85", medial: "\uFE86", final: "\uFE86" }, // ؤ
  "\u0625": { isolated: "\uFE87", initial: "\uFE87", medial: "\uFE88", final: "\uFE88" }, // إ
  "\u0626": { isolated: "\uFE89", initial: "\uFE8B", medial: "\uFE8C", final: "\uFE8A" }, // ئ
  "\u0627": { isolated: "\uFE8D", initial: "\uFE8D", medial: "\uFE8E", final: "\uFE8E" }, // ا

  // Alphabetic Letters
  "\u0628": { isolated: "\uFE8F", initial: "\uFE91", medial: "\uFE92", final: "\uFE90" }, // ب
  "\u0629": { isolated: "\uFE93", initial: "\uFE93", medial: "\uFE94", final: "\uFE94" }, // ة
  "\u062A": { isolated: "\uFE95", initial: "\uFE97", medial: "\uFE98", final: "\uFE96" }, // ت
  "\u062B": { isolated: "\uFE99", initial: "\uFE9B", medial: "\uFE9C", final: "\uFE9A" }, // ث
  "\u062C": { isolated: "\uFE9D", initial: "\uFE9F", medial: "\uFEA0", final: "\uFE9E" }, // ج
  "\u062D": { isolated: "\uFEA1", initial: "\uFEA3", medial: "\uFEA4", final: "\uFEA2" }, // ح
  "\u062E": { isolated: "\uFEA5", initial: "\uFEA7", medial: "\uFEA8", final: "\uFEA6" }, // خ
  "\u062F": { isolated: "\uFEA9", initial: "\uFEA9", medial: "\uFEAA", final: "\uFEAA" }, // د
  "\u0630": { isolated: "\uFEAB", initial: "\uFEAB", medial: "\uFEAC", final: "\uFEAC" }, // ذ
  "\u0631": { isolated: "\uFEAD", initial: "\uFEAD", medial: "\uFEAE", final: "\uFEAE" }, // ر
  "\u0632": { isolated: "\uFEAF", initial: "\uFEAF", medial: "\uFEB0", final: "\uFEB0" }, // ز
  "\u0633": { isolated: "\uFEB1", initial: "\uFEB3", medial: "\uFEB4", final: "\uFEB2" }, // س
  "\u0634": { isolated: "\uFEB5", initial: "\uFEB7", medial: "\uFEB8", final: "\uFEB6" }, // ش
  "\u0635": { isolated: "\uFEB9", initial: "\uFEBB", medial: "\uFEBC", final: "\uFEBA" }, // ص
  "\u0636": { isolated: "\uFEBD", initial: "\uFEBF", medial: "\uFEC0", final: "\uFEBE" }, // ض
  "\u0637": { isolated: "\uFEC1", initial: "\uFEC3", medial: "\uFEC4", final: "\uFEC2" }, // ط
  "\u0638": { isolated: "\uFEC5", initial: "\uFEC7", medial: "\uFEC8", final: "\uFEC6" }, // ظ
  "\u0639": { isolated: "\uFEC9", initial: "\uFECB", medial: "\uFECC", final: "\uFECA" }, // ع
  "\u063A": { isolated: "\uFECD", initial: "\uFECF", medial: "\uFED0", final: "\uFECE" }, // غ
  "\u0641": { isolated: "\uFED1", initial: "\uFED3", medial: "\uFED4", final: "\uFED2" }, // ف
  "\u0642": { isolated: "\uFED5", initial: "\uFED7", medial: "\uFED8", final: "\uFED6" }, // ق
  "\u0643": { isolated: "\uFED9", initial: "\uFEDB", medial: "\uFEDC", final: "\uFEDA" }, // ك
  "\u0644": { isolated: "\uFEDD", initial: "\uFEDF", medial: "\uFEE0", final: "\uFEDE" }, // ل
  "\u0645": { isolated: "\uFEE1", initial: "\uFEE3", medial: "\uFEE4", final: "\uFEE2" }, // م
  "\u0646": { isolated: "\uFEE5", initial: "\uFEE7", medial: "\uFEE8", final: "\uFEE6" }, // ن
  "\u0647": { isolated: "\uFEE9", initial: "\uFEEB", medial: "\uFEEC", final: "\uFEEA" }, // هـ
  "\u0648": { isolated: "\uFEED", initial: "\uFEED", medial: "\uFEEE", final: "\uFEEE" }, // و
  "\u0649": { isolated: "\uFEEF", initial: "\uFEEF", medial: "\uFEF0", final: "\uFEF0" }, // ى
  "\u064A": { isolated: "\uFEF1", initial: "\uFEF3", medial: "\uFEF4", final: "\uFEF2" }, // ي
};

// Non-connecting letters (Only connect to preceding letter, do not connect to following letter)
const NON_CONNECTING_CHARS = new Set([
  "\u0621", "\u0622", "\u0623", "\u0624", "\u0625", "\u0627",
  "\u062F", "\u0630", "\u0631", "\u0632", "\u0648", "\u0649"
]);

/**
 * Determines whether a character is an Arabic letter supported by shaping map.
 */
export function isArabicChar(ch: string): boolean {
  return ch in ARABIC_GLYPH_MAP;
}

/**
 * Shapes raw Arabic text into connected Unicode Presentation Forms-B characters.
 * Handles Lam-Alef ligatures and contextual character positioning.
 */
export function shapeArabicText(text: string): string {
  if (!text) return "";

  let result = "";
  const chars = Array.from(text);
  const len = chars.length;

  for (let i = 0; i < len; i++) {
    const cur = chars[i];

    // Non-Arabic characters (spaces, numbers, Latin, punctuation) pass through as-is
    if (!isArabicChar(cur)) {
      result += cur;
      continue;
    }

    const prev = i > 0 ? chars[i - 1] : "";
    const next = i < len - 1 ? chars[i + 1] : "";

    const prevConnects = prev !== "" && isArabicChar(prev) && !NON_CONNECTING_CHARS.has(prev);
    const nextConnects = next !== "" && isArabicChar(next);

    // Check Lam-Alef ligatures
    if (cur === "\u0644" && nextConnects) {
      if (next === "\u0627") {
        result += prevConnects ? "\uFEFC" : "\uFEFB"; // لا
        i++;
        continue;
      } else if (next === "\u0622") {
        result += prevConnects ? "\uFEF6" : "\uFEF5"; // لآ
        i++;
        continue;
      } else if (next === "\u0623") {
        result += prevConnects ? "\uFEF8" : "\uFEF7"; // لأ
        i++;
        continue;
      } else if (next === "\u0625") {
        result += prevConnects ? "\uFEFA" : "\uFEF9"; // لإ
        i++;
        continue;
      }
    }

    const glyph = ARABIC_GLYPH_MAP[cur];
    let form: FormType = "isolated";

    if (prevConnects && nextConnects && !NON_CONNECTING_CHARS.has(cur)) {
      form = "medial";
    } else if (prevConnects) {
      form = "final";
    } else if (nextConnects && !NON_CONNECTING_CHARS.has(cur)) {
      form = "initial";
    } else {
      form = "isolated";
    }

    result += glyph[form];
  }

  return result;
}

/**
 * Prepares Arabic & mixed BiDi text for Canvas or vector PDF engines that do not natively handle RTL rendering.
 * Shapes Arabic letters and reverses word/character order for Arabic tokens while preserving English & numbers.
 */
export function prepareRTLText(text: string): string {
  if (!text) return "";

  // Check if string contains Arabic characters
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  if (!hasArabic) return text;

  // Tokenize by space boundaries while preserving spaces
  const tokens = text.split(/(\s+)/);
  const processedTokens = tokens.map((token) => {
    if (/[\u0600-\u06FF]/.test(token)) {
      // Shape Arabic characters into contextual joined glyphs and reverse character order for LTR canvas/pdf
      const shaped = shapeArabicText(token);
      return Array.from(shaped).reverse().join("");
    }
    // English words, numbers (5,400), and currency symbols (IQD) remain in natural LTR order
    return token;
  });

  // Reverse overall token sequence so RTL sentence order is preserved
  return processedTokens.reverse().join("");
}

/**
 * Smart multi-line text wrapping helper for HTML5 Canvas.
 * Measures text using `ctx.measureText` and splits text into line arrays that fit `maxWidth`.
 */
export function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const shapedTestLine = prepareRTLText(testLine);
    const metrics = ctx.measureText(shapedTestLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(prepareRTLText(currentLine));
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(prepareRTLText(currentLine));
  }

  return lines;
}
