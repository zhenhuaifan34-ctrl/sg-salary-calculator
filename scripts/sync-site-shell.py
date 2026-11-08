"""Synchronize checked-in static navigation and breadcrumbs without touching page content."""
import argparse
import re
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NAVIGATION = (("/", "Home"), ("/tools.html", "Calculators"), ("/guides.html", "Guides"), ("/about.html", "About"))
TOOLS = {
    "salary-calculator.html": "Salary Calculator",
    "annual-leave-calculator.html": "Annual Leave Calculator",
    "resignation-calculator.html": "Resignation Calculator",
    "offer-comparison-calculator.html": "Offer Comparison",
    "job-switch-worth-it-calculator.html": "Job Switch Calculator",
    "salary-benchmark-explorer.html": "Salary Benchmark Explorer",
}
GUIDES = {
    "guide-2026.html": "Employment Act",
    "guide-13th-month-bonus-2026.html": "Annual Wage Supplement",
    "guide-annual-leave-2026.html": "Annual Leave",
    "guide-cpf-2026.html": "CPF Contributions",
    "guide-income-tax-2026.html": "Income Tax",
    "guide-lqs-2026.html": "Local Qualifying Salary",
    "guide-overtime-pay-2026.html": "Overtime Pay",
    "guide-public-holiday-2026.html": "Public Holidays",
    "guide-resignation-2026.html": "Resignation and Notice",
    "guide-salary-benchmark-2026.html": "Salary Benchmarking",
    "guide-salary-increase-switching-jobs-2026.html": "10% Pay Rise and Job Switching",
    "guide-salary-increment-2026.html": "Salary Increments",
    "is-higher-salary-worth-switching-jobs-singapore-2026.html": "Switching Costs and Payback",
}
OTHER = {"index.html": "Home", "tools.html": "Calculators", "guides.html": "Guides", "about.html": "About", "privacy.html": "Privacy"}
MARK = '<span class="sgsp-mark" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16M6 14l4-5 4 2 5-6m-5 0h5v5M5 5h3M5 8h1"/></svg></span>'
BRAND = f'<a class="sgsp-brand" href="/">{MARK}<span>SG Salary <strong>Pro</strong></span></a>'
MENU_ICON = '<svg class="sgsp-menu-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
CLOSE_ICON = '<svg class="sgsp-close-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 5 14 14M19 5 5 19"/></svg>'


def link(href, label, current=""):
    attr = f' aria-current="{current}"' if current else ""
    return f'<a href="{href}"{attr}>{escape(label)}</a>'


def header(name):
    page = "/" if name == "index.html" else "/" + name
    parent = "/tools.html" if name in TOOLS else "/guides.html" if name in GUIDES else None
    navigation = "\n".join(link(href, label, "page" if page == href else "location" if parent == href else "") for href, label in NAVIGATION)
    annual_leave = name == "annual-leave-calculator.html"
    theme_id = "themeToggle" if annual_leave else "home-theme"
    native_theme = " data-sgsp-native-theme" if annual_leave else ""
    return f'''<a class="sgsp-skip" href="#sgsp-main">Skip to content</a>
<header class="sgsp-header">
  <div class="sgsp-shell sgsp-head-grid">
    {BRAND}
    <nav class="sgsp-nav sgsp-nav--desktop" aria-label="Main navigation">
      {navigation}
    </nav>
    <button type="button" class="sgsp-theme" id="{theme_id}" data-sgsp-theme{native_theme} aria-pressed="false" aria-label="Dark theme" hidden>Theme</button>
    <details class="sgsp-mobile-menu">
      <summary>{MENU_ICON}{CLOSE_ICON}<span>Menu</span></summary>
      <nav class="sgsp-nav sgsp-nav--mobile" aria-label="Main navigation">
        {navigation}
      </nav>
    </details>
  </div>
</header>'''


def breadcrumb(name):
    if name == "index.html":
        return '<div class="sgsp-main-anchor" id="sgsp-main" tabindex="-1"></div>'
    parts = [link("/", "Home")]
    if name in TOOLS:
        parts.append(link("/tools.html", "Calculators"))
    elif name in GUIDES:
        parts.append(link("/guides.html", "Guides"))
    label = (TOOLS | GUIDES | OTHER)[name]
    parts.append(f'<span aria-current="page">{escape(label)}</span>')
    trail = '<span aria-hidden="true">/</span>'.join(parts)
    return f'''<nav class="sgsp-shell sgsp-breadcrumb" aria-label="Breadcrumb">{trail}</nav>
<div class="sgsp-main-anchor" id="sgsp-main" tabindex="-1"></div>'''


def footer():
    calculator_links = "\n".join(link("/" + name, label) for name, label in TOOLS.items())
    return f'''<footer class="sgsp-footer">
  <div class="sgsp-shell sgsp-foot-grid">
    <div>{BRAND}<p>Pay, leave and career decisions in Singapore.</p></div>
    <nav aria-label="Calculator links">
      <strong>Calculators</strong>
      {calculator_links}
    </nav>
    <nav aria-label="Site information">
      <strong>Resources</strong>
      <a href="/tools.html">All calculators</a>
      <a href="/guides.html">All guides</a>
      <a href="/about.html">About</a>
      <a href="/privacy.html">Privacy</a>
      <a href="/#faq">FAQ</a>
    </nav>
  </div>
  <div class="sgsp-shell sgsp-foot-line">Independent planning tools and guides for Singapore.</div>
</footer>'''


def replace_block(html, slot, content):
    start, end = f"<!-- sgsp:{slot}:start -->", f"<!-- sgsp:{slot}:end -->"
    pattern = re.escape(start) + r"[\s\S]*?" + re.escape(end)
    replacement = f"{start}\n{content}\n{end}"
    html, count = re.subn(pattern, lambda _: replacement, html)
    if count != 1:
        raise ValueError(f"Expected one {slot} slot, got {count}")
    return html


def render(name, html):
    return replace_block(replace_block(replace_block(html, "header", header(name)), "breadcrumb", breadcrumb(name)), "footer", footer())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    pending = []
    for name in TOOLS | GUIDES | OTHER:
        page = ROOT / name
        original = page.read_bytes().decode("utf-8")
        windows_endings = "\r\n" in original
        original = original.replace("\r\n", "\n")
        updated = render(name, original)
        if updated != original:
            pending.append(name)
            if not args.check:
                page.write_bytes((updated.replace("\n", "\r\n") if windows_endings else updated).encode("utf-8"))
    if args.check and pending:
        parser.error("Static shell differs on " + ", ".join(pending))
    print(f"{len(TOOLS | GUIDES | OTHER)} static pages checked; {len(pending)} differences.")


if __name__ == "__main__":
    main()
