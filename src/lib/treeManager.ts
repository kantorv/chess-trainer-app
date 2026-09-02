/**
 * A dependency-free port of the read side of `react-tree-manager`'s
 * `TreeManager` (the 0.13 contract — see github.com/kantorv/react-tree-manager).
 *
 * The published package is a single rolled-up bundle that inlines a whole copy
 * of MUI, emotion and xstate for its `TreeViewer` component, so pulling it in
 * costs ~37 KB gzip for a class this app only reads a few methods of. The class
 * is carried here instead.
 *
 * **This file is the seam.** Nothing else builds a tree walk by hand — the
 * sidebar goes through `src/views/main/navTree.ts`, which is the only consumer.
 * If the app ever needs the parts left out here (`add` / `delete` / `move`, or
 * the `TreeViewer` component), swap this file's internals for the real
 * dependency and keep the exports.
 */

export type TreeManagerOptions<N> = {
  /** How to read a node's children. Default: `node.children`. */
  getChildren?: (node: N) => readonly N[] | undefined | null;
  /** When `false`, callbacks skip the root nodes themselves. Default `true`. */
  includeRoot?: boolean;
};

/**
 * Read-only walks over a tree of `N`. Depth-first, parent before children,
 * siblings and roots in declaration order — the ordering `collectIds` /
 * `findBy` / `getPath` all depend on.
 */
export class TreeManager<N extends object> {
  // Declared and assigned rather than a constructor parameter property: this
  // project compiles with `erasableSyntaxOnly`, which rules that syntax out.
  private readonly tree: readonly N[];

  constructor(tree: readonly N[] = []) {
    this.tree = tree;
  }

  private childrenOf(node: N, options?: TreeManagerOptions<N>): readonly N[] {
    const read =
      options?.getChildren ??
      ((n: N) => (n as { children?: readonly N[] }).children);
    return read(node) ?? [];
  }

  /** Visit every node depth-first. `includeRoot: false` skips the roots. */
  traverse(callback: (node: N) => void, options?: TreeManagerOptions<N>): void {
    const includeRoot = options?.includeRoot ?? true;

    const walk = (node: N, fire: boolean) => {
      if (fire) callback(node);
      for (const child of this.childrenOf(node, options)) walk(child, true);
    };

    for (const root of this.tree) walk(root, includeRoot);
  }

  /** The tree flattened depth-first. */
  toArray(options?: TreeManagerOptions<N>): N[] {
    const out: N[] = [];
    this.traverse((node) => out.push(node), options);
    return out;
  }

  /** The value of `idKey` for every visited node, depth-first. */
  collectIds<K extends keyof N>(
    idKey: K,
    options?: TreeManagerOptions<N>,
  ): Array<N[K]> {
    const out: Array<N[K]> = [];
    this.traverse((node) => out.push(node[idKey]), options);
    return out;
  }

  /** The first node matching `predicate`, or `null`. */
  findBy(
    predicate: (node: N) => boolean,
    options?: TreeManagerOptions<N>,
  ): N | null {
    let found: N | null = null;
    this.traverse((node) => {
      if (found === null && predicate(node)) found = node;
    }, options);
    return found;
  }

  /**
   * The chain of nodes from a root down to the first match, inclusive at both
   * ends, or `null`. Useful for "which folder is this screen under".
   */
  getPath(
    predicate: (node: N) => boolean,
    options?: TreeManagerOptions<N>,
  ): N[] | null {
    let found: N[] | null = null;

    const walk = (node: N, ancestors: N[]): boolean => {
      const here = [...ancestors, node];
      if (predicate(node)) {
        found = here;
        return true;
      }
      for (const child of this.childrenOf(node, options)) {
        if (walk(child, here)) return true;
      }
      return false;
    };

    for (const root of this.tree) if (walk(root, [])) break;
    return found;
  }
}
