declare module "markdown-it-texmath" {
  import type MarkdownIt from "markdown-it";

  interface TexmathOptions {
    engine?: { renderToString(tex: string, options?: Record<string, unknown>): string };
    delimiters?: string | string[];
    outerSpace?: boolean;
    katexOptions?: Record<string, unknown>;
    macros?: Record<string, string>;
  }

  const plugin: (md: MarkdownIt, options?: TexmathOptions) => void;
  export default plugin;
}
