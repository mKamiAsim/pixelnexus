# Connecting an external API

An external AI service is added in **Edit > AI providers** with a service preset, a base URL and an API key. See [AI providers and consent](../user-guide/ai-providers.md) for consent, keys and the request log. This page describes the Generic HTTP contract, for a service you build or wrap yourself.

## The request

Each task is a `POST` to the base URL plus the task id, such as `https://ai.example.com/v1/denoise`. The task ids are in the AI tasks table of the providers guide.

The body is a multipart form:

| Field | When | Content |
|---|---|---|
| `image` | Always | The image as an 8-bit RGBA PNG. With a selection, only its box may be sent. |
| `mask` | With a selection | The selection as a gray PNG, 255 inside. |
| `prompts` | With clicks or a box | JSON with `points`, each `{x, y, positive}`, and an optional `box` `{x, y, width, height}`, in pixels of the sent image. |
| `model` | When you set a model name | The model name as text. |

The key goes in the `Authorization` header as `Bearer` and the key. It is never put in the URL.

## The answer

- Success: status 200 with an image, such as `image/png`. For a mask task, the transparency of the image is the selection when it has any. Otherwise its gray value is. A mask of another size is resized to the image.
- Failure: any other status. The studio shows the reason from a JSON body with `detail`, `message`, `error` or `errors`, or the status alone.

## Try it

This request sends a test image to a service on your own computer:

```bash
curl -X POST http://127.0.0.1:9000/v1/denoise -H "Authorization: Bearer test-key" -F image=@photo.png -o result.png
```

## Rules the studio keeps

- External hosts must use HTTPS. Plain HTTP works only for this computer and private networks.
- The studio asks for consent before every request to an external service.
- Some services refuse requests from a web page (CORS). The request then fails with a message that names the host.
