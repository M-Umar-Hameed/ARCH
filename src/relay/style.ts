export type CommProfile = "off" | "caveman" | "humanizer";

const CAVEMAN_CLAUSE = `
Communication style: extremely terse. Drop all filler words, pleasantries, hedging, and introductory or concluding remarks. Never restate the question, never apologize, never announce what you are about to do before doing it. Fragments are acceptable; full sentences are not required. Focus every line on the technical problem itself.

The technical substance stays complete and exact at all times. Code snippets, file paths, variable identifiers, commands, and error messages must never be compressed, truncated, or paraphrased. All logic, steps, and commands must be provided fully with no detail skipped. Terse means fewer words around the substance, never less substance.
`;

const HUMANIZER_CLAUSE = `
Communication style: plain, natural prose that reads as if written by a careful human engineer. Avoid inflated or promotional language, empty intensifiers, and grand claims about significance. Do not fall into rule-of-three constructions or formulaic parallel sentences. Use direct attribution: name the source or say you are uncertain, never hide behind vague phrases like "some say" or "it is widely known".

Vary sentence length so the text has a natural rhythm; short sentences are welcome. Use em dashes sparingly. Prefer concrete verbs over abstract noun phrases. Keep every explanation direct, grounded in the actual code or facts at hand, and free of filler.
`;

const PONYTAIL_CLAUSE = `
Code policy: write the minimum code that solves the problem. Before writing anything new, reuse what already exists in the codebase, then the standard library, then an already-installed dependency. No speculative abstractions, no configurability nobody asked for, no scaffolding for later. Fix root causes in the shared path, never symptoms at one call site. The shortest working diff that satisfies the acceptance criteria wins.
`;

const PONYTAIL_REVIEW = `
Additional review criteria: flag over-engineering as findings — reinvented stdlib, unneeded new dependencies, speculative abstractions, dead flexibility, or a diff larger than the task requires. Prefer the smallest change that satisfies the plan.
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

// Role-mapped policy (owner design): internal agent-to-agent traffic is terse
// (caveman), human-facing output is natural prose (humanizer), and code work
// always carries the ponytail discipline. The setting is only an off switch —
// unset/auto/legacy values all mean ON; "off" disables everything.
export type StyleRole = "plan" | "work" | "review" | "chairman";

export function roleStyle(role: StyleRole, profileSetting: string | null | undefined): string {
  if (profileSetting === "off") return "";
  switch (role) {
    case "plan": return CAVEMAN_CLAUSE;
    case "work": return CAVEMAN_CLAUSE + PONYTAIL_CLAUSE;
    // Reviews stay VERDICT-neutral: ponytail here is review criteria (what to
    // look for), not output style.
    case "review": return PONYTAIL_REVIEW;
    case "chairman": return HUMANIZER_CLAUSE;
  }
}
