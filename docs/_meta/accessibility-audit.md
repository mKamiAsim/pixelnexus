# Accessibility audit

Phase 10 of `planning/PLAN.md`, done on 2026-10-17. This file is not part of the published site.

## Automated scans with axe

Rules: WCAG 2.0, 2.1 and 2.2 at levels A and AA. A serious or critical finding fails the test.

| Where | Test |
|---|---|
| The workspace in all five themes, with each panel tab of the default layout in front in turn | `a11y.spec.ts` |
| Export, Preferences, Resize, Rotate by angle and Keyboard shortcuts, in all five themes | `a11y.spec.ts` |
| The command palette | `a11y.spec.ts` |
| The selection dialogs and the Masks panel | `selection.spec.ts` |
| The filter panels | `filters.spec.ts` |
| Compare grid, AI providers, pipelines, the phone layout and the main studio | `compare`, `ai`, `pipeline`, `phone` and `studio` specs |

## Keyboard

Checked by tests in Chromium and Firefox:

- Tab moves through every part of the workspace, from the menus to the status bar, and every stop shows a focus ring of at least 2 px.
- An image can be opened, filtered and the step undone with the keyboard only.
- Each dialog closes with Escape, and the focus goes back into the studio.
- The command palette opens with Ctrl+K and runs a command with Enter.

## Found and fixed

| Problem | Fix |
|---|---|
| The canvas showed no focus ring. Its `outline-none` class won over the focus outline. | The focus outline sets its own style. |
| Panel tabs showed focus as a 1 px line in the border color, which is hard to see. | Panel tabs use the 2 px focus ring of the rest of the studio. |
| The menu bar triggers showed focus only by a faint background. | They show the focus ring. |
| After a dialog opened from a menu closed, the focus was lost on the page body, because the menu item that opened it was gone. | The focus goes to the image canvas, or to the menu bar when no image is open. |
| The list of keyboard shortcuts scrolled, but the keyboard could not reach it. | The list is a named region and a tab stop. |
| The panels come before the image in Tab order, and the Library alone has hundreds of buttons. Reaching the image took hundreds of key presses. | A "Skip to the image" button is the first tab stop. It shows only while it has focus. |

## Screen readers

Not tested with a real screen reader. That needs a person with NVDA, JAWS, VoiceOver or Orca. The automated checks cover what a screen reader relies on: every control has a name (axe), the page has banner, main and contentinfo landmarks, and results such as "Applied Gaussian filter" and "Undid Gaussian filter" are spoken through a live region, checked in many tests. A short test with a real screen reader is left for the owner before the release.
