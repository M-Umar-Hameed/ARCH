import { expect, test } from "vitest";
import { composePersonaPrompt, composeChairmanPrompt, parseChairman } from "../src/council/personas.js";

test("composePersonaPrompt includes idea and persona words", () => {
  const b = composePersonaPrompt("believer", "flying cars");
  expect(b).toContain("flying cars");
  expect(b).toContain("optimist");
  expect(b).toContain("cultural impact");

  const i = composePersonaPrompt("investor", "flying cars");
  expect(i).toContain("flying cars");
  expect(i).toContain("economics");
  expect(i).toContain("maintenance burden");

  const s = composePersonaPrompt("skeptic", "flying cars");
  expect(s).toContain("flying cars");
  expect(s).toContain("roaster");
  expect(s).toContain("destroy");
});

test("composeChairmanPrompt includes all outputs, contract, and optional qa", () => {
  const p = composeChairmanPrompt({
    idea: "flying cars",
    believer: "it will be great",
    investor: "too expensive",
    skeptic: "physics says no",
    qa: [{ question: "what about fuel?", answer: "magic" }]
  });
  expect(p).toContain("flying cars");
  expect(p).toContain("it will be great");
  expect(p).toContain("too expensive");
  expect(p).toContain("physics says no");
  expect(p).toContain("what about fuel?");
  expect(p).toContain("magic");
  expect(p).toContain("RATING:");
  expect(p).toContain("DECISION:");
  expect(p).toContain("QUESTIONS:");
  expect(p).toContain("TITLE:");
  expect(p).toContain("SPEC:");
});

test("parseChairman parses well-formed output", () => {
  const output = `Some preamble...
RATING: 8/10
DECISION: GO
QUESTIONS:
- Is it safe?
- How much?
TITLE: Build flying cars
SPEC:
Problem: traffic
Approach: up
`;
  const res = parseChairman(output);
  expect(res.rating).toBe(8);
  expect(res.decision).toBe("GO");
  expect(res.questions).toEqual(["- Is it safe?", "- How much?"]);
  expect(res.title).toBe("Build flying cars");
  expect(res.spec).toContain("Problem: traffic");
});

test("parseChairman parses garbage into safe defaults", () => {
  const res = parseChairman("asdf random text");
  expect(res.rating).toBe(0);
  expect(res.decision).toBe("NEEDS-INFO");
  expect(res.questions).toEqual([]);
  expect(res.title).toBe("Untitled council ticket");
  expect(res.spec).toBe("");
});

test("parseChairman takes the last anchored match, ignoring narration", () => {
  const output = `I think RATING: 9/10 and DECISION: GO.
Also the TITLE: should be something else.
But actually:
RATING: 2/10
DECISION: NO-GO
QUESTIONS:
- why?
TITLE: Bad idea
SPEC:
done.`;
  const res = parseChairman(output);
  expect(res.rating).toBe(2);
  expect(res.decision).toBe("NO-GO");
  expect(res.questions).toEqual(["- why?"]);
  expect(res.title).toBe("Bad idea");
  expect(res.spec).toBe("done.");
});

test("parseChairman questions cap at 5, break on non-bullet, empty if missing", () => {
  const out1 = `QUESTIONS:
- one
- two
- three
- four
- five
- six`;
  expect(parseChairman(out1).questions).toHaveLength(5);

  const out2 = `QUESTIONS:

- one
some text
- two`;
  expect(parseChairman(out2).questions).toEqual(["- one"]);

  const out3 = `RATING: 5/10`;
  expect(parseChairman(out3).questions).toEqual([]);
});

test("parseChairman title fallback to spec", () => {
  const out = `SPEC:

First line is here
Second line
`;
  const res = parseChairman(out);
  expect(res.title).toBe("First line is here");
  expect(res.spec.trim()).toContain("First line is here\\nSecond line");
});
