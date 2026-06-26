// Google PSE plugin entrypoint registers web-search providers.
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  createGooglePseWebSearchProvider,
  createSearxngGooglePseWebSearchProvider,
} from "./src/google-pse-search-provider.js";

export default definePluginEntry({
  id: "google-pse",
  name: "Google PSE Plugin",
  description: "Bundled Google Programmable Search Engine web search plugin",
  register(api) {
    api.registerWebSearchProvider(createGooglePseWebSearchProvider());
    api.registerWebSearchProvider(createSearxngGooglePseWebSearchProvider());
  },
});
