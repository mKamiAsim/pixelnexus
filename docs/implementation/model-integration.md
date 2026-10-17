# Model integration

Learned models follow a fixed path from license review to the studio:

1. A review row in `planning/MODEL_REVIEW.md`.
2. An entry in `catalog/models.yaml` with a pinned source and SHA-256.
3. A download on request.
4. An optional one-time export to ONNX.
5. Code that runs the model exactly as its source does.

The full description, with the tests every model needs, is in [Model integration](../models/integration.md) in the AI models section. The models themselves are in the [model reference](../models/reference.md).
