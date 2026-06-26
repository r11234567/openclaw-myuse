// Google PSE plugin module implements search client behavior.
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import {
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_SEARCH_COUNT,
  normalizeCacheKey,
  readCache,
  readResponseText,
  resolveCacheTtlMs,
  resolveSearchCount,
  resolveSiteName,
  resolveTimeoutSeconds,
  withSelfHostedWebSearchEndpoint,
  withTrustedWebSearchEndpoint,
  wrapWebContent,
  writeCache,
} from "openclaw/plugin-sdk/provider-web-search";
import {
  assertHttpUrlTargetsPrivateNetwork,
  isBlockedHostnameOrIp,
  isPrivateIpAddress,
  resolvePinnedHostnameWithPolicy,
  type LookupFn,
} from "openclaw/plugin-sdk/ssrf-runtime";
import {
  resolveGooglePseApiKey,
  resolveGooglePseBaseUrl,
  resolveGooglePseSearchEngineId,
  resolveSearxngBaseUrl,
  resolveSearxngCategories,
  resolveSearxngLanguage,
} from "./config.js";

const DEFAULT_TIMEOUT_SECONDS = 20;
const MAX_RESPONSE_BYTES = 1_000_000;
type EndpointMode = "selfHosted" | "strict";

const SEARCH_CACHE = new Map<
  string,
  { value: Record<string, unknown>; insertedAt: number; expiresAt: number }
>();

type SearchResult = {
  url: string;
  title: string;
  snippet?: string;
  imageUrl?: string;
};

type SearxngResponse = {
  results?: Array<{
    url?: unknown;
    title?: unknown;
    content?: unknown;
    img_src?: unknown;
  }>;
};

type GooglePseResponse = {
  items?: Array<{
    link?: unknown;
    title?: unknown;
    snippet?: unknown;
    pagemap?: { cse_thumbnail?: Array<{ src?: unknown }> };
  }>;
};

async function endpointTargetsPrivateNetwork(url: URL, lookupFn?: LookupFn): Promise<boolean> {
  if (isBlockedHostnameOrIp(url.hostname)) {
    return true;
  }
  try {
    const pinned = await resolvePinnedHostnameWithPolicy(url.hostname, {
      lookupFn,
      policy: {
        allowPrivateNetwork: true,
        allowRfc2544BenchmarkRange: true,
      },
    });
    return pinned.addresses.every((address) => isPrivateIpAddress(address));
  } catch {
    return false;
  }
}

async function validateSearxngBaseUrl(baseUrl: string, lookupFn?: LookupFn): Promise<EndpointMode> {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("SearXNG base URL must be a valid http:// or https:// URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("SearXNG base URL must use http:// or https://.");
  }

  if (parsed.protocol === "http:") {
    await assertHttpUrlTargetsPrivateNetwork(parsed.toString(), {
      dangerouslyAllowPrivateNetwork: true,
      lookupFn,
      errorMessage:
        "SearXNG HTTP base URL must target a trusted private or loopback host. Use https:// for public hosts.",
    });
    return "selfHosted";
  }

  return (await endpointTargetsPrivateNetwork(parsed, lookupFn)) ? "selfHosted" : "strict";
}

function buildSearxngSearchUrl(params: {
  baseUrl: string;
  query: string;
  categories?: string;
  language?: string;
}): string {
  const url = new URL(params.baseUrl);
  url.pathname = url.pathname.endsWith("/") ? `${url.pathname}search` : `${url.pathname}/search`;
  url.search = "";
  url.searchParams.set("q", params.query);
  url.searchParams.set("format", "json");
  if (params.categories) {
    url.searchParams.set("categories", params.categories);
  }
  if (params.language) {
    url.searchParams.set("language", params.language);
  }
  return url.toString();
}

