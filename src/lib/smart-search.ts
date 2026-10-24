import React from "react";
import type { Product } from "@/lib/types";
import { extractCategoryFromNotes } from "@/lib/seo";

/**
 * 1. تحويل الأرقام العربية الشرقية والفارسية (٠-٩ / ۰-۹) إلى أرقام قياسية (0-9)
 */
const EASTERN_DIGITS_MAP: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

export function normalizeDigits(input: string): string {
  if (!input) return "";
  return input.replace(/[٠-٩۰-۹]/g, (ch) => EASTERN_DIGITS_MAP[ch] ?? ch);
}

/**
 * 2. تطبيع الحروف العربية واللاتينية للبحث الذكي غير الحساس للهمزات والتشكيل والتاء المربوطة
 */
export function normalizeArabicChar(ch: string): string {
  if (EASTERN_DIGITS_MAP[ch]) return EASTERN_DIGITS_MAP[ch];
  switch (ch) {
    case "أ":
    case "إ":
    case "آ":
    case "ٱ":
    case "ٲ":
    case "ٳ":
      return "ا";
    case "ة":
    case "ۀ":
      return "ه";
    case "ى":
    case "ی":
    case "ئ":
      return "ي";
    case "ؤ":
      return "و";
    case "ک":
      return "ك";
    case "گ":
    case "چ":
      return ch === "گ" ? "ك" : "ج";
    case "پ":
      return "ب";
    case "ڤ":
      return "ف";
    default:
      return ch.toLowerCase();
  }
}

export function isIgnoredDiacritic(ch: string): boolean {
  const code = ch.charCodeAt(0);
  // Tashkeel (064B - 065F), Superscript Alef (0670), Tatweel (0640)
  return (code >= 0x064b && code <= 0x065f) || code === 0x0670 || code === 0x0640;
}

