// Checks every IT/EN string table: keys missing in one language, placeholders that differ ({n}, {name}…),
// Italian strings left in English (identical to the English one), and stray braces.
//   node tools/check-strings.mjs        → exit 1 if something is wrong
import it from '../src/i18n/it.js';
import en from '../src/i18n/en.js';
import * as ui from '../src/ui/strings.js';
import * as sys from '../src/systems/strings.js';
import * as core from '../src/core/strings.js';

const IT = { ...it, ...core.it, ...ui.it, ...sys.it };
const EN = { ...en, ...core.en, ...ui.en, ...sys.en };
const problems = [];
const ph = s => (typeof s === 'string' ? [...s.matchAll(/\{(\w+)(?:\|[^}]*)?\}/g)].map(m => m[1]).sort().join(',') : '');
// words the two languages share (names, brands, short labels) are fine when identical
const SAME_OK = /^(ok|menu|stop|extra|\d|[-+×%:·/ ]+$)/i;

for (const k of Object.keys(IT)) if (!(k in EN)) problems.push(`missing in EN: ${k}`);
for (const k of Object.keys(EN)) if (!(k in IT)) problems.push(`missing in IT: ${k}`);
for (const k of Object.keys(IT)) {
  if (!(k in EN)) continue;
  const a = IT[k], b = EN[k];
  if (typeof a !== 'string' || typeof b !== 'string') continue;
  if (ph(a) !== ph(b)) problems.push(`placeholders differ: ${k}  IT {${ph(a)}}  EN {${ph(b)}}`);
  for (const [lang, s] of [['IT', a], ['EN', b]]) {
    const open = (s.match(/\{/g) || []).length, close = (s.match(/\}/g) || []).length;
    if (open !== close) problems.push(`unbalanced braces (${lang}): ${k}`);
  }
  // an Italian sentence identical to the English one is an untranslated string
  const words = a.replace(/\{[^}]*\}/g, ' ').match(/\p{L}{3,}/gu) || [];   // real words, placeholders and units aside
  if (a === b && words.length >= 2 && !SAME_OK.test(a) && !/^(npc\.\w+\.name|ui\.title\.name)$/.test(k)) problems.push(`IT left in English: ${k} = "${a}"`);
}
console.log(problems.length ? problems.join('\n') : 'strings OK');
console.log(`${Object.keys(IT).length} IT keys, ${Object.keys(EN).length} EN keys, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
