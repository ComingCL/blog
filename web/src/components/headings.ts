import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { Root, RootContent } from "mdast";

// Parse the same Markdown dialect as the article, excluding code blocks and
// retaining formatted/setext headings in their rendered order.
export function articleHeadings(markdown: string): string[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const headings: string[] = [];
  function walk(node: Root | RootContent) {
    if (node.type === "heading" && node.depth === 2) headings.push(toString(node));
    if ("children" in node) node.children.forEach(walk);
  }
  walk(tree);
  return headings;
}
