import { useLayoutEffect, useMemo, useRef } from "react";

type Props = { value: string; onChange: (v: string) => void };

/** How near its end, in px, a text scrolled is taken to be at it. */
const AT_END_PX = 8;

/**
 * A text to read and edit, its lines numbered. One that grows at its end -
 * a job's log, as it runs - keeps its last lines in view, unless it was
 * scrolled up from them.
 */
export default function TextEditor({ value, onChange }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);
  const atEnd = useRef(true);
  const was = useRef(value);
  useLayoutEffect(() => {
    const ta = taRef.current;
    const grew = value.length > was.current.length && value.startsWith(was.current);
    was.current = value;
    if (ta && grew && atEnd.current) {
      ta.scrollTop = ta.scrollHeight;
      if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    }
  }, [value]);

  const lineCount = useMemo(
    () => (value.length ? value.split("\n").length : 1),
    [value]
  );

  return (
    <div className="flex w-full h-full font-mono text-sm leading-5">
      <pre
        ref={gutterRef}
        className="bg-gh-base text-gh-gray text-right select-none overflow-hidden pr-2 w-11"
      >
        {Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}
      </pre>
      <textarea
        ref={taRef}
        className="flex-1 h-full px-5 outline-none resize-none overflow-auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Text as typed: no curly quotes, corrections or capitals from the
        // system.
        autoCorrect="off"
        autoCapitalize="off"
        onScroll={(e) => {
          const ta = e.target as HTMLTextAreaElement;
          atEnd.current = ta.scrollTop + ta.clientHeight >= ta.scrollHeight - AT_END_PX;
          if (gutterRef.current) {
            gutterRef.current.scrollTop = ta.scrollTop;
          }
        }}
        spellCheck={false}
        wrap="off"
      />
    </div>
  );
}
