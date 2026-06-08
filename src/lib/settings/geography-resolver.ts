import "server-only";

import geographyRows from "../../../public/thailand-geography.json";

type GeographyRow = {
  districtCode: number;
  districtNameTh: string;
  postalCode: number;
  provinceCode: number;
  provinceNameTh: string;
  subdistrictCode: number;
  subdistrictNameTh: string;
};

// Remove common Thai prefixes for fuzzy matching
function cleanGeoName(name: string) {
  return name
    .trim()
    .replace(/^(จังหวัด|อำเภอ|เขต|ตำบล|แขวง)/, "")
    .trim();
}

export function resolveGeography(
  subdistrictInput: string = "",
  districtInput: string = "",
  provinceInput: string = ""
) {
  const rows = geographyRows as GeographyRow[];

  const cleanSub = cleanGeoName(subdistrictInput);
  const cleanDist = cleanGeoName(districtInput);
  const cleanProv = cleanGeoName(provinceInput);

  if (!cleanSub && !cleanDist && !cleanProv) {
    return null;
  }

  // Match: Try to find a row matching all provided inputs
  let match = rows.find(
    (row) =>
      (!cleanProv || cleanGeoName(row.provinceNameTh) === cleanProv) &&
      (!cleanDist || cleanGeoName(row.districtNameTh) === cleanDist) &&
      (!cleanSub || cleanGeoName(row.subdistrictNameTh) === cleanSub)
  );

  // Fallback: If not found, try matching just subdistrict and district (some provinces might be misspelled)
  if (!match && cleanSub && cleanDist) {
    match = rows.find(
      (row) =>
        cleanGeoName(row.districtNameTh) === cleanDist &&
        cleanGeoName(row.subdistrictNameTh) === cleanSub
    );
  }

  // Fallback 2: Try matching just subdistrict (if unique enough)
  if (!match && cleanSub) {
    match = rows.find((row) => cleanGeoName(row.subdistrictNameTh) === cleanSub);
  }

  if (match) {
    return {
      provinceCode: String(match.provinceCode),
      provinceName: match.provinceNameTh,
      districtCode: String(match.districtCode),
      districtName: match.districtNameTh,
      subdistrictCode: String(match.subdistrictCode),
      subdistrictName: match.subdistrictNameTh,
      postalCode: String(match.postalCode),
    };
  }

  return null;
}
