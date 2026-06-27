import { useEffect, useRef } from "react";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";

interface Props {
  code: string;
  language?: string;
  className?: string;
}

export default function SyntaxHighlight({ code, language, className = "" }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current) {
      hljs.highlightElement(ref.current);
    }
  }, [code, language]);

  const lang = language && language !== "plaintext" ? language : undefined;

  return (
    <pre className={`overflow-auto text-sm leading-relaxed ${className}`}>
      <code ref={ref} className={lang ? `language-${lang}` : ""}>
        {code}
      </code>
    </pre>
  );
}
