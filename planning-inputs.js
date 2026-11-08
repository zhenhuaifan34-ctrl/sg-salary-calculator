(function (root) {
  'use strict';
  // Product input limits for planning scenarios, not statutory employment limits.
  function check(ids, requiredPositive = []) {
    for (const id of ids) {
      const field = document.getElementById(id);
      const raw = field.value.trim();
      const value = Number(raw);
      const required = requiredPositive.includes(id);
      const min = field.min === '' ? 0 : Number(field.min);
      const max = field.max === '' ? 10000000 : Number(field.max);
      if ((!raw && required) || field.validity?.badInput || !Number.isFinite(value) ||
          value < min || value > max || (required && value <= 0)) {
        const label = field.labels?.[0]?.textContent.trim() || id;
        return label + ': enter ' + (required ? 'a positive' : 'a non-negative') +
          ' finite number within ' + min + ' to ' + max + '.';
      }
    }
    return '';
  }
  root.PlanningInputs = Object.freeze({check});
})(typeof globalThis !== 'undefined' ? globalThis : this);
