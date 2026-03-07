import { NextRequest, NextResponse } from "next/server";

interface GroqMessage {
  role: string;
  content: (
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  )[];
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { images } = body as { images: string[] };

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "At least one image is required" }, { status: 400 });
    }

    const imageCount = images.length;
    const promptSingle = `You are analyzing a phone image for a stock management system. This single image may contain IMEI numbers, the phone model name, specs, or any combination of these. Extract ALL information you can see.`;
    const promptMulti = `You are analyzing ${imageCount} phone images for a stock management system. The images may contain IMEI numbers, phone model name, specs, or any combination. Extract ALL information you can find across all images.`;

    const content: GroqMessage["content"] = [
      {
        type: "text",
        text: `${imageCount === 1 ? promptSingle : promptMulti}

Look for:
- IMEI numbers (exactly 15 digits, usually on a sticker, box, or settings screen)
- Phone brand (Samsung, Apple/iPhone, Xiaomi/Redmi/POCO, Motorola, etc.)
- Model name (e.g. "iPhone 16 Pro Max", "Galaxy S25 Ultra", "Redmi Note 13 Pro")
- RAM and storage capacity
- Color
- Network type (4G/5G)

Return ONLY valid JSON (no markdown, no backticks, no explanation):
{
  "imei1": "15-digit number or null",
  "imei2": "15-digit number or null",
  "brand": "Samsung/Apple/Xiaomi/etc or null",
  "model": "full model name or null",
  "ram_gb": number or null,
  "storage_gb": number or null,
  "color": "color name or null",
  "network": "4G or 5G or null",
  "condition": "new or used or null"
}

IMPORTANT: Only extract what you can clearly read. Use null for anything unclear or not visible. IMEI numbers are EXACTLY 15 digits — do not guess or truncate.`,
      },
    ];

    for (const img of images) {
      content.push({
        type: "image_url",
        image_url: { url: img },
      });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content }],
        temperature: 0.1,
        max_completion_tokens: 512,
        response_format: { type: "json_object" },
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq API error:", errText);
      return NextResponse.json(
        { error: "Groq API error: " + groqRes.status },
        { status: groqRes.status }
      );
    }

    const groqData = await groqRes.json();
    const rawText = groqData.choices?.[0]?.message?.content ?? "";

    try {
      const parsed = JSON.parse(rawText);
      return NextResponse.json(parsed);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json({ error: "Could not parse AI response", raw: rawText }, { status: 422 });
      }
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json(parsed);
    }
  } catch (err) {
    console.error("Vision API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
