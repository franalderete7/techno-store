import { createHash } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getRequiredEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function buildSignature(params: Record<string, string>, apiSecret: string): string {
  const paramsToSign = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1").update(`${paramsToSign}${apiSecret}`).digest("hex");
}

export async function POST(request: Request) {
  const cloudName = getRequiredEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = getRequiredEnv("CLOUDINARY_API_KEY");
  const apiSecret = getRequiredEnv("CLOUDINARY_API_SECRET");
  const assetFolder = getRequiredEnv("CLOUDINARY_ASSET_FOLDER") ?? "assets";

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      {
        error:
          "Cloudinary environment variables are missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.local.",
      },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const productKeyRaw = formData.get("productKey");
    const assetKeyRaw = formData.get("assetKey");
    const folderRaw = formData.get("folder");
    const productKey = String(productKeyRaw ?? "").trim().toLowerCase();
    const assetKey = String(assetKeyRaw ?? "").trim().toLowerCase();
    const folder =
      String(folderRaw ?? "").trim().replace(/^\/+|\/+$/g, "") || assetFolder;
    const publicId = assetKey || productKey;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please choose an image file to upload." }, { status: 400 });
    }

    if (!publicId) {
      return NextResponse.json(
        { error: "A generated asset key is required for the upload." },
        { status: 400 }
      );
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = buildSignature(
      {
        folder,
        overwrite: "true",
        public_id: publicId,
        timestamp,
      },
      apiSecret
    );

    const cloudinaryFormData = new FormData();
    cloudinaryFormData.append("file", file);
    cloudinaryFormData.append("api_key", apiKey);
    cloudinaryFormData.append("timestamp", timestamp);
    cloudinaryFormData.append("signature", signature);
    cloudinaryFormData.append("folder", folder);
    cloudinaryFormData.append("public_id", publicId);
    cloudinaryFormData.append("overwrite", "true");

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: "POST",
        body: cloudinaryFormData,
      }
    );

    const uploadResult = (await uploadResponse.json()) as {
      error?: { message?: string };
      public_id?: string;
      secure_url?: string;
    };

    if (!uploadResponse.ok || !uploadResult.secure_url) {
      return NextResponse.json(
        {
          error: uploadResult.error?.message || "Cloudinary rejected the image upload.",
        },
        { status: uploadResponse.status || 500 }
      );
    }

    return NextResponse.json({
      publicId: uploadResult.public_id,
      secureUrl: uploadResult.secure_url,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error uploading to Cloudinary.",
      },
      { status: 500 }
    );
  }
}
