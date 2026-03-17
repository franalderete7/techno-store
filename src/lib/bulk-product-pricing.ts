import type { Product } from "@/types/database";

export type BulkPricingRow = {
  source: string;
  productKey: string | null;
  productName: string | null;
  priceArs: number | null;
  priceUsd: number | null;
  promoPriceArs: number | null;
};

export type BulkPricingMatch = {
  row: BulkPricingRow;
  product: Product | null;
  score: number;
  reason: string;
};

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeTokenList(value: unknown) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function parseFlexiblePriceNumber(raw: string | null | undefined): number | null {
  const input = String(raw || "").trim();
  if (!input) return null;

  let sanitized = input.replace(/[^\d,.-]/g, "");
  if (!sanitized) return null;

  const hasDot = sanitized.includes(".");
  const hasComma = sanitized.includes(",");

  if (hasDot && hasComma) {
    if (sanitized.lastIndexOf(",") > sanitized.lastIndexOf(".")) {
      sanitized = sanitized.replace(/\./g, "").replace(",", ".");
    } else {
      sanitized = sanitized.replace(/,/g, "");
    }
  } else if (hasComma) {
    const commaCount = (sanitized.match(/,/g) || []).length;
    const lastCommaIndex = sanitized.lastIndexOf(",");
    const decimals = sanitized.length - lastCommaIndex - 1;
    sanitized =
      commaCount > 1 || decimals === 3
        ? sanitized.replace(/,/g, "")
        : sanitized.replace(",", ".");
  } else if (hasDot) {
    const dotCount = (sanitized.match(/\./g) || []).length;
    const lastDotIndex = sanitized.lastIndexOf(".");
    const decimals = sanitized.length - lastDotIndex - 1;
    if (dotCount > 1 || decimals === 3) {
      sanitized = sanitized.replace(/\./g, "");
    }
  }

  const parsed = Number.parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectDelimiter(line: string) {
  const candidates = ["\t", ";", "|", ","];
  let best = "";
  let bestCount = 0;

  candidates.forEach((candidate) => {
    const count = line.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  });

  return bestCount > 0 ? best : null;
}

function normalizeHeaderCell(value: string) {
  return normalizeText(value).replace(/\s+/g, "_");
}

function parseHeaderMappedRows(lines: string[]): BulkPricingRow[] {
  const delimiter = detectDelimiter(lines[0] || "");
  if (!delimiter) return [];

  const headers = lines[0]
    .split(delimiter)
    .map((cell) => normalizeHeaderCell(cell))
    .filter(Boolean);

  if (headers.length < 2) return [];

  const keyIndex = headers.findIndex((header) => ["product_key", "key", "sku", "codigo"].includes(header));
  const nameIndex = headers.findIndex((header) =>
    ["product_name", "producto", "product", "name", "modelo"].includes(header)
  );
  const arsIndex = headers.findIndex((header) =>
    ["price_ars", "ars", "precio_ars", "precio", "price"].includes(header)
  );
  const usdIndex = headers.findIndex((header) => ["price_usd", "usd", "precio_usd"].includes(header));
  const promoIndex = headers.findIndex((header) =>
    ["promo_price_ars", "promo", "promo_ars", "precio_promo"].includes(header)
  );

  if (keyIndex === -1 && nameIndex === -1) return [];
  if (arsIndex === -1 && usdIndex === -1 && promoIndex === -1) return [];

  return lines
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(delimiter).map((part) => part.trim());
      return {
        source: line,
        productKey: keyIndex >= 0 ? parts[keyIndex] || null : null,
        productName: nameIndex >= 0 ? parts[nameIndex] || null : null,
        priceArs: arsIndex >= 0 ? parseFlexiblePriceNumber(parts[arsIndex]) : null,
        priceUsd: usdIndex >= 0 ? parseFlexiblePriceNumber(parts[usdIndex]) : null,
        promoPriceArs: promoIndex >= 0 ? parseFlexiblePriceNumber(parts[promoIndex]) : null,
      } satisfies BulkPricingRow;
    })
    .filter((row) => row.productKey || row.productName);
}

function removeMatchedFragment(source: string, fragment: string | null | undefined) {
  if (!fragment) return source;
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.replace(new RegExp(escaped, "i"), " ");
}

