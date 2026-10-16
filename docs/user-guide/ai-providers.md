# AI providers and consent

This page explains who runs the AI tasks, when the studio asks before sending an image, and how keys are kept.

AI is optional. With no provider set, every AI task points you to a classical tool or filter that runs on your own computer.

## AI tasks

Choose **Edit > AI providers** to pick a provider for each task. The tasks and their classical alternatives come from `catalog/ai-tasks.yaml`.

--8<-- "ai-tasks.md"


## Using AI in the studio

The **Select** menu has three AI commands. Each uses the provider you chose for its task.

- **AI subject** selects the main subject.
- **AI background** selects everything except the subject.
- **AI object** selects the object inside the box around your selection. Draw a rectangle first. Only the box plus a margin is sent, not the whole image.

The answer replaces the selection, and the history step names the provider. With no provider, the selection stays as it was, and the studio names the classical tool to use instead.

The **Image** menu has three more:

- **AI denoising** removes noise.
- **AI JPEG cleanup** removes the blocks and ringing of strong JPEG compression.
- **AI super-resolution** enlarges the image.

With a selection, denoising and JPEG cleanup send only the box around it. The answer is blended back with the selection as its weight, so soft edges stay soft. Super-resolution always sends the whole image. Each answer is a new history step that names the provider.
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

In **Edit > AI providers**, under **Add a provider**, choose the kind, a name and the base URL. An external service also takes a service preset, an API key and, if the preset takes one, a model name. A remote engine takes no key, so run it only on a network you trust.

The base URL must follow these rules:

- External hosts must use HTTPS.
- Plain HTTP is allowed only for this computer and private networks, such as `127.0.0.1` or `192.168.1.20`. The studio warns you that it is not encrypted.
- The URL may not hold a user name, a password, a query or a fragment. Keys go in the key field, never in the URL.

## Remote engines

A remote engine is a PixelNexus engine on another machine, such as a computer with a large GPU. It speaks the same API as the engine on this computer, so it runs the same tasks with the models downloaded there. On that machine, set `PIXELNEXUS_ENGINE_HOST=0.0.0.0` so it listens on the network, and add your studio's address to `PIXELNEXUS_ALLOWED_ORIGINS`. Then add its base URL here, such as `http://192.168.1.20:8765`.

## External services

An external service is called through a preset from `catalog/providers.yaml`. A preset says the path of each task, the form fields and the header that carries the key. The studio offers a service only for the tasks its preset lists.

- **Generic HTTP** is PixelNexus's own simple contract, for a service you build or wrap. Each task is a POST to the base URL plus the task id, such as `/denoise`. The request is a multipart form. The image goes as PNG in `image` and the selection as a gray PNG in `mask`. The clicks and box go as JSON in `prompts`, and the model name in `model`. The key goes in the `Authorization` header as `Bearer` and the key. The answer must be an image.
- **remove.bg** calls the [remove.bg API](https://www.remove.bg/api) for Select subject. You need your own key from remove.bg, and its own terms and prices apply.

For a mask task, the transparency of the answer is the selection when it has any. Otherwise its gray value is. A selection of another size is resized to the image. An error answer is shown with the reason the service gave. Some services do not accept requests from a web page. The request then fails with a message that names the host.

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
