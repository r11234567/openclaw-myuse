declare module "markdown-it-texmath" {
  import type MarkdownIt from "markdown-it";

  type TexmathOptions = {
    engine: unknown;
    delimiters?: "brackets" | "dollars" | "gitlab" | "julia" | "kramdown";
    katexOptions?: Record<string, unknown>;
  };

  const markdownItTexmath: MarkdownIt.PluginWithOptions<TexmathOptions>;
  export default markdownItTexmath;
}
