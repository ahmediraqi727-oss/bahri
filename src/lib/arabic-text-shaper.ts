/**
 * arabic-text-shaper.ts
 *
 * Enterprise Arabic Text Shaping & BiDi Normalizer Engine for Ahmed Bahri Store.
 * Converts raw Arabic character sequences into contextual connected glyphs
 * (Unicode Presentation Forms-B \uFE70 - \uFEFF) with Lam-Alef ligature support,
 * right-to-left word ordering, and smart multi-line Canvas text wrapping.
 *
 * Mixed BiDi guarantee:
 *   - Arabic word runs → shaped with contextual glyphs + character-reversed for LTR canvas/PDF
 *   - Non-Arabic runs (Latin letters, digits, currency symbols like "IQD", "5,400") → preserved LTR
 *   - Overall RTL sentence order is maintained by reversing the word-token sequence
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
 * Returns true if the string contains at least one Arabic character.
 */
function containsArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
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
 *
 * Algorithm:
 *   1. Split on whitespace boundaries to get word tokens.
 *   2. Classify each token: Arabic (contains ≥1 Arabic char) or Latin/numeric.
 *   3. Reverse the word-token sequence to reflect RTL sentence order on the LTR canvas.
 *   4. Shape & char-reverse Arabic tokens → visual glyphs drawn correctly in LTR raster space.
 *   5. Latin tokens (e.g. "FASHION E-PIKE"), numbers ("5,400"), currency ("IQD") remain intact.
 *
 * Example:
 *   Input:  "قميص FASHION رجالي 5,400 IQD"
 *   Output: "IQD 5,400 <shaped قميص reversed> FASHION <shaped يلاجر reversed>"
 *   Visual: reads correctly right-to-left on any thermal/canvas/PDF renderer.
 */
export function prepareRTLText(text: string): string {
  if (!text) return "";

  // Pass-through for pure Latin/numeric strings
  if (!containsArabic(text)) return text;

  // Tokenize: split on whitespace, filter out blank slots
  const rawTokens = text.split(/(\s+)/);
  const wordTokens: string[] = [];

  for (const tok of rawTokens) {
    if (/^\s+$/.test(tok)) continue; // skip pure-whitespace separators
    if (tok !== "") wordTokens.push(tok);
  }

  // Shape & char-reverse Arabic tokens; leave Latin/digit tokens intact
  const shapedTokens = wordTokens.map((tok) => {
    if (containsArabic(tok)) {
      const shaped = shapeArabicText(tok);
      return Array.from(shaped).reverse().join("");
    }
    // Latin words, numbers (5,400), currency symbols (IQD) → natural LTR order preserved
    return tok;
  });

  // Reverse overall word sequence to get RTL visual sentence order
  shapedTokens.reverse();

  return shapedTokens.join(" ");
}

/**
 * Smart multi-line text wrapping helper for HTML5 Canvas.
 *
 * Wraps on raw (unshaped) text for correct word-boundary measurement,
 * then applies prepareRTLText() per completed line for shaped/reversed output.
 * This prevents width-measurement drift caused by Presentation-Form glyph substitution.
 */
export function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];

  const isRTL = containsArabic(text);
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    // Measure raw text (before shaping) for consistent width calculation
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      // Shape only when flushing the completed line
      lines.push(isRTL ? prepareRTLText(currentLine) : currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(isRTL ? prepareRTLText(currentLine) : currentLine);
  }

  return lines;
}
