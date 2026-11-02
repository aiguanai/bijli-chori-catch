# Electricity theft detection: project specification

Sep 30, 2026 · @You are the best

A two-layer system that finds electricity theft in smart meter data: a stream processing layer watches 42,372 consumers continuously and raises cheap alerts, and an agentic AI layer investigates each alert by gathering evidence and deciding whether it is theft, a fault, or a vacant house. Built for a two-month, four-person final-year project covering both stream processing and agentic AI.

## Problem statement

Electricity theft means consuming power that is never billed, usually by tampering with a meter so it under-records, or by hooking directly onto the distribution line and bypassing the meter altogether. Utilities call the resulting gap non-technical loss, to separate it from the technical loss that is simply heat in the wires.

The detection problem is hard for two reasons. Theft is rare, so any detector that flags too freely wastes limited inspection crews on innocent households. And a drop in consumption has many innocent explanations: the family moved out, went abroad for a month, replaced an old air conditioner, or the meter genuinely failed.

This system separates the two jobs. A stream processing layer watches every consumer continuously and raises cheap, deliberately over-sensitive alerts. An agentic AI layer then investigates each alert by gathering evidence and reasoning about which explanation fits, producing a ranked case file rather than a raw flag.

The practical output is a prioritised inspection list: given limited crews, which addresses should be visited first, and why.

## Dataset

The project uses the SGCC dataset, released by the State Grid Corporation of China alongside a 2018 IEEE paper. It is the standard public benchmark for this problem, and critically it carries confirmed theft labels, which almost no dataset in this space does.