export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return "";
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (isIgnoredDiacritic(ch)) continue;
    out += normalizeArabicChar(ch);
  }
  return out
    .replace(/[^\p{L}\p{N}\s.+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 3. قاموس مرادفات قطع غيار الدراجات النارية والكهربائية والشحن (باللهجة العراقية والعربية الفصحى والإنجليزية)
 */
const RAW_SYNONYM_GROUPS: string[][] = [
  ["تاير", "اطار", "كفر", "تيوبلس", "لاصتك", "تير", "اطارات", "تايرات", "tire", "tyre"],
  ["جوب", "تيوب", "داخلي", "چوب", "انبوب", "tube"],
  ["باتري", "بطاريه", "نضيده", "بطاريات", "خليه", "ليثيوم", "امبير", "فولت", "battery"],
  ["شاحنه", "شاحن", "جارجر", "محوله", "شواحن", "تشارجر", "charger"],
  ["بريك", "فرامل", "سفايف", "دسك", "فرمله", "كابح", "لجام", "دسكات", "فحمات", "brake", "pad"],
  ["بولبرن", "رومان", "بلبرن", "محمل", "برن", "بولبرين", "رولمان", "bearing"],
  ["جنط", "ويل", "رنك", "طوق", "اطواق", "سبانه", "جنوط", "wheel", "rim"],
  ["كلتش", "صحن", "فاصل", "كلاتش", "دبرياج", "قوابض", "clutch"],
  ["كربريتر", "كاربراتير", "كابريتر", "مكربن", "حاقن", "بخاخ", "carburetor"],
  ["ماطور", "محرك", "دينمو", "موتور", "مكينه", "ملف", "ستيتر", "motor", "engine"],
  ["لايت", "شمعه", "فانوس", "لد", "مصباح", "اناره", "اضاءه", "بروجكتر", "كشاف", "اضويه", "led", "light"],
  ["اشاير", "اشاره", "غماز", "فليشر", "اشارات", "رباعي"],
  ["دبل", "دبلات", "مساعد", "ماص", "صدمات", "مخمد", "مساعدات", "shock"],
  ["زنجيل", "سلسله", "جنزير", "طقم", "سنون", "دشلي", "مسنن", "chain", "sprocket"],
  ["بلك", "بوجي", "بواجي", "قداحه", "شمعه احتراق", "spark"],
  ["واير", "كيبل", "سلك", "جدله", "ضفيره", "حبل", "اسلاك", "wire", "cable"],
  ["عقل", "كونترول", "منظم", "كتاوت", "ريلي", "كويل", "اوتوماتيك", "controller", "cdi"],
  ["يد", "قبضه", "ليفر", "مقبض", "تخته", "دركسون", "مقود", "سكليتر", "دعسه", "مقابض"],
  ["مرايه", "مري", "مرايا", "عاكس", "mirror"],
  ["كشن", "مقعد", "سيت", "كرسي", "سرج", "seat"],
  ["جامرلغ", "طينيه", "رفرف", "واقي", "بدي", "فندر", "لحيه", "كفرات"],
  ["كزوز", "عادم", "صالنصا", "شكمان", "exhaust"],
  ["فلتر", "مصفى", "مشخل", "شوته", "منقي", "filter"],
  ["دهن", "زيت", "شحم", "هايدروليك", "تشحيم", "oil"],
  ["بستن", "مكبس", "رنكات", "سلندر", "بوشه", "كازكيت", "واشر", "جبنه", "سيل", "لباد", "piston", "cylinder"],
  ["سويج", "جوزه", "مفتاح", "قفل", "بصمه", "ريموت", "تشغيل", "switch"],
  ["عداد", "كيج", "شاشه", "كيلومتر", "سرعه", "طبلون", "meter"],
  ["دراجه", "بايسكل", "سكوتر", "ستوته", "تكتك", "كهربائي", "شحن", "ناريه", "بطح", "حمل"],
  ["امامي", "كدام", "اماميه", "front"],
  ["خلفي", "ورا", "خلفيه", "rear", "back"],
  ["اصلي", "وكاله", "يباني", "ياباني", "تايواني", "صيني", "درجه اولى"],
];

const SYNONYM_LOOKUP = new Map<string, string[]>();
for (const group of RAW_SYNONYM_GROUPS) {
  const normalizedGroup = Array.from(new Set(group.map((w) => normalizeSearchText(w)).filter(Boolean)));
  for (const term of normalizedGroup) {
    const existing = SYNONYM_LOOKUP.get(term) || [];
    SYNONYM_LOOKUP.set(term, Array.from(new Set([...existing, ...normalizedGroup])));
  }
}

/**
 * إزالة "ال" التعريف واللواحق البسيطة للحصول على جذر الكلمة المقارب
 */
export function stripArabicAffixes(word: string): string {
  let w = word;
  if (w.startsWith("وال") && w.length > 5) w = w.slice(3);
  else if (w.startsWith("بال") && w.length > 5) w = w.slice(3);
  else if (w.startsWith("لل") && w.length > 4) w = w.slice(2);
  else if (w.startsWith("ال") && w.length > 4) w = w.slice(2);

  if (w.endsWith("ات") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("ين") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("ان") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("يه") && w.length > 4) w = w.slice(0, -1);
  return w;
}

export function expandTokenSynonyms(token: string): string[] {
  const norm = normalizeSearchText(token);
  if (!norm) return [];
  const stripped = stripArabicAffixes(norm);
  const results = new Set<string>([norm]);
  if (stripped && stripped.length >= 2) {
    results.add(stripped);
  }

  const directSyns = SYNONYM_LOOKUP.get(norm);
  if (directSyns) directSyns.forEach((s) => results.add(s));

  const strippedSyns = SYNONYM_LOOKUP.get(stripped);
  if (strippedSyns) strippedSyns.forEach((s) => results.add(s));

  // Partial prefix synonym expansion for tokens >= 3 chars
  if (norm.length >= 3 && results.size <= 2) {
    SYNONYM_LOOKUP.forEach((group, key) => {
      if (key.startsWith(norm) || (stripped.length >= 3 && key.startsWith(stripped))) {
        group.forEach((s) => results.add(s));
      }
    });
  }

  return Array.from(results);
}

/**
 * 4. خوارزمية التشابه الثلاثي (Trigram Similarity - pg_trgm equivalent) ومسافة التحرير (Levenshtein)
 */
export function extractTrigrams(text: string): Set<string> {
  const clean = `  ${text} `;
  const trigrams = new Set<string>();
  for (let i = 0; i <= clean.length - 3; i++) {
    trigrams.add(clean.slice(i, i + 3));
  }
  return trigrams;
}

export function computeTrigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) {
    return b.includes(a) || a.includes(b) ? 0.8 : 0;
  }
  const triA = extractTrigrams(a);
  const triB = extractTrigrams(b);
  if (triA.size === 0 || triB.size === 0) return 0;

  let intersection = 0;
  triA.forEach((t) => {
    if (triB.has(t)) intersection++;
  });

  const union = triA.size + triB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * حساب مسافة التحرير السريعة (Bounded Levenshtein Distance) للتسامح مع الأخطاء الإملائية
 */
export function isWithinEditDistance(a: string, b: string, maxDist = 2): boolean {
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return false;
  if (a === b) return true;

  const prev = new Array(lenB + 1);
  const curr = new Array(lenB + 1);
  for (let j = 0; j <= lenB; j++) prev[j] = j;

  for (let i = 1; i <= lenA; i++) {
    curr[0] = i;
    let minInRow = curr[0];
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
      if (curr[j] < minInRow) minInRow = curr[j];
    }
    if (minInRow > maxDist) return false;
    for (let j = 0; j <= lenB; j++) prev[j] = curr[j];
  }
  return prev[lenB] <= maxDist;
}

