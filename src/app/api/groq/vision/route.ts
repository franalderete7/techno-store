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
    const { imeiImage, specsImage } = body as {
      imeiImage?: string;
      specsImage?: string;
    };

    if (!imeiImage && !specsImage) {
      return NextResponse.json({ error: "At least one image is required" }, { status: 400 });
    }

    const content: GroqMessage["content"] = [
      {
        type: "text",
        text: `You are analyzing phone images for a stock management system. Extract the following information and return ONLY valid JSON (no markdown, no backticks, no explanation).

From the IMEI image (first image if provided): extract the 15-digit IMEI numbers.
From the specs/model image (second image if provided): extract the phone brand, model, RAM, storage, color, and network type.

Return this exact JSON structure:
{
  "imei1": "15-digit number or null",
  "imei2": "15-digit number or null",
  "brand": "Samsung/Apple/Xiaomi/etc or null",
  "model": "full model name like 'iPhone 16 Pro Max' or 'Samsung Galaxy S25 Ultra' or null",
  "ram_gb": number or null,
  "storage_gb": number or null,
  "color": "color name or null",
  "network": "4G or 5G or null",
  "condition": "new or used or null"
}

IMPORTANT: Only extract what you can clearly see. Use null for anything unclear. IMEI numbers are exactly 15 digits.`,
      },
    ];

    if (imeiImage) {
      content.push({
        type: "image_url",
        image_url: { url: imeiImage },
      });
    }

    if (specsImage) {
      content.push({
        type: "image_url",
        image_url: { url: specsImage },
      });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.2-90b-vision-preview",
        messages: [{ role: "user", content }],
        temperature: 0.1,
        max_tokens: 512,
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

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse AI response", raw: rawText }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Vision API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
