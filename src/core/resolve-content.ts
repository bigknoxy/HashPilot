/**
 * Resolve a CLI content argument: `@path` reads the file, anything else is
 * taken literally.
 *
 * An explicit empty string is a deletion, not an omitted argument (#40), so
 * only `undefined` short-circuits.
 */
export async function resolveContent(val?: string): Promise<string | undefined> {
  if (val === undefined) return undefined;
  if (val.startsWith("@")) return await Bun.file(val.slice(1)).text();
  return val;
}
