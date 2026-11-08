"""Build SG Salary Pro's pinned benchmark snapshots from three official files."""

import argparse
from collections import Counter, defaultdict
from datetime import date
from hashlib import sha256
import json
from pathlib import Path
import re
from xml.etree import ElementTree
from zipfile import ZipFile


DATA_GOV = "https://data.gov.sg"
DATA_LICENCE = f"{DATA_GOV}/open-data-licence"
MOM = "https://stats.mom.gov.sg"
SSOC_PAGE = (
    "https://www.singstat.gov.sg/standard-classifications/national-classifications/"
    "singapore-standard-occupational-classification-ssoc"
)
SSOC_DOWNLOAD = "https://www.singstat.gov.sg/files/3276886b-d6a1-4c6a-989e-716a54e189e8.xlsx"
SSOC_TERMS = "https://www.singstat.gov.sg/terms-of-use"
OCCUPATION_RESOURCE = "d_9917e751f7498502f70052a940a3f312"
INCOME_RESOURCE = "d_52760e82e8786bac11cca40eb29d1a93"
OCCUPATION_FILE = "mom-occupations-2024.json"
INCOME_FILE = "singstat-income-2025.json"
SSOC_FILE = "singstat-ssoc-2020.xlsx"
LATEST_UNIMPORTED = f"{MOM}/Pages/Occupational-Wages-Tables2025.aspx"
XLSX = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REFERENCE_YEAR = 2024
INCOME_YEARS = range(2015, 2026)

# Resolve the four published wording variants. The official title must exist in
# the classifier, and its normalized form must have exactly one five-digit code.
TITLE_VARIANTS = {
    "gardener and horticultural worker": "Gardeners and horticultural worker",
    "registered nurse and other nursing professional (e.g. clinical nurse, nurse educator, excluding enrolled nurse)":
        "Registered nurse and other nursing professionals (e.g. clinical nurse, nurse educator, excluding enrolled nurse)",
    "sales professional (institutional sales of financial products)":
        "Sales professionals (institutional sales of financial products)",
    "typist and word processing operator": "Typists and word processing operator",
}


def api_url(resource_id):
    return f"{DATA_GOV}/api/action/datastore_search?resource_id={resource_id}&limit=1000"


def dataset_url(resource_id):
    return f"{DATA_GOV}/datasets/{resource_id}/view"


def records(file, resource_id, count):
    response = json.loads(file.read_text(encoding="utf-8-sig"))
    data = response["result"]
    if not response["success"] or data["resource_id"] != resource_id:
        raise ValueError(f"Unexpected API source in {file.name}")
    if len(data["records"]) != data["total"] or data["total"] != count:
        raise ValueError(f"Incomplete or changed official dataset in {file.name}")
    return data["records"]


