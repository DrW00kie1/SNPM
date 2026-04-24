import { SYNC_MANIFEST_VERSION } from "./sync-manifest.mjs";

const V2_SELECTOR_TARGET_FIELDS_BY_KIND = new Map([
  ["planning-page", "pagePath"],
  ["project-doc", "docPath"],
  ["template-doc", "docPath"],
  ["workspace-doc", "docPath"],
  ["runbook", "title"],
  ["validation-session", "title"],
]);

export const MANIFEST_V2_SELECTOR_KINDS = Object.freeze(Array.from(V2_SELECTOR_TARGET_FIELDS_BY_KIND.keys()));

function requireObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value;
}

function normalizeRequiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function normalizeTargetPath(value, message) {
  const rawValue = normalizeRequiredString(value, message);
  const normalizedPath = rawValue
    .split(">")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(" > ");

  if (normalizedPath === "") {
    throw new Error(message);
  }

  return normalizedPath;
}

function formatSupportedSelectorKinds() {
  return MANIFEST_V2_SELECTOR_KINDS.join(", ");
}

function normalizeSelectorKind(kind, selectorLabel) {
  const normalizedKind = normalizeRequiredString(kind, `Manifest selector "${selectorLabel}" requires a non-empty kind.`);
  if (!V2_SELECTOR_TARGET_FIELDS_BY_KIND.has(normalizedKind)) {
    throw new Error(`Manifest selector "${selectorLabel}" has unsupported kind "${normalizedKind}". Supported kinds: ${formatSupportedSelectorKinds()}.`);
  }

  return normalizedKind;
}

function normalizeSelectorTarget(kind, target, selectorLabel) {
  const targetField = V2_SELECTOR_TARGET_FIELDS_BY_KIND.get(kind);
  const message = `Manifest selector "${selectorLabel}" requires a non-empty target.`;
  return targetField === "pagePath" || targetField === "docPath"
    ? normalizeTargetPath(target, message)
    : normalizeRequiredString(target, message);
}

function selectorKey(kind, target) {
  return `${kind}:${target}`;
}

function selectorLabelForObject(selector) {
  const kind = typeof selector.kind === "string" ? selector.kind.trim() : "";
  const target = typeof selector.target === "string" ? selector.target.trim() : "";
  return kind || target ? `${kind}:${target}` : JSON.stringify(selector);
}

export function parseManifestSelector(selector, index = 0) {
  if (typeof selector === "string") {
    const label = selector.trim();
    const separatorIndex = label.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex === label.length - 1) {
      throw new Error(`Manifest selector ${index + 1} must use "kind:target" format.`);
    }

    const kind = normalizeSelectorKind(label.slice(0, separatorIndex), label);
    const target = normalizeSelectorTarget(kind, label.slice(separatorIndex + 1), label);

    return {
      kind,
      target,
      key: selectorKey(kind, target),
      label,
    };
  }

  const selectorObject = requireObject(selector, `Manifest selector ${index + 1} must be a string or an object with kind and target.`);
  const label = selectorLabelForObject(selectorObject);
  const kind = normalizeSelectorKind(selectorObject.kind, label);
  const target = normalizeSelectorTarget(kind, selectorObject.target, label);

  return {
    kind,
    target,
    key: selectorKey(kind, target),
    label,
  };
}

export function parseManifestSelectorList(selectors = []) {
  if (!Array.isArray(selectors)) {
    throw new Error("Manifest selectors must be an array.");
  }

  const parsedSelectors = selectors.map((selector, index) => parseManifestSelector(selector, index));
  const seenKeys = new Set();
  for (const selector of parsedSelectors) {
    if (seenKeys.has(selector.key)) {
      throw new Error(`Manifest selector "${selector.label}" is duplicated.`);
    }
    seenKeys.add(selector.key);
  }

  return parsedSelectors;
}

function normalizedEntryTarget(entry) {
  if (typeof entry.target === "string") {
    return entry.target;
  }

  const targetField = V2_SELECTOR_TARGET_FIELDS_BY_KIND.get(entry.kind);
  return targetField && typeof entry[targetField] === "string" ? entry[targetField] : "";
}

function buildEntryIndex(entries) {
  const entriesByKey = new Map();
  for (const entry of entries) {
    const key = selectorKey(entry.kind, normalizedEntryTarget(entry));
    const matches = entriesByKey.get(key) || [];
    matches.push(entry);
    entriesByKey.set(key, matches);
  }

  return entriesByKey;
}

export function selectManifestEntries(manifest, selectorValues = []) {
  const manifestObject = requireObject(manifest, "Sync manifest selection requires a manifest object.");
  const entries = Array.isArray(manifestObject.entries) ? manifestObject.entries : [];
  const parsedSelectors = parseManifestSelectorList(selectorValues);
  const selectorLabels = parsedSelectors.map((selector) => selector.label);

  if (parsedSelectors.length === 0) {
    return {
      selectedEntries: entries,
      skippedEntries: [],
      selectedCount: entries.length,
      skippedCount: 0,
      selectorLabels,
      selectors: parsedSelectors,
    };
  }

  if (manifestObject.version !== SYNC_MANIFEST_VERSION) {
    throw new Error("Manifest entry selection is only supported for manifest v2.");
  }

  const entriesByKey = buildEntryIndex(entries);
  const selectedKeys = new Set();
  const selectedEntries = [];

  for (const selector of parsedSelectors) {
    const matches = entriesByKey.get(selector.key) || [];
    if (matches.length === 0) {
      throw new Error(`Manifest selector "${selector.label}" did not match any entry.`);
    }

    if (matches.length > 1) {
      throw new Error(`Manifest selector "${selector.label}" matched multiple entries.`);
    }

    selectedKeys.add(selector.key);
    selectedEntries.push(matches[0]);
  }

  const skippedEntries = entries.filter((entry) => !selectedKeys.has(selectorKey(entry.kind, normalizedEntryTarget(entry))));

  return {
    selectedEntries,
    skippedEntries,
    selectedCount: selectedEntries.length,
    skippedCount: skippedEntries.length,
    selectorLabels,
    selectors: parsedSelectors,
  };
}
