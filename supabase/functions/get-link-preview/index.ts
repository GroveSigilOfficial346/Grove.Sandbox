const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_HTML_BYTES = 1_000_000;
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 8_000;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    );
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) return true;

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const value = ip.toLowerCase().split("%")[0];

  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff") ||
    value.startsWith("::ffff:")
  );
}

function isIPAddress(host: string): boolean {
  return (
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
    host.includes(":")
  );
}

async function validateHost(host: string): Promise<boolean> {
  const normalized = host.toLowerCase().replace(/\.$/, "");

  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".invalid")
  ) return false;

  if (isIPAddress(normalized)) {
    return normalized.includes(":")
      ? !isPrivateIPv6(normalized)
      : !isPrivateIPv4(normalized);
  }

  // Check DNS answers before making the request.
  // This is an additional safeguard, not a complete DNS-rebinding defense.
  try {
    const records = await Promise.allSettled([
      Deno.resolveDns(normalized, "A"),
      Deno.resolveDns(normalized, "AAAA"),
    ]);

    const addresses = records.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );

    if (addresses.length === 0) return false;

    for (const address of addresses) {
      if (
        address.includes(":")
          ? isPrivateIPv6(address)
          : isPrivateIPv4(address)
      ) return false;
    }

    return true;
  } catch {
    return false;
  }
}

function safeHttpUrl(raw: string, base?: string): URL | null {
  try {
    const url = base ? new URL(raw, base) : new URL(raw);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) return null;

    return url;
  } catch {
    return null;
  }
}

async function fetchPage(initialUrl: URL): Promise<{
  html: string;
  finalUrl: string;
}> {
  let currentUrl = initialUrl;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (!(await validateHost(currentUrl.hostname))) {
      throw new Error("URL host is not allowed.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS
    );

    let response: Response;

    try {
      response = await fetch(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "GroveLinkPreview/1.0",
          "Accept": "text/html,application/xhtml+xml",
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();

        if (!location || redirects === MAX_REDIRECTS) {
          throw new Error("Too many redirects.");
        }

        const nextUrl = safeHttpUrl(location, currentUrl.toString());

        if (!nextUrl) throw new Error("Invalid redirect URL.");

        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Website could not be fetched.");
      }

      const contentType = response.headers.get("content-type") || "";

      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        await response.body?.cancel();
        throw new Error("Website did not return HTML.");
      }

      const declaredLength = Number(
        response.headers.get("content-length") || 0
      );

      if (declaredLength > MAX_HTML_BYTES) {
        await response.body?.cancel();
        throw new Error("Website response is too large.");
      }

      if (!response.body) throw new Error("Empty website response.");

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          totalBytes += value.byteLength;

          if (totalBytes > MAX_HTML_BYTES) {
            await reader.cancel();
            throw new Error("Website response is too large.");
          }

          chunks.push(value);
        }
      } finally {
        clearTimeout(timeout);
        reader.releaseLock();
      }

      const combined = new Uint8Array(totalBytes);
      let offset = 0;

      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return {
        html: new TextDecoder().decode(combined),
        finalUrl: currentUrl.toString(),
      };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  throw new Error("Too many redirects.");
}

function getMeta(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const attributes: Record<string, string> = {};

    const pattern =
      /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

    let match: RegExpExecArray | null;

    while ((match = pattern.exec(tag)) !== null) {
      attributes[match[1].toLowerCase()] =
        match[2] ?? match[3] ?? match[4] ?? "";
    }

    const property = (
      attributes.property || attributes.name || ""
    ).toLowerCase();

    if (property === key.toLowerCase()) {
      return decodeEntities(attributes.content || "").trim() || null;
    }
  }

  return null;
}

function getTitle(html: string): string | null {
  const ogTitle = getMeta(html, "og:title");
  if (ogTitle) return ogTitle;

  const twitterTitle = getMeta(html, "twitter:title");
  if (twitterTitle) return twitterTitle;

  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);

  return match
    ? decodeEntities(match[1].replace(/<[^>]*>/g, "")).trim()
    : null;
}

function cleanText(value: string | null, max = 300): string | null {
  if (!value) return null;

  return value
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || null;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body = await request.json();
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";

    if (!rawUrl || rawUrl.length > 2048) {
      return jsonResponse({ error: "A valid URL is required." }, 400);
    }

    const url = safeHttpUrl(rawUrl);

    if (!url) {
      return jsonResponse({ error: "Invalid website URL." }, 400);
    }

    const { html, finalUrl } = await fetchPage(url);

    const image =
      getMeta(html, "og:image") ||
      getMeta(html, "twitter:image");

    const safeImage = image
      ? safeHttpUrl(image, finalUrl)
      : null;

    const result = {
      url: finalUrl,
      domain: getDomain(finalUrl),
      title: cleanText(getTitle(html), 180),
      description: cleanText(
        getMeta(html, "og:description") ||
        getMeta(html, "description") ||
        getMeta(html, "twitter:description"),
        300
      ),
      image: safeImage?.toString() || null,
    };

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Preview unavailable.";

    return jsonResponse({ error: message }, 400);
  }
});
