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
| The canvas showed no focus ring. Its `outline-none` class won. | The focus outline sets its own style. |
| Panel tabs showed focus as a faint 1 px line. | They use the 2 px focus ring. |
| The menu bar triggers showed focus only by a faint background. | They show the focus ring. |
| A dialog opened from a menu gave the focus back to the page body on close. The menu item that opened it was gone. | The focus goes to the image canvas. With no image open, it goes to the menu bar. |
| The list of keyboard shortcuts scrolled, but the keyboard could not reach it. | The list is a named region and a tab stop. |
| The panels come before the image in Tab order. The Library alone has hundreds of buttons. | A "Skip to the image" button is the first tab stop. It shows only while it has focus. |

## Screen readers

Not tested with a real screen reader. That needs a person with NVDA, JAWS, VoiceOver or Orca. The automated checks cover what a screen reader relies on. Every control has a name (axe). The page has banner, main and contentinfo landmarks. Results such as "Applied Gaussian filter" go to a live region, and many tests check it. A short test with a real screen reader is left for the owner before the release.