/**
 * 5. فهرسة المنتج السريعة بالذاكرة وحساب درجة التطابق الهجينة
 */
interface IndexedProductEntry {
  product: Product;
  normName: string;
  nameWords: string[];
  strippedNameWords: string[];
  normCategory: string;
  normNotes: string;
  normBarcode: string;
  normSupplier: string;
  fullSearchBlob: string;
  allWords: string[];
}

const productIndexCache = new WeakMap<
  Product,
  {
    rawKey: string;
    entry: IndexedProductEntry;
  }
>();

function getIndexedProduct(
  product: Product,
  supplierName = ""
): IndexedProductEntry {
  const rawKey = `${product.name}|${product.categoryName || ""}|${product.notes || ""}|${product.barcode || ""}|${product.qrCode || ""}|${supplierName}`;
  const cached = productIndexCache.get(product);
  if (cached && cached.rawKey === rawKey) {
    return cached.entry;
  }

  const normName = normalizeSearchText(product.name);
  const extractedCat = product.categoryName || extractCategoryFromNotes(product.notes || "") || "";
  const normCategory = normalizeSearchText(extractedCat);
  const normNotes = normalizeSearchText(product.notes || "");
  const normBarcode = normalizeSearchText(`${product.barcode || ""} ${product.qrCode || ""} ${product.id || ""}`);
  const normSupplier = normalizeSearchText(supplierName);

  const nameWords = normName.split(/\s+/).filter(Boolean);
  const strippedNameWords = nameWords.map(stripArabicAffixes);
  const fullSearchBlob = `${normName} ${normCategory} ${normNotes} ${normBarcode} ${normSupplier}`.trim();
  const allWords = Array.from(new Set(fullSearchBlob.split(/\s+/).filter(Boolean)));

  const entry: IndexedProductEntry = {
    product,
    normName,
    nameWords,
    strippedNameWords,
    normCategory,
    normNotes,
    normBarcode,
    normSupplier,
    fullSearchBlob,
    allWords,
  };

  productIndexCache.set(product, { rawKey, entry });
  return entry;
}

export interface ScoredProductMatch {
  product: Product;
  score: number;
  matchType: "exact" | "partial" | "synonym" | "fuzzy";
  matchedTerms: string[];
}

export interface SmartProductSearchResult {
  directMatches: Product[];
  fallbackMatches: Product[];
  scoredDirect: ScoredProductMatch[];
  scoredFallback: ScoredProductMatch[];
  highlightTokens: string[];
  normalizedQuery: string;
}

/**
 * محرك البحث الذكي الرئيسي للمنتجات (يدعم المطابقة المباشرة، الجزئية، المرادفات، والأخطاء الإملائية + قسم المقترحات البديلة)
 */
