import { findOccupations, hasBand, isWage, normalize, parsePay, salaryBand } from './benchmark-model.mjs';

const byId = id => document.getElementById(id);
const sgd = value => isWage(value) ? 'S$' + value.toLocaleString('en-SG', { maximumFractionDigits: 2 }) : 'Unavailable';
const occupationPath = '/salary-benchmark-explorer.html';
const featured = [
  ['software-developer', 'Software developer'],
  ['accountant-excluding-tax-accountant', 'Accountant (excluding tax accountant)'],
  ['chef', 'Chef'],
];
const dateLabel = value => value ? new Intl.DateTimeFormat('en-SG', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z')) : '';
const reference = data => (data.reference_month ? new Date(Date.UTC(data.reference_year, data.reference_month - 1)).toLocaleDateString('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : String(data.reference_year));

async function loadData(name) {
  const response = await fetch('/data/' + name + '.json');
  if (!response.ok) throw new Error('Dataset unavailable');
  return response.json();
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function occupationLink(id) {
  return occupationPath + '?' + new URLSearchParams({ occupation: id });
}

function sourceDates(data) {
  return [
    data.published_date && 'Official release ' + dateLabel(data.published_date),
    data.updated_date && 'Open dataset updated ' + dateLabel(data.updated_date),
    data.retrieved_date && 'Accessed ' + dateLabel(data.retrieved_date),
  ].filter(Boolean).join(' · ');
}

function attachAttribution(target, data) {
  if (data.attribution) target.append(document.createTextNode(' ' + data.attribution));
  if (data.licence_url) {
    const link = element('a', 'Singapore Open Data Licence');
    link.href = data.licence_url;
    target.append(document.createTextNode(' · '), link);
  }
}

async function showExplorer() {
  const form = byId('occupation-search');
  const input = byId('occupation-query');
  const group = byId('occupation-category');
  const status = byId('benchmark-search-status');
  const suggestions = byId('benchmark-suggestions');
  const result = byId('benchmark-result');
  const resultTitle = byId('benchmark-result-title');
  const compare = byId('benchmark-comparison');
  const compareForm = byId('benchmark-compare-form');
  const pay = byId('benchmark-personal-pay');
  const payStatus = byId('benchmark-compare-status');
  const copyStatus = byId('benchmark-copy-status');
  let selected;
  let all;
  let data;

  try {
    data = await loadData('benchmark-occupations');
    all = data.occupations;
    if (!Array.isArray(all) || !all.length) throw new Error('No occupations');
  } catch {
    status.textContent = 'The dataset could not be loaded. Refresh to try again or open the official tables under Methodology.';
    return;
  }

  for (const label of [...new Set(all.map(row => row.category).filter(Boolean))].sort()) {
    const option = element('option', label);
    option.value = label;
    group.append(option);
  }
  for (const control of form.elements) control.disabled = false;
  byId('benchmark-definition').textContent = data.salary_definition;
  byId('benchmark-population').textContent = data.population_scope;
  byId('benchmark-source').href = data.source_url;
  byId('benchmark-result-source').href = data.source_url;
  byId('benchmark-methodology').href = data.methodology_url;
  byId('benchmark-source-dates').textContent = sourceDates(data) + '.';
  attachAttribution(byId('benchmark-source-dates'), data);

  function clearPayResult() {
    pay.removeAttribute('aria-invalid');
    payStatus.textContent = '';
    payStatus.classList.remove('bench-note');
  }
  function clearResult() {
    selected = null;
    result.hidden = true;
    compare.hidden = true;
    for (const button of suggestions.querySelectorAll('[aria-pressed=true]')) button.setAttribute('aria-pressed', 'false');
    compareForm.reset();
  }
  function choose(occupation, focus) {
    selected = occupation;
    resultTitle.textContent = occupation.occupation_name;
    const code = occupation.occupation_code ? ' · SSOC ' + occupation.occupation_code : '';
    byId('benchmark-vintage').textContent = reference(data) + ' · Gross monthly wage · SGD' + code;
    byId('benchmark-scope').textContent = data.population_scope + ' Gross wage excludes bonuses and employer CPF.';
    for (const key of ['p25', 'median', 'p75']) {
      byId('benchmark-' + key).textContent = sgd(occupation[key]);
      byId('benchmark-basic-' + key).textContent = sgd(occupation['basic_' + key]);
    }
    byId('benchmark-basic').hidden = !['basic_p25', 'basic_median', 'basic_p75'].some(key => isWage(occupation[key]));
    byId('benchmark-basic').open = false;
    const validBand = hasBand(occupation);
    const distribution = byId('benchmark-distribution');
    distribution.hidden = !validBand;
    if (validBand) {
      const axisMax = Math.ceil(occupation.p75 * 1.08 / 1000) * 1000;
      for (const key of ['p25', 'median', 'p75']) distribution.style.setProperty('--' + key, 100 * occupation[key] / axisMax + '%');
      byId('benchmark-axis-max').textContent = sgd(axisMax);
    }
    byId('benchmark-partial').hidden = validBand;
    compareForm.reset();
    copyStatus.textContent = '';
    for (const button of suggestions.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === occupation.id));
    result.hidden = false;
    compare.hidden = !validBand;
    if (focus) resultTitle.focus();
  }

  function displaySuggestions() {
    const raw = input.value.trim();
    const query = normalize(raw);
    const browsing = Boolean(query || group.value);
    const matches = raw && !query ? [] : browsing ? findOccupations(all, query, group.value) : featured.map(([id]) => all.find(row => row.id === id)).filter(Boolean);
    suggestions.replaceChildren();
    const visible = matches.slice(0, 12);
    for (const row of visible) {
      const button = element('button', row.occupation_name, 'bench-button bench-secondary');
      button.type = 'button';
      button.dataset.id = row.id;
      button.setAttribute('aria-pressed', String(row.id === selected?.id));
      button.addEventListener('click', () => choose(row, true));
      suggestions.append(button);
    }
    status.textContent = !matches.length
      ? 'No occupation matches. Try a shorter job title or another group.'
      : browsing
        ? matches.length > visible.length ? `Showing ${visible.length} of ${matches.length} matches. Refine the title to narrow the list.` : `${matches.length} occupation ${matches.length === 1 ? 'match' : 'matches'}.`
        : 'Popular starting points. Search or browse to find more.';
    return matches;
  }

  input.addEventListener('input', displaySuggestions);
  group.addEventListener('change', () => { clearResult(); displaySuggestions(); });
  form.addEventListener('reset', event => {
    event.preventDefault();
    input.value = '';
    group.value = '';
    clearResult();
    displaySuggestions();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const matches = displaySuggestions();
    const exact = matches.find(row => normalize(row.occupation_name) === normalize(input.value));
    if (exact || matches.length === 1) choose(exact ?? matches[0], true);
    else {
      clearResult();
      suggestions.querySelector('button')?.focus();
    }
  });
  compareForm.addEventListener('submit', event => {
    event.preventDefault();
    clearPayResult();
    const amount = parsePay(pay.value);
    const band = selected && amount && salaryBand(selected, amount);
    payStatus.classList.add('bench-note');
    if (!band) {
      pay.setAttribute('aria-invalid', 'true');
      payStatus.textContent = 'Enter a positive amount up to S$10,000,000 with at most two decimal places.';
      pay.focus();
      return;
    }
    payStatus.textContent = band + ' for this occupation in the published data.';
  });
  compareForm.addEventListener('reset', clearPayResult);
  pay.addEventListener('input', clearPayResult);
  byId('benchmark-copy').addEventListener('click', async () => {
    if (!selected) return;
    const text = [selected.occupation_name, reference(data) + ' · gross monthly wage (SGD, excluding bonuses and employer CPF)',
      'P25 ' + sgd(selected.p25) + ' · Median ' + sgd(selected.median) + ' · P75 ' + sgd(selected.p75),
      'Source: Ministry of Manpower, ' + data.source_url].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      copyStatus.textContent = 'Published wage figures copied.';
    } catch {
      copyStatus.textContent = 'Clipboard access is unavailable. You can select and copy the figures above.';
    }
  });

  const params = new URLSearchParams(location.search);
  const occupation = all.find(row => row.id === params.get('occupation'));
  input.value = (params.get('q') || occupation?.occupation_name || '').slice(0, 100);
  const matches = displaySuggestions();
  const exact = matches.find(row => normalize(row.occupation_name) === normalize(input.value));
  if (occupation || exact || matches.length === 1) choose(occupation ?? exact ?? matches[0], false);
}

async function showOccupationHighlights() {
  const status = byId('home-occupation-status');
  try {
    const data = await loadData('benchmark-occupations');
    const cards = byId('home-occupation-cards');
    for (const [id, label] of featured) {
      const row = data.occupations.find(item => item.id === id);
      if (!row) continue;
      const card = element('a', null, 'bench-card');
      card.href = occupationLink(id);
      const stats = element('dl', null, 'bench-stats');
      for (const [name, key] of [['P25', 'p25'], ['Median', 'median'], ['P75', 'p75']]) {
        const metric = element('div', null, key === 'median' ? 'bench-stat-focus' : '');
        metric.append(element('dt', name), element('dd', sgd(row[key])));
        stats.append(metric);
      }
      card.append(element('strong', label), stats);
      cards.append(card);
    }
    byId('home-occupation-summary').textContent = reference(data) + ' · Monthly gross wage in SGD, excluding bonuses and employer CPF. ' + data.population_scope;
    byId('home-occupation-source').href = data.source_url;
    status.textContent = 'Open-licensed occupation snapshot. ' + sourceDates(data) + '. The newer June 2025 release is available separately at MOM.';
    attachAttribution(status, data);
  } catch {
    status.textContent = 'The occupation snapshot is temporarily unavailable. Open the official dataset below.';
  }
}

function svgElement(tag, attributes, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
}

function incomeChart(series) {
  const figure = element('figure', null, 'bench-trend');
  const svg = svgElement('svg', { viewBox: '0 0 440 180', 'aria-hidden': 'true' });
  const floor = Math.floor(Math.min(...series.map(row => row.median)) / 500) * 500;
  const ceiling = Math.max(floor + 500, Math.ceil(Math.max(...series.map(row => row.median)) / 500) * 500);
  const x = index => 65 + index * 356 / (series.length - 1);
  const y = value => 147 - (value - floor) * 125 / (ceiling - floor);
  for (const value of [floor, ceiling]) {
    svg.append(svgElement('line', { x1: 65, x2: 421, y1: y(value), y2: y(value), class: 'bench-trend-grid' }),
      svgElement('text', { x: 1, y: y(value) + 4 }, sgd(value)));
  }
  svg.append(svgElement('polyline', { points: series.map((row, index) => x(index) + ',' + y(row.median)).join(' '), class: 'bench-trend-line' }));
  series.forEach((row, index) => {
    svg.append(svgElement('circle', { cx: x(index), cy: y(row.median), r: 3.6 }));
    if (index === 0 || index === series.length - 1) svg.append(svgElement('text', { x: x(index), y: 171, 'text-anchor': 'middle' }, String(row.year)));
  });
  figure.append(svg, element('figcaption', 'Nominal Singapore dollars per month. Axis starts at ' + sgd(floor) + '. Exact values are available below.'));
  const disclosure = element('details', null, 'bench-detail');
  const table = element('table', null, 'bench-trend-table');
  const headers = table.createTHead().insertRow();
  for (const text of ['Year', 'Median monthly income']) {
    const header = element('th', text);
    header.scope = 'col';
    headers.append(header);
  }
  const body = table.createTBody();
  for (const row of series) {
    const line = body.insertRow();
    const heading = element('th', row.year);
    heading.scope = 'row';
    line.append(heading, element('td', sgd(row.median)));
  }
  disclosure.append(element('summary', 'View exact annual figures'), table);
  figure.append(disclosure);
  return figure;
}

async function showNationalTrend() {
  const status = byId('home-income-status');
  try {
    const data = await loadData('benchmark-income-trend');
    const series = data.series.filter(row => Number.isInteger(row.year) && isWage(row.median)).sort((a, b) => a.year - b.year);
    if (series.length < 2 || series.some((row, index) => index && row.year !== series[index - 1].year + 1)) throw new Error('No comparable series');
    const [previous, latest] = series.slice(-2);
    const change = 100 * (latest.median / previous.median - 1);
    const changeLabel = new Intl.NumberFormat('en-SG', { style: 'percent', maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: 'exceptZero' }).format(change / 100);
    byId('home-income-scope').textContent = data.population_scope + ' ' + data.salary_definition + ' This national measure differs from the occupational gross wage above.';
    status.textContent = `${latest.year}: ${sgd(latest.median)} per month · ${changeLabel} nominal from ${previous.year}. ${sourceDates(data)}.`;
    attachAttribution(status, data);
    byId('home-income-source').href = data.source_url;
    byId('home-income-chart').replaceChildren(incomeChart(series));
  } catch {
    status.textContent = 'A comparable trend could not be loaded. Open the official employment income tables below.';
  }
}

if (document.body.dataset.benchmarkPage === 'explorer') showExplorer();
if (document.body.dataset.benchmarkPage === 'home') {
  showOccupationHighlights();
  showNationalTrend();
}