function parseSearxngResponseText(text: string, count: number): SearchResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as SearxngResponse;
  } catch {
    throw new Error("SearXNG returned invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const rawResults = Array.isArray((parsed as SearxngResponse).results)
    ? (parsed as SearxngResponse).results
    : [];
  const results: SearchResult[] = [];
  for (const raw of rawResults) {
    if (typeof raw.url !== "string" || typeof raw.title !== "string") {
      continue;
    }
    results.push({
      url: raw.url,
      title: raw.title,
      snippet: typeof raw.content === "string" ? raw.content : undefined,
      imageUrl: typeof raw.img_src === "string" ? raw.img_src : undefined,
    });
    if (results.length >= count) {
      break;
    }
  }
  return results;
}

async function fetchSearxngResults(params: {
  baseUrl: string;
  query: string;
  categories?: string;
  language?: string;
  timeoutSeconds: number;
  count: number;
  endpointMode: EndpointMode;
}): Promise<SearchResult[]> {
  const url = buildSearxngSearchUrl(params);
  const withEndpoint =
    params.endpointMode === "selfHosted"
      ? withSelfHostedWebSearchEndpoint
      : withTrustedWebSearchEndpoint;
  return await withEndpoint(
    {
      url,
      timeoutSeconds: params.timeoutSeconds,
      init: {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    },
    async (response) => {
      if (!response.ok) {
        const detail = (await readResponseText(response, { maxBytes: 64_000 })).text;
        throw new Error(
          `SearXNG search error (${response.status}): ${detail || response.statusText}`,
        );
      }
      const body = await readResponseText(response, { maxBytes: MAX_RESPONSE_BYTES });
      if (body.truncated) {
        throw new Error("SearXNG response too large.");
      }
      return parseSearxngResponseText(body.text, params.count);
    },
  );
}

function buildGooglePseSearchUrl(params: {
  baseUrl: string;
  apiKey: string;
  searchEngineId: string;
  query: string;
  count: number;
}): string {
  const url = new URL(params.baseUrl);
  url.searchParams.set("key", params.apiKey);
  url.searchParams.set("cx", params.searchEngineId);
  url.searchParams.set("q", params.query);
  url.searchParams.set("num", String(params.count));
  return url.toString();
}

function parseGooglePseResponseText(text: string, count: number): SearchResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as GooglePseResponse;
  } catch {
    throw new Error("Google PSE returned invalid JSON.");
  }
  const items = Array.isArray((parsed as GooglePseResponse)?.items)
    ? (parsed as GooglePseResponse).items
    : [];
  const results: SearchResult[] = [];
  for (const item of items) {
    if (typeof item.link !== "string" || typeof item.title !== "string") {
      continue;
    }
    const thumbnail = item.pagemap?.cse_thumbnail?.find(
      (candidate) => typeof candidate.src === "string",
    )?.src;
    results.push({
      url: item.link,
      title: item.title,
      snippet: typeof item.snippet === "string" ? item.snippet : undefined,
      imageUrl: typeof thumbnail === "string" ? thumbnail : undefined,
    });
    if (results.length >= count) {
      break;
    }
  }
  return results;
}

