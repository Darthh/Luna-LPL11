// A readable URL segment for a firm: /hedge-funds/JaneStreetGroup rather than
// /hedge-funds/0001595888.
//
// This lives apart from lib/thirteenF.js on purpose. The fund list is a client
// component and needs to build these links, and importing them from thirteenF
// pulled that module's EDGAR fetching - rate-limiter and all - into the
// browser bundle.

// The legal-entity suffixes carry no meaning in a URL and only make it longer.
const ENTITY_SUFFIX = /\b(?:l ?p|l ?l ?c|b ?v|n ?v|inc|incorporated|ltd|limited|llp|plc|corp|corporation|co|company|holdings?)\b/gi;

export function managerSlug(name) {
  return name
    .replace(/&/g, " and ")
    // Punctuation goes first: roster names read "Jane Street Group, LLC" and
    // "Optiver Holding B.V.", so stripping suffixes before the commas and dots
    // are gone would leave the suffix attached to the slug.
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(ENTITY_SUFFIX, " ")
    .split(/\s+/)
    .filter(Boolean)
    // Only the first letter is forced; the rest keeps the roster's own casing
    // so BlackRock and JPMorgan don't come out as Blackrock and Jpmorgan.
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");
}
