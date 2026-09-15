import { readFileSync } from 'node:fs';
import type { Stage } from './stage.js';

const quotesPath = new URL('../quotes.json', import.meta.url);

/**
 * Headlines for the text card when there is no custom message: one quote per
 * permutation of the two cities' light phases, written from the FIRST city's
 * perspective ("here" = PLACES[0]). Edit quotes.json to change the wording.
 */

const QUOTES = JSON.parse(readFileSync(quotesPath, 'utf8')) as Record<
  string,
  string | string[]
>;

type Phase = 'night' | 'twilight' | 'dawn' | 'day' | 'dusk';

export function phaseOf(stage: Stage): Phase {
  switch (stage) {
    case 'night':
      return 'night';
    case 'twilight':
      return 'twilight';
    case 'dawnGolden':
      return 'dawn';
    case 'morning':
    case 'noon':
    case 'afternoon':
      return 'day';
    case 'eveningGolden':
      return 'dusk';
  }
}

/** Quote for the phase pair; each permutation may list several variants and
 *  one is picked at random. String values (single quote) also work. */
export function quoteFor(phaseA: Phase, phaseB: Phase): string | undefined {
  const v = QUOTES[`${phaseA}/${phaseB}`];
  if (!v) return undefined;
  return Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v;
}