| Property | Value |
| --- | --- |
| Consumers | 42,372 |
| Period | 1 Jan 2014 to 31 Oct 2016 |
| Readings per consumer | 1,035 daily values |
| Label | FLAG column, 0 = normal, 1 = confirmed theft |
| Theft rate | about 8.5% |
| Size | roughly 163 MB as CSV |
| Source | [Kaggle mirror](https://www.kaggle.com/datasets/bensalem14/sgcc-dataset) |

### Known problems to handle

The raw file has substantial missing values, which is normal for real meter data. Fill short gaps by interpolation and drop consumers missing more than about 20% of their readings.

The classes are heavily imbalanced at roughly 11 normal consumers per thief. Report precision, recall and AUC rather than accuracy, since a model predicting "never theft" scores 91.5% accuracy and is useless.

Resolution is daily, not hourly. This is enough for the detectors described below, but it means your stream is a replay rather than live capture.

### Turning it into a stream

A replay script reads the file column by column and publishes one day of readings for all consumers into Kafka, then sleeps. Compress time so one second of wall clock equals one simulated day, which replays the full 1,035 days in about 17 minutes and makes a good live demo.

Each message is keyed by consumer ID so that Flink can maintain per-consumer state. Sample down to between 500 and 2,000 consumers for the working system; the full 42,372 is unnecessary for a project and makes the agent layer expensive.

### Data you will generate yourself

Three supporting tables do not exist in SGCC and must be synthesised. This is realistic, since every utility has them, and generating them is a legitimate part of the project.

- **Feeder assignment** — group consumers into synthetic feeders of about 50, so neighbourhood comparison and loss reconciliation become possible
- **Meter event log** — communication outages, cover-open flags and power-fail events, seeded more often before labelled theft so the signal is learnable
- **Inspection history** — past visits and their outcomes, used by the agent and by the feedback loop

## System architecture

&#91;embedded content: system architecture · stream layer above, agent layer below\]

The critical design decision is that the language model never sees the raw stream. Flink processes every reading cheaply; the agent only ever sees the few hundred alerts Flink raised. Running an LLM on all 42,372 consumers for 1,035 days would mean 43 million calls, which is both slow and financially absurd.

The arrow from the evidence store back to the agent is the investigation loop: the agent calls a tool, reads the result, and decides what to ask next. That loop is what makes the system agentic rather than a single classification call.

## Stream processing layer

Five detectors run in Flink, all keyed by consumer ID so each consumer carries its own state. They are deliberately over-sensitive: it is the agent's job to filter, not theirs. Start with the thresholds below and tune them against the labels.

| Detector | What it catches | Window | Starting threshold |
| --- | --- | --- | --- |
| Sustained drop | Meter bypass or tampering | 30-day sliding | Falls 40% below trailing mean, holds 7+ days |
| Variance collapse | Frozen or tampered meter | 21-day sliding | Rolling standard deviation under 5% of mean |
| Seasonal decoupling | Partial tampering | 60-day sliding | Correlation with feeder mean drops below 0.3 |
| Changepoint (CUSUM) | Slow, gradual theft | Cumulative | CUSUM statistic exceeds 5 sigma |
| Feeder reconciliation | Theft somewhere in a group | Daily tumbling | Non-technical loss exceeds 8% for 5+ days |

### Why feeder reconciliation is the interesting one

The first four detectors look at one consumer in isolation. Feeder reconciliation compares two streams: the feeder meter upstream and the sum of the household meters beneath it.

Generate the feeder reading as the sum of true consumption plus a technical loss of about 5%, then add the theft back in. When the measured gap widens beyond that baseline, energy is disappearing somewhere in that group of 50.

This detector cannot name a culprit, which is exactly why it is valuable. It hands the agent a genuinely ambiguous problem that requires cross-referencing several consumers to resolve.

### Practical notes

Use event time rather than processing time, with the reading date as the timestamp. This is good practice and easy marks in a stream processing course.

Keep per-consumer state in Flink's keyed state with RocksDB as the backend, and enable checkpointing so you can demonstrate recovery after a crash. Killing the job mid-replay and watching it resume is a strong demo moment.

Alerts are deduplicated before they reach the agent. A consumer that trips three detectors in the same week should produce one alert carrying all three signals, not three separate investigations.

## Agentic AI layer

The agent receives an alert and investigates it by calling tools, choosing each next call based on what the last one returned. It stops when it has enough evidence to commit to a verdict.

### The tool set

Each tool is a Postgres query behind a function signature. Nothing here is exotic; the intelligence is in the choosing, not the tools.

| Tool | Returns | Why the agent needs it |
| --- | --- | --- |
| `get_consumption_history` | The raw daily series | Establishes when the change began and its shape |
| `get_neighbour_baseline` | Peer median on the same feeder | Separates a household change from a area-wide one |
| `get_weather` | Temperature over the window | Explains seasonal drops innocently |
| `get_consumer_metadata` | Tariff, sanctioned load, premises type | A tariff change or small connection reframes the drop |
| `get_meter_events` | Comms gaps, cover-open, power-fail flags | Tampering often follows a communication outage |
| `get_inspection_history` | Past visits and outcomes | A recent clean inspection lowers suspicion |
| `get_feeder_loss` | Non-technical loss over time | The decisive test: is energy actually missing upstream? |
| `find_similar_cases` | Nearest resolved cases | Gives the agent memory across investigations |
| `create_inspection_ticket` | Writes a case | The only action with consequences |

### The loop

Write this as a plain tool-calling loop of roughly forty lines rather than reaching for a framework. In a viva you can explain every line of your own loop; you cannot do that with LangGraph.

1. Receive the alert and build the initial prompt from it
2. Call the model with the tool definitions attached
3. If the model requests a tool, execute it and append the result to the message history
4. Repeat until the model returns a verdict instead of a tool call, or a cap of about 10 iterations is reached
5. Parse the verdict into a confidence score, a list of evidence items and a recommended action
6. If confidence exceeds the threshold, draft a ticket and hold it for human approval

### The permission boundary

Reading evidence is autonomous. Creating an inspection ticket requires human approval. This boundary is a design decision worth defending explicitly, because accusing a household of theft has real consequences and the system should never do it unsupervised.

Have the agent write about meters and consumption, never about a person's guilt. "Consumer 3F2A91 shows consumption inconsistent with feeder loss" is defensible; "this customer is stealing" is not.

### Optional second agent

If time allows, add a feeder correlation agent that wakes when a feeder's loss spikes and asks which combination of consumers accounts for the missing energy. It reasons across many entities rather than one, which strengthens the agentic claim considerably. Treat it as a stretch goal, not a requirement.

## Worked example

Two alerts look identical to the stream layer and receive opposite verdicts from the agent. Build the demo around this contrast, because it is the clearest possible proof that the agent adds something a classifier cannot.

### Case A: consumer 3F2A91, 55% sustained drop

The agent pulls the consumption history and finds the drop began on day 397, falling from about 14 kWh per day to 6, and holding steady since. It checks the weather and finds no temperature change that would explain it.

It then pulls the neighbour baseline and finds peers on the same feeder actually rose 12% over the same window, because it was summer. Meter events show a three-day communication outage ending exactly on day 397.

The decisive check is feeder loss, which climbed from 6% to 11% starting day 398, and the magnitude roughly matches this consumer's missing energy.

**Verdict:** high confidence, inspection ticket drafted at high priority.

### Case B: consumer 8B10C4, 70% sustained drop

The alert is larger and the history looks similar. But meter events are clean, and crucially feeder loss is flat over the whole window.

If energy is not disappearing upstream, nobody downstream is stealing it. The agent concludes the premises is most likely vacant.

**Verdict:** dismissed, routed to billing for an occupancy check rather than an inspection crew.

### Why this matters for the report

The deterministic detector cannot separate these two cases, because on the single consumer's own series they look the same. The agent separates them by going and fetching a different piece of evidence, and it only knew to fetch feeder loss because the earlier checks came back inconclusive.

That is the difference between a classifier and an agent, and it is the single strongest point you can make in the presentation.

## Technology stack

| Layer | Choice | Why |
| --- | --- | --- |
| Message broker | Redpanda | Kafka-compatible API, far lighter on a laptop, single binary |
| Stream processor | Flink, via PyFlink or Flink SQL | Event time, keyed state and checkpointing are what the course wants |
| Evidence store | PostgreSQL, or TimescaleDB | The agent's tools are just queries against this |
| Agent runtime | Plain Python tool-calling loop | Explainable in a viva; a framework is not |
| Similar-case memory | ChromaDB or FAISS | Optional, only if you build `find_similar_cases` |
| Dashboard | Streamlit | Fastest path to a demo UI; React only if someone already knows it |
| Orchestration | Docker Compose | One command brings the whole system up for the demo |

### Notes on the choices

Use Redpanda unless your course specifically requires Apache Kafka. It speaks the same protocol, so every Kafka tutorial still applies, but it runs comfortably on a student laptop.

Flink SQL is a gentler entry than the DataStream API and covers four of the five detectors. Drop into PyFlink only for the CUSUM detector, which needs custom state.

Docker Compose matters more than it looks. A demo that fails because someone's machine is missing a dependency is a bad afternoon, and a single compose file removes that risk entirely.

## Evaluation plan

The two layers are measured differently, and saying so explicitly is worth marks on its own.

### Measuring the detector

Because SGCC carries labels, you can report real numbers. Hold out 25% of consumers as a test set and report precision, recall, F1 and AUC.

Never report accuracy alone. With an 8.5% theft rate, a model that predicts "never theft" scores 91.5% and catches nothing, and an examiner who spots that will not be gentle.

Report each detector separately as well as combined, so you can show which signal carries the most weight.

### Measuring the agent

The agent is not a classifier, so classification metrics fit awkwardly. Measure it three ways instead.

- **False positive reduction** — of the alerts Flink raised, what share did the agent correctly dismiss? This is the number that justifies the whole layer
- **Verdict agreement** — on a sample of 50 cases, do the agent's verdicts match the ground truth labels?
- **Evidence quality** — for 20 cases, manually check whether the cited evidence actually supports the conclusion. Catching the agent citing something that does not support its verdict is a genuinely good finding to report

### A useful baseline

Run the same alerts through a single LLM call with no tools, given only the alert text. Compare its verdicts against the full agent's.

This directly measures what the tool-calling loop bought you, and it is the cleanest way to answer an examiner who asks whether the agent was necessary.

## Eight-week plan

The governing principle: build the boring end-to-end skeleton first, even when every component in it is stupid. A working pipeline you improve beats four excellent pieces that never connect. Aim to have data flowing from replay to a printed alert by the end of week two.

| Week | Focus | Deliverable | Owner |
| --- | --- | --- | --- |
| 1 | Setup and data | Docker Compose up, SGCC loaded and cleaned, feeders assigned |  |
| 2 | Skeleton pipeline | Replay publishing to Redpanda, Flink consuming, one threshold rule printing alerts |  |
| 3 | Real detectors | All five detectors implemented, alerts written to Postgres |  |
| 4 | Detector tuning | Thresholds tuned against labels, precision and recall reported |  |
| 5 | Agent tools | All eight query tools built and tested standalone |  |
| 6 | Agent loop | Tool-calling loop working end to end, verdicts stored |  |
| 7 | Dashboard and evaluation | Streamlit UI, agent metrics, no-tools baseline comparison |  |
| 8 | Report and demo | Report written, demo rehearsed, contingency recording made |  |

### Splitting the work across four people

One person on data and replay, one on Flink detectors, one on the agent layer, one on the dashboard and evaluation. The interfaces between them are the Kafka topic and the Postgres schema, so agree both in week one and do not change them casually.

Everyone should be able to explain the whole system, not just their part. Examiners ask the person who did the dashboard about the CUSUM detector.

### Demo rehearsal

Record a working run in week seven as insurance. Live demos fail, and a recording you can fall back on is the difference between a bad five minutes and a disaster.

The demo sequence that works: start the replay, show alerts appearing in the dashboard, pause on Case A, walk through the agent's tool calls one by one, then show Case B reaching the opposite verdict.

## Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Flink proves too heavy to learn in time | Switch to Kafka Streams, or Faust in Python. You lose some marks on sophistication, not on correctness |
| LLM API costs run away | Cap the agent at 50 investigations, or run a small local model through Ollama |
| Detectors flag almost everyone | Expected at first. Raise thresholds until roughly 15% of consumers are flagged, then let the agent filter |
| Agent hallucinates evidence | Make every tool return structured data, and have the agent cite tool call IDs in its verdict so claims are checkable |
| The team runs out of time in week 7 | Cut the second agent, `find_similar_cases`, and the dashboard polish. Never cut the evaluation |
| Live demo fails on the day | Play the week-seven recording |

### The two most likely failures

**Spending three weeks on detector accuracy.** It is tempting because it is measurable and feels like progress. But the project is graded on two subjects, and a beautiful detector with no agent fails half of it. Freeze the detectors at the end of week four whatever their numbers look like.

**Building the agent as a single prompt.** If the agent makes one call that returns a verdict, it is not agentic and an examiner will say so. The loop, with the model choosing tools across several turns, is the whole point. Build it as a loop from the first day even if it only has two tools.

## Defending the project

The questions examiners actually ask, and the answers.

**"Why is this agentic and not just an LLM call?"**

The tool sequence is not fixed. Case A pulled meter events because the drop was abrupt; a gradual drop would have sent the agent to weather and tariff history instead. It chooses its next action based on what the last one returned, decides when it has enough to stop, and takes a consequential action under a permission boundary. Point at the no-tools baseline in your evaluation as evidence.

**"Why not just run the LLM on all the data?"**

42,372 consumers across 1,035 days is 43 million readings. One LLM call each is impossibly slow and expensive. Flink handles volume; the agent handles the few hundred cases that need judgement. This separation is the core design decision.

**"Is this really streaming if you are replaying a file?"**

The pipeline does not know or care. Readings arrive one at a time, in event-time order, and are processed with windows, keyed state and watermarks exactly as live data would be. Replay is standard practice for reproducible evaluation, since you cannot rerun a live stream. If you added the smart-plug feed, mention it here.

**"What happens if the agent is wrong?"**

Nothing automatic. Tickets are drafted, not dispatched, and a human approves before anyone is inspected. The agent reports on meters and consumption, never on a person's guilt.

**"How do you know the agent helped?"**

The false positive reduction number, and the no-tools baseline comparison. Both are in the evaluation section.

**"What would you do differently with more time?"**

Have a real answer ready. Good ones: hourly rather than daily resolution would catch time-of-day theft patterns; the feeder correlation agent would let you find organised theft rather than individual cases; a proper active learning loop would let inspection outcomes retrain the detectors automatically.

## Sources

- [SGCC dataset, Kaggle mirror](https://www.kaggle.com/datasets/bensalem14/sgcc-dataset) — 42,372 consumers, 1,035 daily readings, FLAG column carrying theft labels
- [SGCC dataset, original release](https://github.com/henryRDlab/ElectricityTheftDetection) — the authors' own repository, which asks that you cite the paper below
- Zheng, Yang, Niu, Dai and Zhou, "Wide and Deep Convolutional Neural Networks for Electricity-Theft Detection to Secure Smart Grids", IEEE Transactions on Industrial Informatics, vol. 14, no. 4, 2018, pp. 1606–1615 — the paper the dataset was released with, and your primary citation

### Worth reading for the literature review

Search for recent work benchmarking against SGCC; there is a substantial body of it, which is useful for your related-work section and gives you published numbers to compare your own results against. Ensemble methods feeding unsupervised anomaly scores into a gradient-boosted classifier are a commonly reported strong baseline.

No published work combines this dataset with an agentic investigation layer, which is a fair novelty claim for your report.
