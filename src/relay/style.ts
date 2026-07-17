export type CommProfile = "off" | "caveman" | "humanizer";

const CAVEMAN_CLAUSE = `
Communication style: extremely terse. Drop all filler words, pleasantries, hedging, and introductory or concluding remarks. Never restate the question, never apologize, never announce what you are about to do before doing it. Fragments are acceptable; full sentences are not required. Focus every line on the technical problem itself.

The technical substance stays complete and exact at all times. Code snippets, file paths, variable identifiers, commands, and error messages must never be compressed, truncated, or paraphrased. All logic, steps, and commands must be provided fully with no detail skipped. Terse means fewer words around the substance, never less substance.
`;

const HUMANIZER_CLAUSE = `
Communication style: plain, natural prose that reads as if written by a careful human engineer. Avoid inflated or promotional language, empty intensifiers, and grand claims about significance. Do not fall into rule-of-three constructions or formulaic parallel sentences. Use direct attribution: name the source or say you are uncertain, never hide behind vague phrases like "some say" or "it is widely known".

Vary sentence length so the text has a natural rhythm; short sentences are welcome. Use em dashes sparingly. Prefer concrete verbs over abstract noun phrases. Keep every explanation direct, grounded in the actual code or facts at hand, and free of filler.
`;

export function styleClause(profile: string | null | undefined): string {
  if (profile === "caveman") {
    return CAVEMAN_CLAUSE;
  }
  if (profile === "humanizer") {
    return HUMANIZER_CLAUSE;
  }
  return "";
}
