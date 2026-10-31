# Dataset provenance — DimensionRouter vocabulary expansion (v1.3.0)

## What changed
`DimensionRouter`'s five `terms` seed lists (previously 9-10 hand-picked words each) were
expanded with real, empirically-derived vocabulary. Nothing else in the module changed —
still zero imports, zero network, zero `eval`/`new Function`, browser-compatible. The
dataset was used **offline, once, to generate a bigger static array**, not wired in as a
runtime dependency.

## Source dataset — actually downloaded and verified, not assumed
[GoEmotions](https://huggingface.co/datasets/google-research-datasets/go_emotions)
(`google-research-datasets/go_emotions`, raw config), pulled 2026-08-10 via the `datasets`
library: **211,225 real annotated rows**, 27 emotion categories + neutral, license
**Apache-2.0** — confirmed directly from the dataset card, safe for commercial use.

Two other datasets came up earlier in this conversation and were deliberately **not**
used here:
- **DailyDialog** — real, but licensed **CC BY-NC-SA 4.0** (non-commercial, share-alike).
- **EmpatheticDialogues** — real, but licensed **CC BY-NC 4.0** (non-commercial).

Both are fine for research/prototyping but not for a product meant to be commercial —
worth keeping in mind if either gets pulled in later for a different subsystem.

## Method — real, reproducible, not a black box
For each of the 27 real GoEmotions categories, computed word-vs-corpus **log-odds** over
the actual 211k rows (word frequency inside comments carrying that label, vs. background
frequency across the whole corpus; minimum-support thresholds applied to cut noise), took
the top-ranked real words per category.

## Mapping onto the 5 dimensions — Claude's own reasoned synthesis, flagged as such
The 27 GoEmotions categories are **not** part of the JUT/Human-Design source material this
project's dimension chains come from — there is no existing "correct" answer to map
against. This mapping is an editorial judgment call, made to be inspectable and easy to
revise, not a verified correspondence:

- **Movement** (Energy/Creation/Seeing — kinetic, activating): desire, excitement, fear,
  surprise, nervousness, anger
- **Evolution** (Gravity/Memory/Taste/Love — relational, across time): love, admiration,
  gratitude, grief, pride, optimism, caring
- **Being** (Matter/Touch/Sex/Survival — immediate embodied state): joy, sadness, disgust,
  embarrassment, amusement, relief
- **Design** (Structure/Progress/Life/Art — evaluating/building/correcting): approval,
  disapproval, disappointment, annoyance, confusion, curiosity, realization, remorse
- **Space** — deliberately given nothing from this dataset. Matches the already-established
  source-text principle that Space "does not play a part in these formulae" — it's the
  emergent dimension, not a fifth bucket to force categories into. `neutral` was excluded
  for the same reason (and its own log-odds words were mostly noise — a residual category
  has no real lexical signature).

## Cleanup applied on top of the real computed ranks
Manually dropped: apostrophe-bearing tokens (broke JS string literals), profanity/slurs
surfaced by real Reddit text, and a handful of proper nouns / platform artifacts
(subreddit names, "cakeday", etc.) that were real log-odds hits but not generalizable
signal. This is editorial curation layered on top of real data, not itself verified —
worth spot-checking the arrays in `src/integrated-tool-factory.mjs` directly.

## Verification actually performed
- `node --check` clean.
- Full suite re-run with the real `ato-core` (from `ato-mcp-v0_1-fixed.zip`) placed at the
  path `test/ato-native-bridge.test.mjs` expects: **11/11 passing**, including the native
  ATO-mounting tests (the original zip's own bundled test suite was 8/9 — the 9th file
  fails standalone because it expects a sibling `ato-core-native-test/` directory that
  wasn't included in this zip; that's a packaging gap, not a bug in this module).
- Real before/after routing comparison (not asserted — actually run against both the
  original and patched files): 4 real sentences using words nowhere in the original 9-word
  seed lists ("terrified", "anxious", "grateful", "proud", "disgusting", "embarrassing",
  "confused", "disappointed") — 3 of 4 came back `unresolved` (`NO_DIMENSION_MATCH`)
  against the original file, all 4 resolve correctly against the patched file.

## Honest limits
- Log-odds on Reddit text is a blunt instrument — some remaining words in the arrays are
  weaker signal than others (e.g. "battle", "adventure" under Movement) even after cleanup.
- The category→dimension mapping is a first pass, not user-confirmed. Easy to re-run
  `analyze.py`/`merge.py` (not shipped in this zip — ask if you want the pipeline itself
  delivered, not just the output) with a different mapping if any of it looks wrong once
  you see it working on real conversation text.
- This only touched `DimensionRouter`'s vocabulary. `PurposePlanner`'s `LEVEL_CUES` (which
  picks the 0-7 structural level) still has its original tiny per-level word lists —
  same kind of gap, not addressed this pass.

## v1.4.0 addition: each dimension's own real seed-gate vocabulary
On top of the GoEmotions layer (v1.3.0), each dimension now also carries real vocabulary
from its OWN already-assigned seed gate, pulled directly from Bradford Hatcher's *Yijing,
Word By Word* (Key Words + Glossary sections, extracted and verified against the actual
uploaded 1100-page book): Movement = Gate 1 (Qian, "Creating"), Evolution = Gate 2 (Kun,
"Accepting"), Being = Gate 6 (Song, "Contention"), Design = Gate 14 (Da You, "Big Domain"),
Space = Gate 20 (Guan, "Perspective"). This is more directly authoritative than the
GoEmotions mapping -- it isn't an inferred correspondence, it's this project's own
already-established gate-to-dimension assignment.

**Real bug found and fixed through testing, not assumed clean:** after merging, a real
test sentence ("she needs sovereignty and command over her own vocation" -- built from
Gate 1's own real vocabulary) incorrectly routed to Design instead of Movement. Traced
the cause precisely: generic function words ("over", "her", "own", "very", "has", "into",
etc. -- 16 total across all 5 dimensions) had slipped through the v1.3.0 GoEmotions
stopword filter and were diluting the router with false-positive matches carrying no real
dimensional signal. Removed them (keeping each dimension's own deliberate interrogative
seed word -- where/what/when/why/who -- those are intentional, not contamination). Re-ran
all 5 real test sentences after the fix: 5/5 now resolve to their intended dimension,
11/11 tests still pass.

## v1.5.0 addition: Design's seed gate from The Gnostic Book of Changes
Design's seed gate (14, "Wealth"/"Big Domain" depending on source) now also carries real
vocabulary from *The Gnostic Book of Changes* (Michael Servetus, pseudonym) -- extracted
and verified against the actual uploaded 973-page PDF. Only the hexagram's own name and
its compiled "Other titles" synonym list were extracted (10 real words after stopword
cleanup: wealth, possession, great, measure, symbol, sovereignty, having, possessing,
possessor, abundance).

**Deliberately much thinner than the Hatcher/Movement extraction, for a real reason, not
an oversight:** this book's actual substance -- the Judgment/Image/Commentary and every
line of every hexagram -- is compiled side-by-side quotation from many real, modern,
still-copyrighted translations (Wilhelm/Baynes 1950, Blofeld 1965, Liu 1975,
Ritsema/Karcher, Shaughnessy, Cleary, Wu, and others), not this editor's own original
dictionary-style material the way Hatcher's Key Words/Glossary sections were. Bulk-pulling
even short per-line excerpts across 64 hexagrams x 6 lines x ~9 translators would aggregate
into large-scale reproduction of several other people's copyrighted work, so it wasn't
done. The one real, safe exception not yet taken: Legge's 1899 translation is public
domain and could be pulled in later if wanted.

## v1.6.0 addition: Evolution's seed gate, hand-verified only (not scaled to 64)
Evolution's seed gate (2, Kun/"Receptiveness") now carries 15 real words pulled directly
from Hua-Ching Ni's *The Book of Changes and the Unchanging Truth* (the actual uploaded
scan, pdfcoffee_com_i-ching-book-of-changes-pdf-free.pdf, 702 pages) -- confirmed as the
real book (copyright 1983/1990/1994 Hua-Ching Ni, Sevenstar Communications).

**Why this one stopped at a single gate instead of scaling to all 64 like Movement and
Design did:** this scan's OCR quality is materially worse than the previous two uploads --
e.g. the hexagram header for Gate 2 reads `[2J - Kun (Receptiveness)` (bracket close
corrupted to a capital J), and a full-document sweep for the bracket-number header pattern
only reliably matched 18-32 of 64 hexagrams depending on how loose the regex was made.
Rather than ship a full 64-entry dataset with an unknown number of silently misattributed
entries, only Gate 2 was extracted, by directly reading pages 241-247 rather than trusting
a regex sweep. Real content confirmed there: the hexagram's own descriptive sentence
("receptive, motherly and gentle, giving support to everyone... selflessly") plus three
divination-guidance fields (TRAVEL, DISEASE, PERSONAL WISH) that this book uses per
hexagram -- a genuinely different structural pattern from both Hatcher's Key
Words/Glossary and the Gnostic book's Other-titles list. Scaling this to all 64 hexagrams
is possible but will need hexagram-by-hexagram verification rather than one clean sweep,
given the OCR reality -- not done this pass.
