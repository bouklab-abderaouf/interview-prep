// Phase 3 §7.4 — /sample-scorecard is meant to use "a real scorecard of
// mine" per the spec. No real interview has been run yet, so this is a
// plausible placeholder in the exact Scorecard shape — swap for a real one
// once available.
export const sampleScorecard = {
  overall: 78,
  stars: 2,
  xp_awarded: 132,
  star: { situation: 82, task: 75, action: 80, result: 70 },
  relevance: 81,
  communication: {
    clarity: 74,
    pace_wpm: 152,
    filler_rate: 2.1,
    talk_ratio: 0.64,
    longest_pause_ms: 2400,
  },
  strengths: [
    {
      point: "Concrete ownership of a measurable outcome",
      quote_from_answer:
        "I rebuilt the checkout flow in React and TypeScript, which cut cart abandonment by twelve percent.",
    },
    {
      point: "Honest about the limits of past experience",
      quote_from_answer: "I haven't run Kubernetes in production myself, only read about it.",
    },
  ],
  improvements: [
    {
      point: "Answer to the system design question stayed too high-level",
      why_it_matters: "The interviewer was looking for concrete tradeoffs, not a textbook diagram.",
      what_to_say_instead:
        "Name the actual bottleneck you'd hit first and the specific tradeoff you'd make to fix it.",
    },
  ],
  model_answers: [
    {
      question: "Tell me about a time you disagreed with a technical decision.",
      strong_answer:
        "At Bramblewick Retail, I disagreed with moving checkout state into Redux mid-migration. I raised it in a design review with a smaller diff showing local state would cut the change by half, we agreed to try it on one flow first, and it shipped a week faster than the original plan would have.",
    },
  ],
  per_question: [
    {
      question: "Tell me about a project you're proud of.",
      bank_index: 0,
      score: 86,
      verdict: "Clear ownership and a measurable result, delivered in under a minute.",
    },
    {
      question: "How would you scale the checkout service for a flash sale?",
      bank_index: 3,
      score: 58,
      verdict: "Named the right components but never committed to a tradeoff.",
    },
  ],
  turns: [
    {
      role: "interviewer" as const,
      transcript: "Tell me about a project you're proud of.",
      start_ms: 4200,
      end_ms: 7100,
    },
    {
      role: "candidate" as const,
      transcript:
        "I rebuilt the checkout flow in React and TypeScript, which cut cart abandonment by twelve percent.",
      start_ms: 9500,
      end_ms: 16800,
    },
  ],
};
