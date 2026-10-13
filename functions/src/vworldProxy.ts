export const ALLOWED_VWORLD_QUERY_KEYS = new Set([
  "service", "request", "version", "crs", "size", "page", "query", "type", "category",
  "format", "errorformat", "data", "geometry", "attribute", "geomfilter", "attrfilter", "emdcd",
  "columns", "point", "zipcode", "simple", "pnu", "pageno", "numofrows", "layers", "styles",
  "bbox", "width", "height", "transparent", "bgcolor", "exceptions", "srs",
]);

export function copyAllowedVWorldQuery(source: URLSearchParams, target: URLSearchParams): void {
  source.forEach((value, key) => {
    if (ALLOWED_VWORLD_QUERY_KEYS.has(key.toLowerCase())) target.append(key, value);
  });
}
