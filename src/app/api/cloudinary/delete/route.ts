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

function extractPublicIdFromCloudinaryUrl(imageUrl: string): string | null {
  try {
    const url = new URL(imageUrl);
    const uploadMarker = "/image/upload/";
    const markerIndex = url.pathname.indexOf(uploadMarker);

    if (markerIndex === -1) return null;

    const assetPath = url.pathname.slice(markerIndex + uploadMarker.length);
    const segments = assetPath.split("/").filter(Boolean);

    if (segments.length === 0) return null;

    const withoutVersion =
      segments[0] && /^v\d+$/.test(segments[0]) ? segments.slice(1) : segments;

    if (withoutVersion.length === 0) return null;

    const lastSegment = withoutVersion[withoutVersion.length - 1];
    withoutVersion[withoutVersion.length - 1] = lastSegment.replace(/\.[^.]+$/, "");

    return withoutVersion.join("/");
  } catch {
    return null;
  }
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
    const body = (await request.json()) as { imageUrl?: string; productKey?: string };
    const imageUrl = String(body.imageUrl ?? "").trim();
    const productKey = String(body.productKey ?? "").trim().toLowerCase();
    const publicId = imageUrl
      ? extractPublicIdFromCloudinaryUrl(imageUrl)
      : productKey
        ? `${assetFolder}/${productKey}`
        : null;

    if (!publicId) {
      return NextResponse.json({ result: "skipped" });
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = buildSignature(
      {
        public_id: publicId,
        timestamp,
      },
      apiSecret
    );

    const cloudinaryFormData = new FormData();
    cloudinaryFormData.append("api_key", apiKey);
    cloudinaryFormData.append("public_id", publicId);
    cloudinaryFormData.append("signature", signature);
    cloudinaryFormData.append("timestamp", timestamp);

    const deleteResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        method: "POST",
        body: cloudinaryFormData,
      }
    );

    const deleteResult = (await deleteResponse.json()) as {
      error?: { message?: string };
      result?: string;
    };

    if (!deleteResponse.ok) {
      return NextResponse.json(
        {
          error: deleteResult.error?.message || "Cloudinary rejected the image deletion.",
        },
        { status: deleteResponse.status || 500 }
      );
    }

    return NextResponse.json({
      result: deleteResult.result ?? "ok",
      publicId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error deleting from Cloudinary.",
      },
      { status: 500 }
    );
  }
}