def occupation_id(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def classifications(workbook):
    """Read the official single-sheet XLSX structure with the standard library."""
    with ZipFile(workbook) as archive:
        table = ElementTree.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        shared = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    strings = ["".join(node.itertext()) for node in shared.findall("x:si", XLSX)]
    titles = defaultdict(list)
    major_groups = {}
    for row in table.findall("x:sheetData/x:row", XLSX):
        values = {}
        for cell in row.findall("x:c", XLSX):
            value = cell.findtext("x:v", namespaces=XLSX)
            if value is not None:
                column = cell.attrib["r"].rstrip("0123456789")
                values[column] = strings[int(value)] if cell.get("t") == "s" else value
        code, title = values.get("A", ""), values.get("B", "")
        if not title:
            continue
        if re.fullmatch(r"[1-9X]", code):
            major_groups[code] = title.title().replace(" And ", " and ")
        elif re.fullmatch(r"[1-9X][0-9]{4}", code):
            titles[occupation_id(title)].append(code)
    return titles, major_groups


def wage_value(value):
    if value in ("", None, "-", "–", "na"):
        return None
    if not re.fullmatch(r"[1-9][0-9]*", str(value)):
        raise ValueError(f"Unexpected source wage token: {value!r}")
    return int(value)


def percentiles(row, wage_type):
    values = [wage_value(row[f"mthly_{wage_type}_wage_{p}_pctile"]) for p in (25, 50, 75)]
    available = [value for value in values if value is not None]
    if available != sorted(available):
        raise ValueError(f"Unordered percentiles for {row['occ_desc']}")
    return values


def occupations(raw_dir):
    official_titles, major_groups = classifications(raw_dir / SSOC_FILE)
    output = []
    for row in records(raw_dir / OCCUPATION_FILE, OCCUPATION_RESOURCE, 562):
        if int(row["year"]) != REFERENCE_YEAR:
            raise ValueError("Unexpected occupational survey reference year")
        title = row["occ_desc"].strip()
        slug = occupation_id(title)
        code, = official_titles[occupation_id(TITLE_VARIANTS.get(title, title))]
        gross = percentiles(row, "gross")
        basic = percentiles(row, "basic")
        output.append(dict(
            id=slug, occupation_code=code, occupation_name=title[0].upper() + title[1:],
            category=major_groups[code[0]], p25=gross[0], median=gross[1], p75=gross[2],
            basic_p25=basic[0], basic_median=basic[1], basic_p75=basic[2],
        ))
    for field in ("id", "occupation_code"):
        if len({row[field] for row in output}) != len(output):
            raise ValueError(f"Non-unique occupation {field}")
    return sorted(output, key=lambda row: row["id"])


def income_series(raw_dir):
    national, = [row for row in records(raw_dir / INCOME_FILE, INCOME_RESOURCE, 4)
                 if row["DataSeries"] == "Median (50th Percentile)"]
    series = [{"year": year, "median": wage_value(national[str(year)])} for year in INCOME_YEARS]
    if any(row["median"] is None for row in series):
        raise ValueError("Missing year in national income series")
    return series


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
                    encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", required=True, type=Path)
    parser.add_argument("--retrieved-date", required=True, type=date.fromisoformat)
    parser.add_argument("--out-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    args = parser.parse_args()
    retrieved = args.retrieved_date.isoformat()
    occupation_rows = occupations(args.raw_dir)
    trend_rows = income_series(args.raw_dir)
    occupation_snapshot = dict(
        version="mom-ows-2024-open-2026-04-01-ssoc-2020",
        reference_year=REFERENCE_YEAR, reference_month=6, published_date=None,
        catalogue_created_date="2026-03-27", updated_date="2026-04-01", retrieved_date=retrieved,
        source_url=dataset_url(OCCUPATION_RESOURCE), licence_url=DATA_LICENCE,
        methodology_url=f"{MOM}/iMAS_Tables1/Wages/Wages_2024/Coverage-and-Methodology-of-OWS-2024.pdf",
        attribution="Source: Ministry of Manpower (MOM), Occupational Wage Survey, June 2024, via data.gov.sg. Occupation codes and groups matched to Singapore Department of Statistics SSOC 2020.",
        currency="SGD", salary_definition="Monthly gross wage includes basic pay and regular cash payments such as overtime, commissions and allowances. It is before employee CPF and income tax, excluding employer CPF, bonuses, stock, other lump sums and payments in kind.",
        basic_salary_definition="Monthly basic wage before employee CPF and income tax. Excludes employer CPF, bonuses, overtime, commissions, allowances and payments in kind.",
        population_scope="Full-time Singapore citizens and permanent residents with CPF contributions at private-sector establishments with at least 25 employees. The occupation figures pool covered industries.",
        bonuses_included=False, classification="SSOC 2020", classification_url=SSOC_PAGE,
        latest_official_release={"reference_year": 2025, "published_date": "2026-06-30", "source_url": LATEST_UNIMPORTED, "imported": False},
        occupations=occupation_rows,
    )
    income_snapshot = dict(
        version="singstat-m182981-2015-2025-2026-01-30",
        reference_year=2025, reference_month=6, published_date="2026-01-29",
        advance_published_date="2025-11-28", updated_date="2026-01-30", retrieved_date=retrieved,
        source_url=dataset_url(INCOME_RESOURCE), licence_url=DATA_LICENCE,
        methodology_url=f"{MOM}/Pages/Income-Summary-Table.aspx",
        attribution="Source: Singapore Department of Statistics, M182981, via data.gov.sg. Original source: MOM Comprehensive Labour Force Survey.",
        currency="SGD",
        salary_definition="Median nominal gross monthly income from employment, including employer or platform operator CPF and one-twelfth of annual bonuses. This series includes employment and self-employment income.",
        population_scope="Full-time employed Singapore citizens and permanent residents, excluding full-time National Servicemen.",
        bonuses_included=True, series=trend_rows,
    )
    sources = [
        (OCCUPATION_FILE, api_url(OCCUPATION_RESOURCE), occupation_snapshot["source_url"], DATA_LICENCE),
        (INCOME_FILE, api_url(INCOME_RESOURCE), income_snapshot["source_url"], DATA_LICENCE),
        (SSOC_FILE, SSOC_DOWNLOAD, SSOC_PAGE, SSOC_TERMS),
    ]
    manifest = {
        "retrieved_date": retrieved,
        "sources": [
            {"file": name, "download_url": download, "source_url": source,
             "licence_url": licence, "sha256": sha256((args.raw_dir / name).read_bytes()).hexdigest()}
            for name, download, source, licence in sources
        ],
        "occupation_rows": len(occupation_rows),
        "occupation_classification": {
            "version": "SSOC 2020", "direct_title_matches": len(occupation_rows) - len(TITLE_VARIANTS),
            "validated_title_variants": TITLE_VARIANTS,
            "group_counts": dict(sorted(Counter(row["category"] for row in occupation_rows).items())),
        },
        "income_rows": len(trend_rows),
    }
    args.out_dir.mkdir(parents=True, exist_ok=True)
    write_json(args.out_dir / "benchmark-occupations.json", occupation_snapshot)
    write_json(args.out_dir / "benchmark-income-trend.json", income_snapshot)
    write_json(args.out_dir / "benchmark-sources.json", manifest)
    print(f"Wrote {len(occupation_rows)} occupations and {len(trend_rows)} income observations")


if __name__ == "__main__":
    main()
