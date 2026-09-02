import { describe, expect, it } from "vitest";
import { TreeManager } from "./treeManager";

type Node = { id: string; children?: Node[] };

const tree: Node[] = [
  {
    id: "a",
    children: [{ id: "a1" }, { id: "a2", children: [{ id: "a2x" }] }],
  },
  { id: "b" },
];

describe("TreeManager", () => {
  it("traverses depth-first, parent before children, in declaration order", () => {
    const seen: string[] = [];
    new TreeManager(tree).traverse((n) => seen.push(n.id));
    expect(seen).toEqual(["a", "a1", "a2", "a2x", "b"]);
  });

  it("can skip the root nodes with includeRoot: false", () => {
    expect(new TreeManager(tree).collectIds("id", { includeRoot: false })).toEqual(
      ["a1", "a2", "a2x"],
    );
  });

  it("collects ids and flattens", () => {
    expect(new TreeManager(tree).collectIds("id")).toEqual([
      "a",
      "a1",
      "a2",
      "a2x",
      "b",
    ]);
    expect(new TreeManager(tree).toArray()).toHaveLength(5);
  });

  it("finds the first matching node, or null", () => {
    expect(new TreeManager(tree).findBy((n) => n.id === "a2x")?.id).toBe("a2x");
    expect(new TreeManager(tree).findBy((n) => n.id === "nope")).toBeNull();
  });

  it("returns the ancestor chain to a match, inclusive at both ends", () => {
    const path = new TreeManager(tree).getPath((n) => n.id === "a2x");
    expect(path?.map((n) => n.id)).toEqual(["a", "a2", "a2x"]);
    expect(new TreeManager(tree).getPath((n) => n.id === "nope")).toBeNull();
  });

  it("honours a custom getChildren", () => {
    type Kids = { name: string; kids?: Kids[] };
    const t: Kids[] = [{ name: "root", kids: [{ name: "leaf" }] }];
    expect(
      new TreeManager(t).collectIds("name", { getChildren: (n) => n.kids }),
    ).toEqual(["root", "leaf"]);
  });

  it("walks an empty tree without complaining", () => {
    expect(new TreeManager<Node>().toArray()).toEqual([]);
    expect(new TreeManager<Node>([]).getPath(() => true)).toBeNull();
  });
});
