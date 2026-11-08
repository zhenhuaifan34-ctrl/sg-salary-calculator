const maximumPay = 10_000_000;

export function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findOccupations(occupations, query, group = '') {
  const phrase = normalize(query);
  const words = phrase ? phrase.split(' ') : [];
  const results = [];
  for (const occupation of occupations) {
    if (group && occupation.category !== group) continue;
    const name = normalize(occupation.occupation_name);
    const haystack = [name, normalize(occupation.occupation_code), normalize(occupation.aliases?.join(' '))].join(' ');
    if (!words.every(word => haystack.includes(word))) continue;
    const score = name === phrase ? 0 : name.startsWith(phrase) ? 1 : name.includes(phrase) ? 2 : 3;
    results.push({ occupation, score });
  }
  return results.sort((a, b) => a.score - b.score || a.occupation.occupation_name.localeCompare(b.occupation.occupation_name, 'en-SG')).map(result => result.occupation);
}

export function isWage(value) {
  return Number.isFinite(value) && value > 0;
}

export function hasBand({ p25, median, p75 }) {
  return [p25, median, p75].every(isWage) && p25 <= median && median <= p75;
}

export function parsePay(input) {
  const text = input.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.replaceAll(',', ''));
  return amount > 0 && amount <= maximumPay ? amount : null;
}

export function salaryBand(occupation, amount) {
  if (!hasBand(occupation) || !isWage(amount)) return null;
  if (amount < occupation.p25) return 'Below the 25th percentile';
  if (amount < occupation.median) return 'From the 25th percentile to below the median';
  if (amount <= occupation.p75) return 'From the median through the 75th percentile';
  return 'Above the 75th percentile';
}
