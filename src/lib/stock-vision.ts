import type { Product } from "@/types/database";
import { normalizeBatteryHealthValue, normalizeProductColorValue } from "@/lib/product-variants";

export type VisionScanResult = {
  imei1: string | null;
  imei2: string | null;
  brand: string | null;
  model: string | null;
  ram_gb: number | null;
  storage_gb: number | null;
  color: string | null;
  network: string | null;
  condition: string | null;
  battery_health: number | null;
};

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeTokens(value: string | null | undefined) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function compressImage(file: File, maxDim = 800, quality = 0.5): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

export async function scanImagesWithVision(images: string[]): Promise<VisionScanResult> {
  const response = await fetch("/api/groq/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images }),
  });

  const data = (await response.json()) as Partial<VisionScanResult> & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Failed to analyze images.");
  }

  return {
    imei1: data.imei1 ?? null,
    imei2: data.imei2 ?? null,
    brand: data.brand ?? null,
    model: data.model ?? null,
    ram_gb: typeof data.ram_gb === "number" ? data.ram_gb : null,
    storage_gb: typeof data.storage_gb === "number" ? data.storage_gb : null,
    color: data.color ?? null,
    network: data.network ?? null,
    condition: data.condition ?? null,
    battery_health: normalizeBatteryHealthValue(data.battery_health),
  } satisfies VisionScanResult;
}

export function findBestProductMatch(products: Product[], scan: VisionScanResult): Product | null {
  const brandTokens = normalizeTokens(scan.brand);
  const modelTokens = normalizeTokens(scan.model);
  const scanColor = normalizeProductColorValue(scan.color);
  const scanBattery = normalizeBatteryHealthValue(scan.battery_health);

  let bestProduct: Product | null = null;
  let bestScore = 0;

  products.forEach((product) => {
    const haystack = [
      product.product_name,
      product.product_key,
      product.category,
      product.color,
      product.network,
      product.storage_gb != null ? `${product.storage_gb}` : "",
      product.battery_health != null ? `${product.battery_health}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const normalizedHaystack = normalizeText(haystack);
    let score = 0;

    brandTokens.forEach((token) => {
      if (normalizedHaystack.includes(token)) score += 10;
    });

    modelTokens.forEach((token) => {
      if (normalizedHaystack.includes(token)) score += /\d/.test(token) ? 20 : 8;
    });

    if (scan.storage_gb != null && product.storage_gb === scan.storage_gb) score += 18;
    if (scan.ram_gb != null && product.ram_gb === scan.ram_gb) score += 12;
    if (scanColor && product.color && normalizeText(product.color) === normalizeText(scanColor)) score += 14;
    if (scanBattery != null && product.battery_health === scanBattery) score += 16;

    if (score > bestScore) {
      bestProduct = product;
      bestScore = score;
    }
  });

  return bestScore >= 18 ? bestProduct : null;
}
