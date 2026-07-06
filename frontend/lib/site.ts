/**
 * Central site config — change site-wide constants here so a rename/rebrand
 * propagates everywhere (wordmark, metadata, etc.). One source of truth.
 */
export const SITE = {
  /** Brand name shown in the wordmark + page titles. Change in ONE place. Lowercase by design —
   *  the wordmark appends the accent period ("finite.") as the accepting state of the FSM. */
  brandName: 'finite',
} as const;
