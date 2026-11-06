const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300"
    }
  });
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0)
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
    value.startsWith("2001:db8") ||
    value.startsWith("::ffff:")
  );
}

async function validateHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();

  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".test") ||
    host.endsWith(".invalid")
  ) {
    throw new Error("This website cannot be previewed.");
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIPv4(host)) {
      throw new Error("Private network addresses are not allowed.");
    }

    throw new Error("Direct IP addresses are not supported.");
  }

  if (host.includes(":")) {
    throw new Error("Direct IP addresses are not supported.");
  }

  const [ipv4, ipv6] = await Promise.all([
    Deno.resolveDns(host, "A").catch(() => [] as string[]),
    Deno.resolveDns(host, "AAAA").catch(() => [] as string[])
  ]);

  const addresses = [...ipv4, ...ipv6];

  if (!addresses.length) {
    throw new Error("The website could not be resolved.");
  }

  if (
    addresses.some(ip =>
      ip.includes(":")
        ? isPrivateIPv6(ip)
        : isPrivateIPv4(ip)
    )
  ) {
    throw new Error("This website cannot be previewed.");
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .trim();
}

function getMeta(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]);
  }

  return "";
}

function getTitle(html: string): string {
  const og = getMeta(html, "og:title");
  if (og) return og;

  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, "")) : "";
}

function getDescription(html: string): string {
  return (
    getMeta(html, "og:description") ||
    getMeta(html, "description") ||
    getMeta(html, "twitter:description")
  );
}

function getImage(html: string): string {
  return (
    getMeta(html, "og:image") ||
    getMeta(html, "twitter:image")
  );
}

function safeImageUrl(value: string, base: URL): string {
  if (!value) return "";

  try {
    const image = new URL(value, base);

    if (!["http:", "https:"].includes(image.protocol)) return "";
    if (image.username || image.password) return "";

    return image.href;
  } catch {
    return "";
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const body = await request.json();
    const submitted = typeof body?.url === "string" ? body.url : "";

    if (!submitted || submitted.length > 2048) {
      return json({ error: "A valid URL is required." }, 400);
    }

    let target = new URL(submitted);

    if (
      !["http:", "https:"].includes(target.protocol) ||
      target.username ||
      target.password
    ) {
      return json({ error: "Only public HTTP and HTTPS links are supported." }, 400);
    }

    let response: Response | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      await validateHost(target.hostname);

      response = await fetch(target.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "GroveLinkPreview/1.0",
          "Accept": "text/html,application/xhtml+xml"
        }
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");

        if (!location) break;

        target = new URL(location, target);
        continue;
      }

      break;
    }

    if (!response || !response.ok) {
      return json({ error: "This website did not provide a preview." }, 422);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return json({ error: "This link does not point to a web page." }, 422);
    }

    const reader = response.body?.getReader();

    if (!reader) {
      return json({ error: "The website returned no page content." }, 422);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.length;

      if (total > 1024 * 1024) {
        await reader.cancel();
        return json({ error: "The page is too large to preview." }, 422);
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    const html = new TextDecoder().decode(bytes);

    const title = getTitle(html).slice(0, 180);
    const description = getDescription(html).slice(0, 320);
    const image = safeImageUrl(getImage(html), target);

    if (!title && !description && !image) {
      return json({ error: "No preview information was found." }, 422);
    }

    return json({
      url: target.href,
      title: title || target.hostname,
      description,
      image,
      domain: target.hostname
    });

  } catch (error) {
    console.warn("Link preview unavailable:", error);

    return json({
      error: "A preview is unavailable for this link."
    }, 422);
  }
});