export function searchProductsSmart(
  products: Product[],
  rawQuery: string,
  options?: {
    supplierNameMap?: Map<string, string>;
    maxFallbackResults?: number;
  }
): SmartProductSearchResult {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) {
    return {
      directMatches: products,
      fallbackMatches: [],
      scoredDirect: [],
      scoredFallback: [],
      highlightTokens: [],
      normalizedQuery: "",
    };
  }

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const tokenSynonymSets = queryTokens.map((t) => ({
    rawToken: t,
    strippedToken: stripArabicAffixes(t),
    synonyms: expandTokenSynonyms(t),
  }));

  // Collect all tokens & synonyms for UI highlighting
  const highlightSet = new Set<string>();
  tokenSynonymSets.forEach(({ rawToken, strippedToken, synonyms }) => {
    if (rawToken.length >= 1) highlightSet.add(rawToken);
    if (strippedToken.length >= 2) highlightSet.add(strippedToken);
    synonyms.forEach((s) => {
      if (s.length >= 2) highlightSet.add(s);
    });
  });

  const scoredDirect: ScoredProductMatch[] = [];
  const scoredFallback: ScoredProductMatch[] = [];
  const supplierMap = options?.supplierNameMap;
  const maxFallback = options?.maxFallbackResults ?? 8;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const supName = (product.supplierId && supplierMap?.get(product.supplierId)) || "";
    const idx = getIndexedProduct(product, supName);

    let totalScore = 0;
    let directTokenHits = 0;
    let synonymTokenHits = 0;
    let fuzzyTokenHits = 0;
    const matchedTerms: string[] = [];

    // 1. مطابقة الباركود أو الكود المباشر أو البادئة
    if (idx.normBarcode && idx.normBarcode.includes(normalizedQuery)) {
      totalScore += idx.normBarcode.startsWith(normalizedQuery) ? 140 : 115;
      directTokenHits = queryTokens.length;
      matchedTerms.push(normalizedQuery);
    }

    // 2. مطابقة العبارة الكاملة في اسم المنتج أو القسم أو الملاحظات
    if (idx.normName === normalizedQuery) {
      totalScore += 130;
      directTokenHits = queryTokens.length;
    } else if (idx.normName.startsWith(normalizedQuery)) {
      totalScore += 110;
      directTokenHits = queryTokens.length;
    } else if (idx.normName.includes(normalizedQuery)) {
      totalScore += 95;
      directTokenHits = queryTokens.length;
    } else if (idx.fullSearchBlob.includes(normalizedQuery)) {
      totalScore += 80;
      directTokenHits = queryTokens.length;
    }

    // 3. تحليل كل كلمة في جملة البحث بشكل مستقل (Multi-Token Out-of-Order & Synonym/Fuzzy Analysis)
    for (let tIdx = 0; tIdx < tokenSynonymSets.length; tIdx++) {
      const { rawToken, strippedToken, synonyms } = tokenSynonymSets[tIdx];
      let tokenBestScore = 0;
      let tokenHitKind: "none" | "direct" | "synonym" | "fuzzy" = "none";

      // 3A. فحص الكلمة الأصلية أو جذرها في الاسم أو الكود أو القسم أو الملاحظات
      const checkRoot = strippedToken.length >= 2 ? strippedToken : rawToken;
      if (idx.normName.includes(rawToken) || (checkRoot.length >= 2 && idx.normName.includes(checkRoot))) {
        const isWordStart = idx.nameWords.some(
          (w) => w.startsWith(rawToken) || (checkRoot.length >= 2 && w.startsWith(checkRoot))
        );
        tokenBestScore = isWordStart ? 45 : 36;
        tokenHitKind = "direct";
        matchedTerms.push(rawToken);
      } else if (idx.normBarcode.includes(rawToken)) {
        tokenBestScore = 42;
        tokenHitKind = "direct";
        matchedTerms.push(rawToken);
      } else if (
        idx.normCategory.includes(rawToken) ||
        (checkRoot.length >= 2 && idx.normCategory.includes(checkRoot))
      ) {
        tokenBestScore = 32;
        tokenHitKind = "direct";
        matchedTerms.push(rawToken);
      } else if (
        idx.normNotes.includes(rawToken) ||
        idx.normSupplier.includes(rawToken) ||
        (checkRoot.length >= 2 && idx.normNotes.includes(checkRoot))
      ) {
        tokenBestScore = 26;
        tokenHitKind = "direct";
        matchedTerms.push(rawToken);
      }

      // 3B. إذا لم تطابق الكلمة مباشرة، نفحص مرادفات قطع الغيار (Synonym Expansion)
      if (tokenHitKind === "none" && synonyms.length > 1) {
        for (let sIdx = 0; sIdx < synonyms.length; sIdx++) {
          const syn = synonyms[sIdx];
          if (syn === rawToken || syn === strippedToken) continue;
          if (idx.normName.includes(syn)) {
            tokenBestScore = 30;
            tokenHitKind = "synonym";
            matchedTerms.push(syn);
            break;
          }
          if (idx.normCategory.includes(syn) || idx.normNotes.includes(syn)) {
            tokenBestScore = 22;
            tokenHitKind = "synonym";
            matchedTerms.push(syn);
            break;
          }
        }
      }

      // 3C. إذا لم تطابق مباشرة أو بالمرادفات، نفحص التسامح مع الأخطاء الإملائية (Fuzzy Trigram & Edit Distance)
      if (tokenHitKind === "none" && rawToken.length >= 3) {
        let bestFuzzy = 0;
        for (let wIdx = 0; wIdx < idx.allWords.length; wIdx++) {
          const candidateWord = idx.allWords[wIdx];
          if (candidateWord.length < 2) continue;

          // Edit distance check (1 typo for 4-5 char words, 2 typos for >=6 char words)
          const allowedDist = rawToken.length >= 6 ? 2 : rawToken.length >= 4 ? 1 : 0;
          if (allowedDist > 0 && isWithinEditDistance(rawToken, candidateWord, allowedDist)) {
            const isNameWord = idx.nameWords.includes(candidateWord);
            const scoreCandidate = isNameWord ? 22 : 15;
            if (scoreCandidate > bestFuzzy) {
              bestFuzzy = scoreCandidate;
              matchedTerms.push(candidateWord);
            }
          } else {
            // Trigram similarity check
            const sim = computeTrigramSimilarity(rawToken, candidateWord);
            if (sim >= 0.36) {
              const isNameWord = idx.nameWords.includes(candidateWord);
              const scoreCandidate = Math.round(sim * (isNameWord ? 28 : 18));
              if (scoreCandidate > bestFuzzy) {
                bestFuzzy = scoreCandidate;
                matchedTerms.push(candidateWord);
              }
            }
          }
        }

        if (bestFuzzy > 0) {
          tokenBestScore = bestFuzzy;
          tokenHitKind = "fuzzy";
        }
      }

      totalScore += tokenBestScore;
      if (tokenHitKind === "direct") directTokenHits++;
      else if (tokenHitKind === "synonym") synonymTokenHits++;
      else if (tokenHitKind === "fuzzy") fuzzyTokenHits++;
    }

    const totalStrongHits = directTokenHits + synonymTokenHits;
    const totalAnyHits = totalStrongHits + fuzzyTokenHits;

    // تصنيف النتيجة إلى مطابقة مباشرة (Tier 1) أو مقترح مشابه بديل (Tier 2)
    if (totalStrongHits === queryTokens.length) {
      // جميع كلمات البحث طابقت مباشرة أو عبر مرادف معتمد
      const matchType =
        directTokenHits === queryTokens.length
          ? idx.normName.includes(normalizedQuery)
            ? "exact"
            : "partial"
          : "synonym";
      scoredDirect.push({
        product,
        score: totalScore + (directTokenHits === queryTokens.length ? 25 : 10),
        matchType,
        matchedTerms,
      });
    } else if (
      queryTokens.length >= 2 &&
      totalAnyHits === queryTokens.length &&
      totalStrongHits >= queryTokens.length - 1
    ) {
      // في الجمل متعددة الكلمات: كل الكلمات طابقت مع وجود خطأ إملائي بسيط في كلمة واحدة على الأكثر
      scoredDirect.push({
        product,
        score: totalScore + 5,
        matchType: "fuzzy",
        matchedTerms,
      });
    } else if (totalAnyHits > 0 && totalScore >= 14) {
      // تطابق جزئي لبعض الكلمات أو تشابه تقريبي -> يوضع في قسم "منتجات مشابهة ومقترحة"
      scoredFallback.push({
        product,
        score: totalScore,
        matchType: synonymTokenHits > 0 ? "synonym" : fuzzyTokenHits > 0 ? "fuzzy" : "partial",
        matchedTerms,
      });
    } else if (normalizedQuery.length >= 3) {
      // فحص تشابه العبارة الكاملة عبر Trigram Similarity للحالات الصعبة
      const wholeNameSim = computeTrigramSimilarity(normalizedQuery, idx.normName);
      if (wholeNameSim >= 0.24) {
        scoredFallback.push({
          product,
          score: Math.round(wholeNameSim * 40),
          matchType: "fuzzy",
          matchedTerms: [],
        });
      }
    }
  }

  // ترتيب النتائج تنازلياً حسب درجة الصلة (مع تفضيل المنتجات المتوفرة في المخزون عند تساوي الدرجة)
  const sortByScore = (a: ScoredProductMatch, b: ScoredProductMatch) => {
    if (b.score !== a.score) return b.score - a.score;
    const aStock = (a.product.stock ?? 0) > 0 ? 1 : 0;
    const bStock = (b.product.stock ?? 0) > 0 ? 1 : 0;
    return bStock - aStock;
  };

  scoredDirect.sort(sortByScore);
  scoredFallback.sort(sortByScore);

  const directMatches = scoredDirect.map((s) => s.product);
  const directIds = new Set(directMatches.map((p) => p.id));

  // إذا كانت المطابقات المباشرة قليلة (أقل من أو تساوي 4) نكمل قسم المقترحات البديلة بمنتجات من نفس أقسام المطابقات المباشرة
  let finalFallback = scoredFallback
    .filter((s) => !directIds.has(s.product.id))
    .slice(0, maxFallback);

  if (directMatches.length > 0 && directMatches.length <= 4 && finalFallback.length < 4) {
    const primaryCategories = new Set<string>();
    directMatches.forEach((p) => {
      const cat = normalizeSearchText(p.categoryName || extractCategoryFromNotes(p.notes || ""));
      if (cat && cat !== "عام") primaryCategories.add(cat);
    });

    if (primaryCategories.size > 0) {
      const existingFallbackIds = new Set(finalFallback.map((f) => f.product.id));
      for (const prod of products) {
        if (directIds.has(prod.id) || existingFallbackIds.has(prod.id)) continue;
        const pCat = normalizeSearchText(prod.categoryName || extractCategoryFromNotes(prod.notes || ""));
        if (pCat && primaryCategories.has(pCat)) {
          finalFallback.push({
            product: prod,
            score: 12,
            matchType: "synonym",
            matchedTerms: [],
          });
          if (finalFallback.length >= maxFallback) break;
        }
      }
    }
  }

  return {
    directMatches,
    fallbackMatches: finalFallback.map((s) => s.product),
    scoredDirect,
    scoredFallback: finalFallback,
    highlightTokens: Array.from(highlightSet),
    normalizedQuery,
  };
}

