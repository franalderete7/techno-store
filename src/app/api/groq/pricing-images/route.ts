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
    const body = (await req.json()) as { images?: unknown[] };
    const images = Array.isArray(body.images)
      ? body.images.filter((image: unknown): image is string => typeof image === "string" && image.length > 0)
      : [];

    if (images.length === 0) {
      return NextResponse.json({ error: "At least one image is required" }, { status: 400 });
    }

    const content: GroqMessage["content"] = [
      {
        type: "text",
        text: `You are extracting product pricing rows from screenshots for an electronics store admin.

Each image may contain a price list, chat screenshot, catalog image, or spreadsheet-like list with product names, product keys, and sell prices.

Return ONLY valid JSON with this shape:
{
  "rows": [
    {
      "product_key": "string or null",
      "product_name": "string or null",
      "price_ars": number or null,
      "price_usd": number or null,
      "promo_price_ars": number or null
    }
  ]
}

Rules:
- Extract one row per visible product/offer.
- Prefer exact product_key if clearly visible.
- Otherwise fill product_name with the most complete visible model name.
- Use price_ars for regular ARS sell price.
- Use promo_price_ars only if a promotional/discounted ARS price is clearly shown.
- Use price_usd only if a USD price is clearly shown.
- Ignore financing/cuotas amounts unless they are the main sell price.
- Ignore stock counts, IMEIs, costs, and unrelated text.
- If a field is not clear, use null.
- Do not invent products or prices.
- No markdown, no explanation, only JSON.`,
      },
    ];

    images.forEach((image: string) => {
      content.push({
        type: "image_url",
        image_url: { url: image },
      });
    });

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
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq pricing image API error:", errText);
      return NextResponse.json(
        { error: "Groq API error: " + groqRes.status },
        { status: groqRes.status }
      );
    }

    const groqData = await groqRes.json();
    const rawText = groqData.choices?.[0]?.message?.content ?? "";

    try {
      return NextResponse.json(JSON.parse(rawText));
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: "Could not parse AI response", raw: rawText },
          { status: 422 }
        );
      }
      return NextResponse.json(JSON.parse(jsonMatch[0]));
    }
  } catch (error) {
    console.error("Pricing images API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
