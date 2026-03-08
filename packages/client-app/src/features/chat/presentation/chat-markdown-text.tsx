import { useEffect, useId, useState } from "react";
import { makeMarkdownText } from "@assistant-ui/react-ui";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import { Prism as ReactSyntaxHighlighter } from "react-syntax-highlighter";
import remarkGfm from "remark-gfm";

let mermaidInitialized = false;

function CodeSyntaxHighlighter({ code, language }: SyntaxHighlighterProps) {
  const normalizedLanguage = language && language !== "unknown" ? language : "text";

  return (
    <ReactSyntaxHighlighter
      customStyle={{
        margin: 0,
        borderRadius: 0,
        background: "transparent",
        padding: "0.75rem 0.9rem"
      }}
      language={normalizedLanguage}
      PreTag="div"
      wrapLongLines
    >
      {code}
    </ReactSyntaxHighlighter>
  );
}

function MermaidSyntaxHighlighter({ code, components }: SyntaxHighlighterProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const rawId = useId();
  const chartId = rawId.replace(/[^a-zA-Z0-9_-]/g, "");

  useEffect(() => {
    let cancelled = false;

    setSvg(null);
    setRenderError(null);

    const renderMermaid = async () => {
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;

        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "neutral"
          });
          mermaidInitialized = true;
        }

        const { svg: nextSvg } = await mermaid.render(`compass-${chartId}`, code);
        if (cancelled) {
          return;
        }

        setSvg(nextSvg);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRenderError(
          error instanceof Error ? error.message : "Unable to render mermaid diagram."
        );
      }
    };

    void renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [chartId, code]);

  if (svg) {
    return <div className="aui-md-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
  }

  const Pre = components.Pre;
  const Code = components.Code;

  return (
    <div className="aui-md-mermaid-fallback">
      {renderError ? <p className="aui-md-mermaid-error">{renderError}</p> : null}
      <Pre>
        <Code className="language-mermaid">{code}</Code>
      </Pre>
    </div>
  );
}

export const ChatMarkdownText = makeMarkdownText({
  components: {
    SyntaxHighlighter: CodeSyntaxHighlighter
  },
  componentsByLanguage: {
    mermaid: {
      SyntaxHighlighter: MermaidSyntaxHighlighter
    }
  },
  remarkPlugins: [remarkGfm]
});
