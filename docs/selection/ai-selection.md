# AI selection

## Overview

AI selection uses learned models through the AI provider you choose for each task in **Edit > AI providers**. Nothing runs and nothing is sent until you set a provider. Every answer is labeled as an AI result, and the history step names the provider. The classical tools stay available and need no AI: [Subject and background](subject.md) and [Object and Click Select](seeds.md).

## AI Click Select

--8<-- "tools/ai-click-select-facts.md"

1. Choose the AI Click Select tool in the tool strip.
2. Click inside the object. A green dot marks the point, and the selection appears.
3. If the selection spills over, Alt-click on the part that should not be selected. A red ring marks a negative point.
4. Keep adding points until the selection fits. **Clear seeds** in the options bar starts over.

Every click sends all points of this image again, with the whole image. EfficientSAM tiny, the on-device model, takes no negative points. Use the engine with SAM 2.1 for those.

## AI subject, background and object

--8<-- "tools/ai-subject-facts.md"

**Select > AI subject**, **AI background** and **AI object** work like their classical twins. AI object sends only the box around your selection plus a margin. See [AI providers and consent](../user-guide/ai-providers.md).

## AI soft edges

--8<-- "tools/ai-matting-facts.md"

**Select > AI soft edges** selects a person with a soft edge, so hair and fur keep their fine strands. It uses MODNet through the provider you chose for Soft edges. The answer is a soft selection, where each pixel is selected from 0 to 100 percent. MODNet is trained on portraits, so other subjects may get a poor result. For a hard edge without AI, use [Snap to edges](snap-to-edges.md).

## Things to watch

- An external provider asks for consent before each request, and each click is a request.
- A model may find edges that are not in the image. Check the result before you use it.
