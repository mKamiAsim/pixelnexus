# AI providers and consent

This page explains who runs the AI tasks, when the studio asks before sending an image, and how keys are kept.

AI is optional. With no provider set, every AI task points you to a classical tool or filter that runs on your own computer.

## AI tasks

Choose **Edit > AI providers** to pick a provider for each task. The tasks and their classical alternatives come from `catalog/ai-tasks.yaml`.

--8<-- "ai-tasks.md"

## Provider kinds

| Kind | Where it runs | Asks before sending |
|---|---|---|
| Local engine model | The PixelNexus engine on this computer | Never |
| On-device model | Inside the browser or the phone app | Never |
| Remote PixelNexus engine | An engine you run on another machine | Once per session for each host |
| External AI service | A service you set up with a base URL and a key | Every time |

The first two kinds keep the image on your device.

## Local engine models

**Local engine models** is always in the list. It runs the task on the PixelNexus engine on this computer, so nothing is sent and nothing is asked. It uses the default model of each task, the first in the last column of the task table above.

Each model downloads only when you ask, in the Properties panel of a filter that uses it, or with `uv run pixelnexus-engine models download <id>`. A task whose model is not downloaded says which one to download. EfficientSAM has no negative clicks, so a request with them is refused, not changed. SAM 2.1 takes them.

The engine runs models with ONNX Runtime. With the `cuda` extra, it uses an NVIDIA GPU when a test model really runs on it, and the CPU otherwise. The status bar shows GPU or CPU next to the engine light.

## On-device models

**On-device models** is also always in the list. It runs the task inside the browser with ONNX Runtime Web, on the GPU through WebGPU where the browser offers it, and on the CPU otherwise. It works the same in the Pages studio. Nothing is sent and nothing is asked.

Each model first has to be downloaded to this browser. **Edit > AI providers** lists the models that run in a browser, with their size and license. A model downloads only when you click its Download button. Every file is checked against its SHA-256 in the catalog and kept in the browser's storage, so it loads without the network next time. Remove deletes it again. The runtime itself, about 27 MB, loads only the first time a model runs.

Subject selection uses U2-Net small, click and box selection EfficientSAM tiny, and super-resolution Swin2SR at 2x. EfficientSAM takes no negative clicks. A task whose model is not downloaded says which model to download.

## Adding a provider

In **Edit > AI providers**, under **Add a provider**, choose the kind, a name and the base URL. An external service also takes an API key and, if it needs one, a model name.

The base URL must follow these rules:

- External hosts must use HTTPS.
- Plain HTTP is allowed only for this computer and private networks, such as `127.0.0.1` or `192.168.1.20`. The studio warns you that it is not encrypted.
- The URL may not hold a user name, a password, a query or a fragment. Keys go in the key field, never in the URL.

## Consent

Before each request to an external service, a dialog shows:

- The provider and its host.
- What will be sent: the image size, whether it is the full image or a crop, and any mask, box or clicks.
- What comes back: a mask or an image.
- A note that the privacy terms of the host apply.

Choose **Send once** or **Cancel**. There is no "always allow" for external services. For a remote PixelNexus engine, the studio asks once per host, and asks again after you close the tab. Local and on-device models never ask, since the image stays on your device.

If you cancel, nothing is sent.

## Keys

- A key is kept for the session only, unless you turn on **Remember the key on this device**.
- Keys are never logged, never put in URLs, and never saved in projects or pipelines.
- A key is sent only to the base URL of its provider.
- The provider list shows only the last four characters of a key.
- Removing a provider also removes its key.

## While a request runs

The status bar names the host while a request is on its way, in place of the note that images stay in your browser. Click it to open the request log.

**Edit > AI request log** lists every request that left this device in this session, with the time, the host, the task, the data size and the result. The log stays on the device and is cleared when you close the tab.

## When a provider fails

The studio tells you what went wrong and names the classical alternative for the task. It never tries another provider on its own.

## Results

Every result from a learned or external model carries the label "AI result. Detail may not exist in the original scene."
