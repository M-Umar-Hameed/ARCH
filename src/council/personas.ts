export function composePersonaPrompt(persona: "believer" | "investor" | "skeptic", idea: string): string {
  const PERSONA_ROLE = {
    believer: "optimist, best-case potential, cultural impact, enthusiastic",
    investor: "realist, economics, effort/cost, time-to-market, maintenance burden, skeptical of hype",
    skeptic: "roaster, actively destroy the idea, hidden flaws, market saturation, why users will not care, brutally honest"
  };

  return [
    `Role: ${PERSONA_ROLE[persona]}`,
    idea,
    `Answer in under 300 words as plain text.`
  ].filter(Boolean).join("\n");
}

export function composeChairmanPrompt(input: {
  idea: string;
  believer: string;
  investor: string;
  skeptic: string;
  qa?: { question: string; answer: string }[];
}): string {
  const parts = [
    input.idea,
    `=== COUNCIL believer ===\n${input.believer}`,
    `=== COUNCIL investor ===\n${input.investor}`,
    `=== COUNCIL skeptic ===\n${input.skeptic}`
  ];

  if (input.qa && input.qa.length > 0) {
    const qaLines = input.qa.flatMap(qa => [`Q: ${qa.question}`, `A: ${qa.answer}`]);
    parts.push(`Q&A History:\n${qaLines.join("\n")}`);
  }

  parts.push(
    `End your response exactly matching this output contract. Each marker must be on its own line:`,
    `RATING: <integer 0-10>/10`,
    `DECISION: GO or DECISION: NO-GO or DECISION: NEEDS-INFO`,
    `QUESTIONS:`,
    `- <optional question 1>`,
    `- <optional question 2>`,
    `TITLE: <one-line ticket title>`,
    `SPEC:`,
    `<problem, approach, acceptance criteria>`
  );

  return parts.filter(Boolean).join("\n\n");
}

export function parseChairman(output: string): {
  rating: number;
  decision: "GO" | "NO-GO" | "NEEDS-INFO";
  questions: string[];
  title: string;
  spec: string;
} {
  // SPEC
  const specMatch = [...output.matchAll(/^\s*SPEC:\s*$/gim)].at(-1);
  let spec = "";
  if (specMatch && specMatch.index !== undefined) {
    spec = output.slice(specMatch.index + specMatch[0].length).replace(/^\s+/, "");
  }

  // TITLE
  const titleMatch = [...output.matchAll(/^\s*TITLE:\s*(.+)$/gim)].at(-1);
  let title = "Untitled council ticket";
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  } else {
    const firstSpecLine = spec.split(/\r?\n/).find(line => line.trim().length > 0);
    if (firstSpecLine) {
      title = firstSpecLine.trim().substring(0, 80);
    }
  }

  // RATING
  const ratingMatch = [...output.matchAll(/^\s*RATING:\s*(\d+)\/10\b/gim)].at(-1);
  let rating = 0;
  if (ratingMatch && ratingMatch[1]) {
    rating = parseInt(ratingMatch[1], 10);
    if (isNaN(rating)) rating = 0;
    rating = Math.max(0, Math.min(10, rating));
  }

  // DECISION
  const decisionMatch = [...output.matchAll(/^\s*DECISION:\s*(GO|NO-GO|NEEDS-INFO)\b/gim)].at(-1);
  let decision: "GO" | "NO-GO" | "NEEDS-INFO" = "NEEDS-INFO";
  if (decisionMatch && decisionMatch[1]) {
    const parsed = decisionMatch[1].toUpperCase();
    if (parsed === "GO" || parsed === "NO-GO") {
      decision = parsed;
    }
  }

  // QUESTIONS
  const questionsMatch = [...output.matchAll(/^\s*QUESTIONS:\s*$/gim)].at(-1);
  const questions: string[] = [];
  if (questionsMatch && questionsMatch.index !== undefined) {
    const afterQ = output.slice(questionsMatch.index + questionsMatch[0].length);
    const lines = afterQ.split(/\r?\n/);
    let started = false;
    // lines[0] is the rest of the QUESTIONS: line, which is empty because of `$` anchor
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!started && line.trim() === "") continue;

      if (line.match(/^-\s+(.+)/)) {
        started = true;
        questions.push(line);
        if (questions.length >= 5) break;
      } else {
        break;
      }
    }
  }

  return { rating, decision, questions, title, spec };
}