/**
 * 6. دالة البحث المرن العام للجداول الأخرى (الموردين، الزبائن، الطلبات، الفواتير، الأقسام)
 */
export function scoreSmartRecordMatch(
  fields: (string | number | undefined | null)[],
  rawQuery: string
): number {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) return 100;

  const combined = normalizeSearchText(
    fields
      .filter((f) => f !== undefined && f !== null)
      .map(String)
      .join(" ")
  );
  if (!combined) return 0;

  if (combined.includes(normQuery)) {
    return combined.startsWith(normQuery) ? 100 : 85;
  }

  const queryTokens = normQuery.split(/\s+/).filter(Boolean);
  const candidateWords = combined.split(/\s+/).filter(Boolean);

  let matchedCount = 0;
  let score = 0;

  for (const token of queryTokens) {
    const stripped = stripArabicAffixes(token);
    const syns = expandTokenSynonyms(token);

    if (combined.includes(token) || (stripped.length >= 2 && combined.includes(stripped))) {
      matchedCount++;
      score += 30;
      continue;
    }

    if (syns.some((s) => combined.includes(s))) {
      matchedCount++;
      score += 22;
      continue;
    }

    if (token.length >= 3) {
      const allowedDist = token.length >= 6 ? 2 : token.length >= 4 ? 1 : 0;
      const fuzzyHit = candidateWords.some(
        (w) =>
          (allowedDist > 0 && isWithinEditDistance(token, w, allowedDist)) ||
          computeTrigramSimilarity(token, w) >= 0.38
      );
      if (fuzzyHit) {
        matchedCount++;
        score += 15;
      }
    }
  }

  if (matchedCount === queryTokens.length) return score;
  if (queryTokens.length >= 2 && matchedCount >= queryTokens.length - 1 && score >= 25) return score;
  return 0;
}

