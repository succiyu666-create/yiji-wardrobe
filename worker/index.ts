/** Cloudflare Worker entry point for THE LOOK BOOK. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  OPENAI_API_KEY?: string;
  AI_ACCESS_CODE?: string;
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

type AnalysisItem = {
  id: string;
  name: string;
  category: string;
  color: string;
  season: string;
  image: string;
};

type AnalysisRequest = {
  reference: {
    id: string;
    title: string;
    notes: string;
    image: string;
  };
  items: AnalysisItem[];
};

const MAX_REQUEST_BYTES = 9_000_000;
const MAX_REFERENCE_IMAGE_CHARS = 2_000_000;
const MAX_ITEM_IMAGE_CHARS = 400_000;
const MAX_ANALYSIS_ITEMS = 80;
const AI_RATE_WINDOW_MS = 10 * 60 * 1000;
const AI_RATE_LIMIT = 8;
const AI_ALLOWED_ORIGINS = new Set([
  "https://succiyu666-create.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
]);
const recentAiRequests = new Map<string, number[]>();

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          itemId: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          role: { type: "string" },
          reason: { type: "string" },
        },
        required: ["itemId", "score", "role", "reason"],
      },
    },
    missingPieces: {
      type: "array",
      items: { type: "string" },
    },
    stylingTips: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["summary", "matches", "missingPieces", "stylingTips"],
} as const;

function isImageDataUrl(value: unknown) {
  return (
    typeof value === "string" &&
    /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(value)
  );
}

function corsHeaders(request: Request) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
  const origin = request.headers.get("Origin");
  const requestOrigin = new URL(request.url).origin;
  if (origin && (origin === requestOrigin || AI_ALLOWED_ORIGINS.has(origin))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return headers;
}

function jsonResponse(
  request: Request,
  payload: Record<string, unknown>,
  status = 200,
) {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin || AI_ALLOWED_ORIGINS.has(origin);
}

function isRateLimited(request: Request) {
  const now = Date.now();
  const clientId =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "local";
  const recent = (recentAiRequests.get(clientId) ?? []).filter(
    (timestamp) => now - timestamp < AI_RATE_WINDOW_MS,
  );
  if (recent.length >= AI_RATE_LIMIT) {
    recentAiRequests.set(clientId, recent);
    return true;
  }
  recent.push(now);
  recentAiRequests.set(clientId, recent);
  return false;
}

function parseAnalysisRequest(payload: unknown): AnalysisRequest | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Partial<AnalysisRequest>;
  if (
    !value.reference ||
    typeof value.reference !== "object" ||
    !isImageDataUrl(value.reference.image) ||
    value.reference.image.length > MAX_REFERENCE_IMAGE_CHARS ||
    !Array.isArray(value.items) ||
    value.items.length === 0 ||
    value.items.length > MAX_ANALYSIS_ITEMS
  ) {
    return null;
  }

  const items = value.items.filter((item): item is AnalysisItem => {
    if (!item || typeof item !== "object") return false;
    return (
      typeof item.id === "string" &&
      item.id.length > 0 &&
      item.id.length <= 120 &&
      typeof item.name === "string" &&
      typeof item.category === "string" &&
      typeof item.color === "string" &&
      typeof item.season === "string" &&
      isImageDataUrl(item.image) &&
      item.image.length <= MAX_ITEM_IMAGE_CHARS
    );
  });
  if (items.length !== value.items.length) return null;

  return {
    reference: {
      id: String(value.reference.id || "").slice(0, 120),
      title: String(value.reference.title || "参考穿搭").slice(0, 160),
      notes: String(value.reference.notes || "").slice(0, 500),
      image: value.reference.image,
    },
    items,
  };
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

async function analyzeInspiration(request: Request, env: Env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: "仅支持 POST 请求" }, 405);
  }
  if (!isAllowedOrigin(request)) {
    return jsonResponse(request, { error: "当前来源不允许访问" }, 403);
  }
  if (!env.OPENAI_API_KEY || !env.AI_ACCESS_CODE) {
    return jsonResponse(request, { error: "AI 服务尚未完成配置" }, 503);
  }

  const providedAccessCode = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!providedAccessCode || providedAccessCode !== env.AI_ACCESS_CODE) {
    return jsonResponse(request, { error: "AI 通行码不正确" }, 401);
  }
  if (isRateLimited(request)) {
    return jsonResponse(request, { error: "分析次数有点频繁，请十分钟后再试" }, 429);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse(request, { error: "本次图片太多，请减少后重试" }, 413);
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return jsonResponse(request, { error: "无法读取本次图片" }, 400);
  }
  const payload = parseAnalysisRequest(rawPayload);
  if (!payload) {
    return jsonResponse(request, { error: "图片或单品信息不完整" }, 400);
  }

  const wardrobeContent: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: `参考穿搭：${payload.reference.title}${
        payload.reference.notes ? `。用户备注：${payload.reference.notes}` : ""
      }。先观察这张参考图的单品角色、轮廓、色彩和层次。`,
    },
    {
      type: "input_image",
      image_url: payload.reference.image,
      detail: "auto",
    },
    {
      type: "input_text",
      text: "下面依次是用户衣橱中的候选单品。每段文字后的图片只对应紧邻的单品 ID。",
    },
  ];

  payload.items.forEach((item) => {
    wardrobeContent.push(
      {
        type: "input_text",
        text: `单品 ID: ${item.id}\n名称: ${item.name}\n分类: ${item.category}\n颜色: ${
          item.color || "未填写"
        }\n季节: ${item.season || "未填写"}`,
      },
      {
        type: "input_image",
        image_url: item.image,
        detail: "low",
      },
    );
  });

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      store: false,
      safety_identifier: "the-look-book-owner",
      reasoning: { effort: "low" },
      max_output_tokens: 1400,
      input: [
        {
          role: "system",
          content:
            "你是私人衣橱造型师。根据参考穿搭，从用户真实衣橱照片中挑选最接近且能一起穿的单品。只允许返回给出的单品 ID，不得编造 ID。优先还原整体轮廓、色彩关系和层次，不必追求品牌或完全相同。挑选 2 到 8 件，避免互相冲突的重复角色。用简短自然的中文说明。",
        },
        { role: "user", content: wardrobeContent },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "wardrobe_inspiration_match",
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
    }),
  });

  const openAiPayload = (await openAiResponse.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!openAiResponse.ok) {
    const apiError = openAiPayload?.error as { code?: string } | undefined;
    const status = apiError?.code === "insufficient_quota" ? 402 : 502;
    const message =
      status === 402
        ? "OpenAI 账户暂时没有可用额度"
        : "AI 服务暂时没有响应，请稍后再试";
    return jsonResponse(request, { error: message }, status);
  }

  const outputText = extractOutputText(openAiPayload);
  if (!outputText) {
    return jsonResponse(request, { error: "AI 没有返回可用的搭配建议" }, 502);
  }

  try {
    const analysis = JSON.parse(outputText) as {
      summary: string;
      matches: Array<{ itemId: string; score: number; role: string; reason: string }>;
      missingPieces: string[];
      stylingTips: string[];
    };
    const knownIds = new Set(payload.items.map((item) => item.id));
    const seenIds = new Set<string>();
    const matches = analysis.matches
      .filter((match) => knownIds.has(match.itemId))
      .filter((match) => {
        if (seenIds.has(match.itemId)) return false;
        seenIds.add(match.itemId);
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    if (matches.length === 0) {
      return jsonResponse(request, { error: "没有找到足够相似的衣橱单品" }, 422);
    }
    return jsonResponse(request, {
      analysis: {
        summary: analysis.summary,
        matches,
        missingPieces: analysis.missingPieces.slice(0, 5),
        stylingTips: analysis.stylingTips.slice(0, 5),
      },
    });
  } catch {
    return jsonResponse(request, { error: "AI 返回的搭配结果无法读取" }, 502);
  }
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze-inspiration") {
      return analyzeInspiration(request, env ?? ({} as Env));
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
