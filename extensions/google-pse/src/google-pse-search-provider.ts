// Google PSE provider module implements model/runtime integration.
import { readPositiveIntegerParam, readStringParam } from "openclaw/plugin-sdk/param-readers";
import {
  createWebSearchProviderContractFields,
  type WebSearchProviderPlugin,
} from "openclaw/plugin-sdk/provider-web-search-contract";

const GOOGLE_PSE_CREDENTIAL_PATH = "plugins.entries.google-pse.config.webSearch.apiKey";

type GooglePseClientModule = typeof import("./google-pse-client.js");

let googlePseClientModulePromise: Promise<GooglePseClientModule> | undefined;

function loadGooglePseClientModule(): Promise<GooglePseClientModule> {
  googlePseClientModulePromise ??= import("./google-pse-client.js");
  return googlePseClientModulePromise;
}

const SearchSchema = {
  type: "object",
  properties: {
    query: { type: "string", description: "Search query string." },
    count: {
      type: "integer",
      description: "Number of results to return (1-10).",
      minimum: 1,
      maximum: 10,
    },
  },
  additionalProperties: false,
} satisfies Record<string, unknown>;

export function createGooglePseWebSearchProvider(): WebSearchProviderPlugin {
  return {
    id: "google-pse",
    label: "Google PSE Search",
    hint: "Google Programmable Search Engine Custom Search JSON API",
    onboardingScopes: ["text-inference"],
    requiresCredential: true,
    credentialLabel: "Google PSE API Key",
    envVars: ["OPENCLAW_GOOGLE_PSE_SEARCH_API_KEY", "OPENCLAW_GOOGLE_PSE_SEARCH_ENGINE_ID"],
    placeholder: "AIza...",
    signupUrl: "https://programmablesearchengine.google.com/",
    autoDetectOrder: 210,
    credentialPath: GOOGLE_PSE_CREDENTIAL_PATH,
    ...createWebSearchProviderContractFields({
      credentialPath: GOOGLE_PSE_CREDENTIAL_PATH,
      searchCredential: { type: "scoped", scopeId: "google-pse" },
      configuredCredential: { pluginId: "google-pse", field: "apiKey" },
      selectionPluginId: "google-pse",
    }),
    createTool: (ctx) => ({
      description:
        "Search the web using Google Programmable Search Engine. Returns titles, URLs, and snippets.",
      parameters: SearchSchema,
      execute: async (args) => {
        const { runGooglePseSearch } = await loadGooglePseClientModule();
        return await runGooglePseSearch({
          config: ctx.config,
          query: readStringParam(args, "query", { required: true }),
          count: readPositiveIntegerParam(args, "count", {
            max: 10,
            message: "count must be an integer from 1 to 10.",
          }),
        });
      },
    }),
  };
}

export function createSearxngGooglePseWebSearchProvider(): WebSearchProviderPlugin {
  return {
    id: "searxng-google-pse",
    label: "SearXNG with Google PSE fallback",
    hint: "Self-hosted SearXNG first; Google PSE only when SearXNG is unreachable",
    onboardingScopes: ["text-inference"],
    requiresCredential: true,
    credentialLabel: "Google PSE API Key",
    envVars: ["SEARXNG_BASE_URL", "OPENCLAW_GOOGLE_PSE_SEARCH_API_KEY"],
    placeholder: "http://searxng:8080 + AIza...",
    signupUrl: "https://programmablesearchengine.google.com/",
    autoDetectOrder: 205,
    credentialPath: GOOGLE_PSE_CREDENTIAL_PATH,
    ...createWebSearchProviderContractFields({
      credentialPath: GOOGLE_PSE_CREDENTIAL_PATH,
      searchCredential: { type: "scoped", scopeId: "google-pse" },
      configuredCredential: { pluginId: "google-pse", field: "apiKey" },
      selectionPluginId: "google-pse",
    }),
    createTool: (ctx) => ({
      description:
        "Search the web using SearXNG first. Falls back to Google PSE only if SearXNG cannot be reached or returns an HTTP error.",
      parameters: SearchSchema,
      execute: async (args) => {
        const { runSearxngThenGooglePseSearch } = await loadGooglePseClientModule();
        return await runSearxngThenGooglePseSearch({
          config: ctx.config,
          query: readStringParam(args, "query", { required: true }),
          count: readPositiveIntegerParam(args, "count", {
            max: 10,
            message: "count must be an integer from 1 to 10.",
          }),
        });
      },
    }),
  };
}