export function filterItemsSmart<T>(
  items: T[],
  rawQuery: string,
  getFields: (item: T) => (string | number | undefined | null)[]
): T[] {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) return items;

  const scored: { item: T; score: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const score = scoreSmartRecordMatch(getFields(item), rawQuery);
    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

/**
 * 7. مكون تظليل الكلمات المطابقة داخل النصوص العربية واللاتينية مع مراعاة الحروف المطبّعة
 */
export function HighlightSearchMatch({
  text,
  query,
  highlightClassName = "bg-[#5b21b6]/20 dark:bg-[#5b21b6]/50 text-[#5b21b6] dark:text-purple-200 font-extrabold px-1 rounded-md border border-[#5b21b6]/30",
}: {
  text: string;
  query?: string;
  highlightClassName?: string;
}): React.ReactElement {
  if (!text || !query || !query.trim()) {
    return React.createElement(React.Fragment, null, text);
  }

  const normQuery = normalizeSearchText(query);
  if (!normQuery) {
    return React.createElement(React.Fragment, null, text);
  }

  // بناء خريطة تربط كل حرف في النص المطبّع بموقعه الأصلي في النص الحقيقي
  let normalizedText = "";
  const normToOrigIndex: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (isIgnoredDiacritic(ch)) continue;
    normalizedText += normalizeArabicChar(ch);
    normToOrigIndex.push(i);
  }

  // استخراج الرموز المطلوب تظليلها (الكلمات الأصلية + الجذور + المرادفات المطابقة)
  const rawTokens = normQuery.split(/\s+/).filter((t) => t.length >= 1);
  const candidateTokens = new Set<string>();
  rawTokens.forEach((t) => {
    candidateTokens.add(t);
    const stripped = stripArabicAffixes(t);
    if (stripped.length >= 2) candidateTokens.add(stripped);
    expandTokenSynonyms(t).forEach((s) => {
      if (s.length >= 2) candidateTokens.add(s);
    });
  });

  const sortedTokens = Array.from(candidateTokens).sort((a, b) => b.length - a.length);
  const highlightMask = new Array(text.length).fill(false);

  for (const token of sortedTokens) {
    if (!token) continue;
    let startIndex = 0;
    while (startIndex < normalizedText.length) {
      const foundIdx = normalizedText.indexOf(token, startIndex);
      if (foundIdx === -1) break;

      const origStart = normToOrigIndex[foundIdx];
      const endNormIdx = foundIdx + token.length - 1;
      let origEnd = normToOrigIndex[endNormIdx] + 1;
      // تضمين أي حركات تشكيل تابعة للحرف الأخير
      while (origEnd < text.length && isIgnoredDiacritic(text[origEnd])) {
        origEnd++;
      }

      for (let k = origStart; k < origEnd; k++) {
        highlightMask[k] = true;
      }

      startIndex = foundIdx + token.length;
    }
  }

  if (!highlightMask.some(Boolean)) {
    return React.createElement(React.Fragment, null, text);
  }

  const segments: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const isHighlighted = highlightMask[i];
    let j = i + 1;
    while (j < text.length && highlightMask[j] === isHighlighted) {
      j++;
    }
    const slice = text.slice(i, j);
    if (isHighlighted) {
      segments.push(
        React.createElement(
          "mark",
          {
            key: `hl-${i}`,
            className: highlightClassName,
          },
          slice
        )
      );
    } else {
      segments.push(React.createElement("span", { key: `tx-${i}` }, slice));
    }
    i = j;
  }

  return React.createElement(React.Fragment, null, ...segments);
}
