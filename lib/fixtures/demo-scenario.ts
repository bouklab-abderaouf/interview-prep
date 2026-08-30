// Phase 1 §5.2 — hardcoded fake CV (mid-level frontend engineer) + fake JD
// for the no-auth demo. Deliberately includes a few rough edges — an
// understated seniority gap, Docker vs Kubernetes, an unexplained career
// gap, a short stint at a startup that shut down — so even this Phase 1
// interviewer has real material to probe. §6's risk_questions in Phase 2
// automates finding these; here they're just written in by hand.

export interface DemoScenario {
  candidateName: string;
  cvSummary: string;
  jdSummary: string;
}

export const demoScenario: DemoScenario = {
  candidateName: "Alex Moreau",
  cvSummary:
    "Alex Moreau, Frontend Engineer, 4 years of experience. Currently at Bramblewick Retail (1.5 years): rebuilt the checkout flow in React and TypeScript, cutting cart abandonment by 12%. Before that, 6 months at Kindling Labs, a seed-stage startup that shut down. There is an unexplained 8-month gap on the CV between Kindling Labs and the previous role. Earlier: 2 years at Verdant Systems building and maintaining an internal design system with React, Redux, and Jest. Comfortable with basic Docker for local dev environments. No production Kubernetes or CI/CD pipeline ownership experience.",
  jdSummary:
    "Senior Frontend Engineer at Northwind Labs. Requires 5+ years of experience, ownership of a Kubernetes-based deployment pipeline, GraphQL API integration experience, and leading a small team of 2-3 engineers. Nice to have: design systems experience, e-commerce domain background.",
};