function parseFreeformLine(line: string): BulkPricingRow | null {
  const raw = line.trim();
  if (!raw) return null;

  let priceArs: number | null = null;
  let priceUsd: number | null = null;
  let promoPriceArs: number | null = null;
  let rest = raw;

  const promoMatch = raw.match(/promo(?:\s+ars)?\s*[:=-]?\s*(?:ars|\$)?\s*([\d.,]+)/i);
  if (promoMatch) {
    promoPriceArs = parseFlexiblePriceNumber(promoMatch[1]);
    rest = removeMatchedFragment(rest, promoMatch[0]);
  }

  const arsMatch = raw.match(/(?:precio|ars|price)\s*[:=-]?\s*(?:ars|\$)?\s*([\d.,]+)/i);
  if (arsMatch) {
    priceArs = parseFlexiblePriceNumber(arsMatch[1]);
    rest = removeMatchedFragment(rest, arsMatch[0]);
  }

  const usdMatch = raw.match(/(?:usd|u\$s|us\$)\s*[:=-]?\s*([\d.,]+)/i);
  if (usdMatch) {
    priceUsd = parseFlexiblePriceNumber(usdMatch[1]);
    rest = removeMatchedFragment(rest, usdMatch[0]);
  }

  if (priceArs == null && priceUsd == null) {
    const numberMatches = [...raw.matchAll(/(?:\$|ars|usd|u\$s|us\$)?\s*([\d.,]+)/gi)];
    const candidates = numberMatches
      .map((match) => ({
        raw: match[0],
        value: parseFlexiblePriceNumber(match[1]),
      }))
      .filter((entry) => entry.value != null && entry.value > 256) as Array<{
      raw: string;
      value: number;
    }>;

    if (candidates.length > 0) {
      if (candidates.length >= 2) {
        const sorted = [...candidates].sort((left, right) => left.value - right.value);
        const maybeUsd = sorted[0];
        const maybeArs = sorted[sorted.length - 1];

        if (maybeArs.value >= 10000) {
          priceArs = Math.round(maybeArs.value);
          rest = removeMatchedFragment(rest, maybeArs.raw);
        }

        if (maybeUsd.value <= 10000 && maybeUsd.value !== maybeArs.value) {
          priceUsd = Number(maybeUsd.value.toFixed(2));
          rest = removeMatchedFragment(rest, maybeUsd.raw);
        }
      }

      if (priceArs == null && priceUsd == null) {
        const last = candidates[candidates.length - 1];
        if (/(usd|u\$s|us\$)/i.test(raw) && last.value <= 10000) {
          priceUsd = Number(last.value.toFixed(2));
        } else {
          priceArs = Math.round(last.value);
        }
        rest = removeMatchedFragment(rest, last.raw);
      }
    }
  }

  const cleanedName = rest
    .replace(/\s+/g, " ")
    .replace(/[|,;]+$/g, "")
    .trim();

  const productKeyMatch = cleanedName.match(/\b[a-z0-9]+(?:[-_][a-z0-9]+){2,}\b/i);
  const productKey = productKeyMatch ? productKeyMatch[0].trim() : null;
  const productName = cleanedName || null;

  if (!productKey && !productName) return null;
  if (priceArs == null && priceUsd == null && promoPriceArs == null) return null;

  return {
    source: raw,
    productKey,
    productName,
    priceArs,
    priceUsd,
    promoPriceArs,
  };
}

export function parseBulkPricingText(text: string): BulkPricingRow[] {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (lines.length === 0) return [];

  const headerRows = parseHeaderMappedRows(lines);
  if (headerRows.length > 0) return headerRows;

  return lines
    .map((line) => parseFreeformLine(line))
    .filter((row): row is BulkPricingRow => row !== null);
}

function scoreBulkPricingMatch(product: Product, row: BulkPricingRow) {
  const rowKey = normalizeText(row.productKey);
  const rowName = normalizeText(row.productName);
  const rowTokens = normalizeTokenList(row.productKey || row.productName);
  const productKey = normalizeText(product.product_key);
  const productName = normalizeText(product.product_name);
  const haystack = [
    product.product_key,
    product.product_name,
    product.category,
    product.color,
    product.network,
    product.storage_gb != null ? String(product.storage_gb) : "",
    product.ram_gb != null ? String(product.ram_gb) : "",
    product.condition,
  ]
    .filter(Boolean)
    .join(" ");
  const normalizedHaystack = normalizeText(haystack);

  let score = 0;
  let reason = "Sin match claro";

  if (rowKey && rowKey === productKey) {
    return { score: 300, reason: "Product key exacto" };
  }

  if (rowKey && productKey.includes(rowKey)) {
    score += 120;
    reason = "Product key parcial";
  }

  if (rowName && rowName === productName) {
    score += 220;
    reason = "Nombre exacto";
  } else if (rowName && productName.includes(rowName)) {
    score += 150;
    reason = "Nombre incluido";
  } else if (rowName && rowName.includes(productName)) {
    score += 140;
    reason = "Nombre amplio";
  }

  rowTokens.forEach((token) => {
    if (normalizedHaystack.includes(token)) {
      score += /\d/.test(token) ? 28 : 10;
    }
  });

  return { score, reason };
}

export function matchBulkPricingRowsToProducts(
  rows: BulkPricingRow[],
  products: Product[]
): BulkPricingMatch[] {
  return rows.map((row) => {
    let bestProduct: Product | null = null;
    let bestScore = 0;
    let bestReason = "Sin match";

    products.forEach((product) => {
      const { score, reason } = scoreBulkPricingMatch(product, row);
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
        bestReason = reason;
      }
    });

    return {
      row,
      product: bestScore >= 40 ? bestProduct : null,
      score: bestScore,
      reason: bestScore >= 40 ? bestReason : "No se encontro producto confiable",
    };
  });
}
