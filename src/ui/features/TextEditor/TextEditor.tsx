import { useMemo, useRef } from "react";

type Props = { value: string; onChange: (v: string) => void };

export default function TextEditor({ value, onChange }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);

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
        onScroll={(e) => {
          if (gutterRef.current) {
            gutterRef.current.scrollTop = (
              e.target as HTMLTextAreaElement
            ).scrollTop;
          }
        }}
        spellCheck={false}
        wrap="off"
      />
    </div>
  );
}
