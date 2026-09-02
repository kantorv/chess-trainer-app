#!/usr/bin/env python3
"""Convert a vendored react-chessboard .mdx doc into a clean .md rules file.

Strips Storybook scaffolding (imports, <Meta>, <DocNavigation>), rewrites
<Canvas of={XStories.Y} /> into a link at the vendored story source, and
unwraps <WarningMessage>/<HintMessage> into markdown callouts.
"""
import re
import sys

VENDOR = "../../docs/vendor/react-chessboard"


def convert(src_path, out_path, header):
    text = open(src_path, encoding="utf-8").read()

    # 1. Build alias -> story path map from the import lines, before stripping them.
    aliases = dict(
        re.findall(
            r"^import \* as (\w+) from '\./(stories/[^']+)\.stories';$",
            text,
            re.M,
        )
    )

    # 2. <Canvas of={AliasStories.Name} />  ->  pointer at the vendored source.
    def canvas(m):
        alias = m.group(1)
        path = aliases.get(alias)
        if not path:
            return ""
        return f"> Live example: [`{path}.stories.tsx`]({VENDOR}/{path}.stories.tsx)"

    text = re.sub(r"^<Canvas of=\{(\w+)\.\w+\} />$", canvas, text, flags=re.M)

    # 3. Drop the import block and <Meta ... />.
    text = re.sub(r"^import .*?;\s*$", "", text, flags=re.M)
    text = re.sub(r"^<Meta [^>]*/>\s*$", "", text, flags=re.M)

    # 4. Unwrap callout components, keeping their prose.
    text = re.sub(r"^<WarningMessage>\s*$", "> **⚠️ Warning**", text, flags=re.M)
    text = re.sub(r"^<HintMessage>\s*$", "> **💡 Hint**", text, flags=re.M)
    text = re.sub(r"^</(?:Warning|Hint)Message>\s*$", "", text, flags=re.M)

    # 4b. Flatten leftover inline JSX inside those callouts (<p>, <strong>, {' '})
    #     so the prose survives as plain markdown instead of raw tags.
    def flatten_callout(m):
        body = m.group(0)
        body = re.sub(r"\{'\s*'\}", " ", body)
        body = re.sub(r"</?(?:p|strong|em|br|span|div)\s*/?>", "", body)
        lines = [ln.strip() for ln in body.split("\n")]
        out, para = [], []
        for ln in lines:
            if ln.startswith(">") or not ln:
                if para:
                    out.append("> " + " ".join(para))
                    para = []
                if ln.startswith(">"):
                    out.append(ln)
            else:
                para.append(ln)
        if para:
            out.append("> " + " ".join(para))
        return "\n>\n".join(x for x in out if x.strip() != ">") + "\n"

    text = re.sub(r"^> \*\*(?:⚠️|💡).*?\n(?:(?!\n\n|^#).*\n)*", flatten_callout, text, flags=re.M)

    # 5. Drop the trailing "Continue reading" nav block.
    text = re.sub(r"\n#+ Continue reading\s*\n+<DocNavigation[\s\S]*$", "\n", text)
    text = re.sub(r"\n<DocNavigation[\s\S]*?/>\s*$", "\n", text)

    # 6. Collapse the blank-line debris left behind.
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    open(out_path, "w", encoding="utf-8").write(header + text + "\n")
    print(f"{out_path}: {len(text)} B (~{len(text)//4} tok)")


HDR = """<!-- VENDORED UPSTREAM REFERENCE — do not hand-edit.
     Source: react-chessboard@5.12.1 docs/{src}
     Regenerate per docs/vendor/react-chessboard/README.md.
     Project conventions live in .claude/rules/chessboard.md and win on conflict. -->

"""

if __name__ == "__main__":
    src, out, name = sys.argv[1], sys.argv[2], sys.argv[3]
    convert(src, out, HDR.format(src=name))
