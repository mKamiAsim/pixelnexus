# PixelNexus writing style

Version 1. Created 2026-10-11.

These rules apply to every page in `docs/`, to all text inside the studio (Learn panel, tooltips, messages, glossary), to the catalog YAML text fields, and to the README. They come from the project owner's request: a natural human tone, short sentences, easy English, and clear professional diagrams.

`tools/lint_prose.py` checks the rules marked **(checked)**. The rest are checked in review.

## 1. Sentences and words

1. Keep sentences short. Aim for 8 to 20 words. One idea per sentence. **(checked: warns above 30 words)**
2. Use plain, common words. Write "use", not "utilize". Write "help", not "facilitate".
3. Define each technical term the first time you use it on a page. Link it to the glossary.
4. Use the active voice. Write "The filter replaces each pixel". Do not write "Each pixel is replaced by the filter".
5. Talk to the reader as "you" in guides. Use neutral statements in reference pages.
6. Start with the point. No warm-up sentences, no rhetorical questions.
7. Do not use "simply", "just", "easy", "obviously" or "of course". They make readers feel slow. **(checked)**
8. Use American English spelling: color, normalize, gray, neighbor, center, license. This matches the requirements and most image processing books. **(checked for common British spellings)**

## 2. Punctuation and characters

1. No em dashes (—). No en dashes (–) as punctuation. No double hyphens (--) in prose. Use a full stop or a comma instead. **(checked)**
2. In names, use a plain hyphen: Richardson-Lucy, Frei-Chen, Perona-Malik, Marr-Hildreth.
3. For ranges, write "3 to 15", not "3-15".
4. Avoid semicolons. Split the sentence instead. **(checked: warns)**
5. No exclamation marks. No emoji. **(checked)**
6. Use straight quotes ("), not curly quotes. **(checked)**
7. Write sizes as "3x3" in prose. Use `3 \times 3` inside maths.
8. Command-line flags inside code blocks or backticks are fine, for example `mkdocs build --strict`.

## 3. Words and patterns to avoid

These words and patterns make text sound machine-written or like marketing. Do not use them. **(checked)**

- Filler links: moreover, furthermore, additionally, in addition, notably, importantly, overall, in conclusion, ultimately, that said, it is worth noting, needless to say.
- Hype words: seamless, powerful, cutting-edge, state-of-the-art, game-changer, leverage, utilize, delve, comprehensive, crucial, pivotal, elevate, unlock, empower, journey, landscape, realm, tapestry, intricate, holistic, effortless, streamline, robust.
- "Robust" is allowed only in its statistical meaning, for example "robust estimator".
- Patterns: "not just X, but Y", "X isn't just A, it's B", "Let's dive in", "In this section, we will explore".
- Lists of three used only for rhythm.

## 4. Structure

1. Headings use sentence case: "How it works", not "How It Works".
2. Use bullets for facts and steps. Use short paragraphs for explanations.
3. Use bold only for UI labels and for a key term at its definition. Do not bold random phrases.
4. Put code, file paths, ids and parameter keys in backticks.
5. Every filter page uses the template in PLAN.md section 7.2.
6. Do not repeat the README on other pages. Link to it.

## 5. Mathematics

1. Write every formula in LaTeX that both KaTeX and MathJax support.
2. After each formula, add a "where" list that defines every symbol.
3. Explain what the formula does to the pixels, in one or two plain sentences.
4. State the assumptions, for example the noise model or the boundary condition.
5. Label each formula: exact computation, mathematical definition, approximation or simplified explanation.
6. Show kernels as LaTeX matrices or tables. Never as pictures.
7. Kernels and numbers in docs come from the real code, through the generator. Never type them by hand.

## 6. Diagrams and figures

The owner asked for professional figures with no overlapping labels. Follow every rule below.

**Mermaid diagrams**

1. Use Mermaid only for flows and architecture.
2. At most 12 nodes per diagram. Split larger ideas into two diagrams.
3. Node labels have at most 4 words. Edge labels have at most 2 words.
4. Use `LR` for flows and `TB` for hierarchies. Avoid crossing edges.
5. Mark optional parts with a dashed edge or the word "optional".

**Generated figures and plots**

1. Generate every figure with a script in `tools/figures/`. Never draw by hand.
2. Use data from the real implementation.
3. Export SVG with a fixed size. Make a light and a dark version (`#only-light`, `#only-dark`).
4. Minimum text size is 12 px at the displayed width.
5. Leave at least 8 px between any two labels. Labels never touch lines, arrows or other labels.
6. Use the Okabe-Ito palette for lines and cividis or viridis for heat maps. They are safe for color-blind readers.
7. One message per figure. Use as few labels as possible.
8. Every figure has alt text and a one-sentence caption.

**Visual check**

1. Build the site and open each changed page in a browser.
2. Check at 1280 px and 390 px width, in light and dark themes.
3. Look for overlaps, clipped labels and unreadable text. Fix them before the page is done.
4. Record the check in the figure checklist (`docs/_meta/figure-checklist.md`).

## 7. Claims

1. Never claim speed without a recorded benchmark.
2. Never claim a test passes unless it has run and passed.
3. Never call a filter available if its status is planned or unsupported.
4. Cite real sources only. No invented papers, authors, DOIs or links.
5. When a method only approximates the original paper, say so on the page.

## 8. Example

Not like this:

> The Median filter is a powerful, robust nonlinear technique — it seamlessly removes impulse noise while preserving edges; moreover, it is widely used.

Like this:

> The median filter replaces each pixel with the middle value of its neighbors. One very bright or very dark pixel cannot pull the result, because it ends up at the edge of the sorted list. This is why the median filter removes salt-and-pepper noise and keeps edges sharp.
