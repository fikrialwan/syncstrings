export type FigmaVariablesExport = {
  collections: Array<{
    name: string;
    modes: string[];
    variables: Record<string, unknown>;
  }>;
};

type LocaleMap = Record<string, string>;

function getFilenameFromMode(mode: string): string {
  return mode.replace(/[^a-zA-Z]/g, "");
}


function buildLocaleMap(modes: string[]): LocaleMap {
  const localeMap: LocaleMap = {};
  for (const mode of modes) {
    const filename = getFilenameFromMode(mode);
    localeMap[mode] = filename;
  }
  return localeMap;
}

function toCamelCase(key: string): string {
  return key
    .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ""))
    .replace(/^(.)/, (char) => char.toLowerCase())
    .replace(/[^\w]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1$2")
    .split(/(?=[A-Z])/)
    .join("")
    .replace(/([a-z])([A-Z])/g, "$1$2")
    .replace(/^([A-Z])/, (char) => char.toLowerCase());
}

interface ParsedVariable {
  key: string;
  value: string;
}

function traverseVariables(
  obj: Record<string, unknown>,
  prefix: string[] = []
): ParsedVariable[] {
  const result: ParsedVariable[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = [...prefix, key];

    if (
      value &&
      typeof value === "object" &&
      "type" in (value as Record<string, unknown>) &&
      "values" in (value as Record<string, unknown>)
    ) {
      const node = value as Record<string, unknown>;
      if (node.type === "string" && node.values && typeof node.values === "object") {
        const combinedKey = toCamelCase(currentPath.join(""));
        result.push({ key: combinedKey, value: "" });
        continue;
      }
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      result.push(...traverseVariables(value as Record<string, unknown>, currentPath));
    }
  }

  return result;
}

function flattenVariables(
  variables: Record<string, unknown>,
  modes: string[]
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const mode of modes) {
    result[mode] = {};
  }

  function traverse(
    obj: Record<string, unknown>,
    path: string[] = []
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = [...path, key];

      if (
        value &&
        typeof value === "object" &&
        "type" in (value as Record<string, unknown>) &&
        (value as Record<string, unknown>).type === "string" &&
        "values" in (value as Record<string, unknown>)
      ) {
        const node = value as Record<string, unknown>;
        const values = node.values as Record<string, unknown>;
        const flattenedKey = toCamelCase(currentPath.join(""));

        for (const mode of modes) {
          if (mode in values && typeof values[mode] === "string") {
            result[mode][flattenedKey] = values[mode] as string;
          }
        }
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        traverse(value as Record<string, unknown>, currentPath);
      }
    }
  }

  traverse(variables);
  return result;
}

export interface SyncStringsOutput {
  jsonGenerated: Record<string, Record<string, string>>;
  localeMap: LocaleMap;
}

export function parseFigmaVariables(
  input: FigmaVariablesExport,
  customLocaleMap?: LocaleMap
): SyncStringsOutput {
  // Collect all modes from all collections
  const allModes = new Set<string>();
  for (const collection of input.collections) {
    for (const mode of collection.modes) {
      allModes.add(mode);
    }
  }

  const localeMap = { ...buildLocaleMap([...allModes]), ...customLocaleMap };
  const jsonGenerated: Record<string, Record<string, string>> = {};

  for (const collection of input.collections) {
    const { modes, variables } = collection;

    const flattenedByMode = flattenVariables(variables, modes);

    for (const [mode, strings] of Object.entries(flattenedByMode)) {
      if (!jsonGenerated[mode]) {
        jsonGenerated[mode] = {};
      }

      Object.assign(jsonGenerated[mode], strings);
    }
  }

  return { jsonGenerated, localeMap };
}