async function fetchGooglePseResults(params: {
  config?: OpenClawConfig;
  query: string;
  count: number;
  timeoutSeconds: number;
}): Promise<SearchResult[]> {
  const apiKey = resolveGooglePseApiKey(params.config);
  const searchEngineId = resolveGooglePseSearchEngineId(params.config);
  if (!apiKey) {
    throw new Error(
      "Google PSE API key is not configured. Set OPENCLAW_GOOGLE_PSE_SEARCH_API_KEY or plugins.entries.google-pse.config.webSearch.apiKey.",
    );
  }
  if (!searchEngineId) {
    throw new Error(
      "Google PSE search engine id is not configured. Set OPENCLAW_GOOGLE_PSE_SEARCH_ENGINE_ID or plugins.entries.google-pse.config.webSearch.searchEngineId.",
    );
  }
  const url = buildGooglePseSearchUrl({
    baseUrl: resolveGooglePseBaseUrl(params.config),
    apiKey,
    searchEngineId,
    query: params.query,
    count: params.count,
  });
  return await withTrustedWebSearchEndpoint(
    {
      url,
      timeoutSeconds: params.timeoutSeconds,
      init: {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    },
    async (response) => {
      if (!response.ok) {
        const detail = (await readResponseText(response, { maxBytes: 64_000 })).text;
        throw new Error(
          `Google PSE search error (${response.status}): ${detail || response.statusText}`,
        );
      }
      const body = await readResponseText(response, { maxBytes: MAX_RESPONSE_BYTES });
      if (body.truncated) {
        throw new Error("Google PSE response too large.");
      }
      return parseGooglePseResponseText(body.text, params.count);
    },
  );
}

function buildPayload(params: {
  query: string;
  provider: string;
  results: SearchResult[];
  tookMs: number;
  fallbackReason?: string;
}): Record<string, unknown> {
  return {
    query: params.query,
    provider: params.provider,
    count: params.results.length,
    tookMs: params.tookMs,
    ...(params.fallbackReason ? { fallbackReason: params.fallbackReason } : {}),
    externalContent: {
      untrusted: true,
      source: "web_search",
      provider: params.provider,
      wrapped: true,
    },
    results: params.results.map((result) => ({
      title: wrapWebContent(result.title, "web_search"),
      url: result.url,
      snippet: result.snippet ? wrapWebContent(result.snippet, "web_search") : "",
      siteName: resolveSiteName(result.url) || undefined,
      img_src: result.imageUrl || undefined,
    })),
  };
}

export async function runGooglePseSearch(params: {
  config?: OpenClawConfig;
  query: string;
  count?: number;
  timeoutSeconds?: number;
  cacheTtlMinutes?: number;
}): Promise<Record<string, unknown>> {
  const count = resolveSearchCount(params.count, DEFAULT_SEARCH_COUNT);
  const timeoutSeconds = resolveTimeoutSeconds(params.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS);
  const cacheTtlMs = resolveCacheTtlMs(params.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);
  const cacheKey = normalizeCacheKey(
    JSON.stringify({ provider: "google-pse", query: params.query, count }),
  );
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }
  const startedAt = Date.now();
  const results = await fetchGooglePseResults({
    config: params.config,
    query: params.query,
    count,
    timeoutSeconds,
  });
  const payload = buildPayload({
    query: params.query,
    provider: "google-pse",
    results,
    tookMs: Date.now() - startedAt,
  });
  writeCache(SEARCH_CACHE, cacheKey, payload, cacheTtlMs);
  return payload;
}

export async function runSearxngThenGooglePseSearch(params: {
  config?: OpenClawConfig;
  query: string;
  count?: number;
  timeoutSeconds?: number;
  cacheTtlMinutes?: number;
}): Promise<Record<string, unknown>> {
  const count = resolveSearchCount(params.count, DEFAULT_SEARCH_COUNT);
  const timeoutSeconds = resolveTimeoutSeconds(params.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS);
  const cacheTtlMs = resolveCacheTtlMs(params.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES);
  const baseUrl = resolveSearxngBaseUrl(params.config);
  const cacheKey = normalizeCacheKey(
    JSON.stringify({ provider: "searxng-google-pse", query: params.query, count, baseUrl }),
  );
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  const startedAt = Date.now();
  let fallbackReason: string | undefined;
  if (baseUrl) {
    try {
      const results = await fetchSearxngResults({
        baseUrl,
        query: params.query,
        categories: resolveSearxngCategories(params.config),
        language: resolveSearxngLanguage(params.config),
        timeoutSeconds,
        count,
        endpointMode: await validateSearxngBaseUrl(baseUrl),
      });
      const payload = buildPayload({
        query: params.query,
        provider: "searxng",
        results,
        tookMs: Date.now() - startedAt,
      });
      writeCache(SEARCH_CACHE, cacheKey, payload, cacheTtlMs);
      return payload;
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : String(error);
    }
  } else {
    fallbackReason = "SearXNG base URL is not configured.";
  }

  const results = await fetchGooglePseResults({
    config: params.config,
    query: params.query,
    count,
    timeoutSeconds,
  });
  const payload = buildPayload({
    query: params.query,
    provider: "google-pse",
    results,
    tookMs: Date.now() - startedAt,
    fallbackReason,
  });
  writeCache(SEARCH_CACHE, cacheKey, payload, cacheTtlMs);
  return payload;
}

export const testing = {
  buildGooglePseSearchUrl,
  parseGooglePseResponseText,
  buildSearxngSearchUrl,
  parseSearxngResponseText,
  SEARCH_CACHE,
};
export { testing as __testing };
