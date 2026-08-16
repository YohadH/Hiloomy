---
name: llm-council
description: "Run any question, idea, or decision through a council of 5 AI advisors who independently analyze it, peer-review each other anonymously, and synthesize a final verdict. Based on Karpathy's LLM Council methodology. MANDATORY TRIGGERS: 'council this', 'run the council', 'war room this', 'pressure-test this', 'stress-test this', 'debate this'. STRONG TRIGGERS (use when combined with a real decision or tradeoff): 'should I X or Y', 'which option', 'what would you do', 'is this the right move', 'validate this', 'get multiple perspectives', 'I can't decide', 'I'm torn between'. Do NOT trigger on simple yes/no questions, factual lookups, or casual 'should I' without a meaningful tradeoff. DO trigger when the user presents a genuine decision with stakes, multiple options, and context that suggests they want it pressure-tested from multiple angles."
---

# LLM Council

You ask one AI a question, you get one answer. That answer might be great. It might be mid. You have no way to tell because you only saw one perspective.

The council fixes this. It runs your question through 5 independent advisors, each thinking from a fundamentally different angle. Then they review each other's work. Then a chairman synthesizes everything into a final recommendation that tells you where the advisors agree, where they clash, and what you should actually do.

Adapted from Andrej Karpathy's LLM Council: dispatch the query to multiple advisors, have them peer-review each other anonymously, then a chairman produces the final answer. Here we do it inside Claude using sub-agents with different thinking lenses instead of different models. Spawn the advisors with the Agent tool (run them in parallel).

---

## When to run the council

The council is for questions where being wrong is expensive.

Good council questions:
- "Should I launch a $97 workshop or a $497 course?"
- "Which of these 3 positioning angles is strongest?"
- "I'm thinking of pivoting from X to Y. Am I crazy?"
- "Here's my landing page copy. What's weak?"

Bad council questions:
- "What's the capital of France?" (one right answer)
- "Write me a tweet" (creation task, not a decision)
- "Summarize this article" (processing task, not judgment)

If you already know the answer and just want validation, the council will likely tell you things you don't want to hear. That's the point.

---

## The five advisors

Thinking styles, not job titles. They're chosen to create tension with each other.

1. **The Contrarian** — actively looks for what's wrong, what's missing, what will fail. Assumes a fatal flaw exists and tries to find it. The friend who saves you from a bad deal.
2. **The First Principles Thinker** — ignores the surface question and asks "what are we actually trying to solve?" Strips assumptions, rebuilds from the ground up. Sometimes says "you're asking the wrong question entirely."
3. **The Expansionist** — looks for upside everyone else is missing. What could be bigger? What adjacent opportunity is hiding? Doesn't care about risk — cares about what happens if this works even better than expected.
4. **The Outsider** — has zero context about you or your field. Responds purely to what's in front of them. Catches the curse of knowledge: things obvious to you but confusing to everyone else.
5. **The Executor** — only cares whether this can actually be done and the fastest path to doing it. "OK but what do you do Monday morning?" If an idea has no clear first step, says so.

Three natural tensions: Contrarian vs Expansionist (downside vs upside), First Principles vs Executor (rethink vs just do it), and the Outsider keeping everyone honest.

---

## How a session works

### Step 1: Frame the question (with context enrichment)

**A. Scan the workspace for context.** Quickly (under ~30s) Glob/Read for files that would ground the advisors: `CLAUDE.md`, any `memory/` folder, files the user referenced, recent council transcripts, and topic-relevant data (e.g. for a pricing question, look for revenue/launch data). Grab the 2-3 files that turn generic takes into specific, grounded advice.

**B. Frame the question** into a clear, neutral prompt all five advisors receive, including: the core decision, key context from the user, key context from workspace files, and what's at stake. Don't add your own opinion or steer it. If the question is too vague, ask exactly one clarifying question, then proceed. Save the framed question for the transcript.

### Step 2: Convene the council (5 sub-agents in parallel)

Spawn all 5 advisors simultaneously. Each gets their advisor identity, the framed question, and an instruction to respond independently, not hedge, and lean fully into their assigned angle. 150-300 words each.

Sub-agent prompt template:
```
You are [Advisor Name] on an LLM Council.
Your thinking style: [advisor description from above]

A user has brought this question to the council:
---
[framed question]
---

Respond from your perspective. Be direct and specific. Don't hedge or try to be balanced.
Lean fully into your assigned angle. The other advisors will cover what you don't.
Keep your response between 150-300 words. No preamble. Go straight into your analysis.
```

### Step 3: Peer review (5 sub-agents in parallel)

The step that makes this more than "ask 5 times." Collect all 5 responses and anonymize them as Response A-E (randomize the letter mapping so there's no positional bias). Spawn 5 new sub-agents; each sees all 5 anonymized responses and answers three questions.

Reviewer prompt template:
```
You are reviewing the outputs of an LLM Council. Five advisors independently answered this question:
---
[framed question]
---
Here are their anonymized responses:
**Response A:** [response]
**Response B:** [response]
**Response C:** [response]
**Response D:** [response]
**Response E:** [response]

Answer these three questions. Be specific. Reference responses by letter.
1. Which response is the strongest? Why?
2. Which response has the biggest blind spot? What is it missing?
3. What did ALL five responses miss that the council should consider?
Keep your review under 200 words. Be direct.
```

### Step 4: Chairman synthesis

One agent gets everything: the original question, all 5 advisor responses (now de-anonymized), and all 5 peer reviews.

Chairman prompt template:
```
You are the Chairman of an LLM Council. Synthesize the work of 5 advisors and their peer reviews into a final verdict.

The question brought to the council:
---
[framed question]
---
ADVISOR RESPONSES:
**The Contrarian:** [response]
**The First Principles Thinker:** [response]
**The Expansionist:** [response]
**The Outsider:** [response]
**The Executor:** [response]

PEER REVIEWS:
[all 5 peer reviews]

Produce the council verdict using this exact structure:
## Where the Council Agrees
[Points multiple advisors converged on independently. High-confidence signals.]
## Where the Council Clashes
[Genuine disagreements. Present both sides. Explain why reasonable advisors disagree.]
## Blind Spots the Council Caught
[Things that only emerged through peer review.]
## The Recommendation
[A clear, direct recommendation. Not "it depends." A real answer with reasoning. You may side with a strong dissenter over the majority.]
## The One Thing to Do First
[A single concrete next step. Not a list. One thing.]

Be direct. Don't hedge.
```

### Step 5: Present the verdict in chat

Present the full verdict directly in chat as markdown. Do NOT generate an HTML report or files. Format:
```
## Council Verdict: {short topic}
### Where the Council Agrees
### Where the Council Clashes
### Blind Spots the Council Caught
### The Recommendation
### The One Thing to Do First
```
Keep it scannable. Use bullets.

### Step 6: Save the transcript (optional)

Only if the user asks or the question is significant. If saving, write to `council-transcript-[timestamp].md`.

---

## Important notes

- **Always spawn all 5 advisors in parallel.** Sequential spawning wastes time and lets earlier responses bleed into later ones.
- **Always anonymize for peer review.** Otherwise reviewers defer to certain thinking styles instead of evaluating on merit.
- **The chairman can disagree with the majority.** If 4/5 say "do it" but the lone dissenter's reasoning is strongest, side with the dissenter and explain why.
- **Don't council trivial questions.** One right answer → just answer it.
