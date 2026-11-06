import type { ElementContent, Root } from "hast";
import { isVideoURL } from "./media";

function isMedia(node: ElementContent) {
  if (node.type !== "element") return false;
  if (node.tagName === "img") return true;
  return (
    node.tagName === "a" &&
    ((node.children.length === 1 &&
      node.children[0].type === "element" &&
      node.children[0].tagName === "img") ||
      (typeof node.properties.href === "string" && isVideoURL(node.properties.href)))
  );
}

// Pasted Markdown often places prose and several screenshots in the same
// paragraph. Give each media item its own row without changing its neighbors.
export function readingMedia() {
  return (tree: Root) => {
    tree.children = tree.children.flatMap((node): Root["children"] => {
      if (node.type !== "element" || node.tagName !== "p" || !node.children.some(isMedia))
        return [node];
      const blocks: Root["children"] = [];
      let prose: ElementContent[] = [];
      const flush = () => {
        if (prose.some((child) => child.type !== "text" || child.value.trim()))
          blocks.push({ ...node, children: prose });
        prose = [];
      };
      for (const child of node.children) {
        if (!isMedia(child)) {
          prose.push(child);
          continue;
        }
        flush();
        blocks.push({ ...node, properties: { className: ["nl-prose-media"] }, children: [child] });
      }
      flush();
      return blocks;
    });
  };
}
