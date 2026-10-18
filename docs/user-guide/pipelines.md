# Pipelines

A pipeline is a chain of filter steps that you can run again and again, and save as a file. It lives in the **Pipeline** panel, next to History.

## Build a pipeline

- Choose a filter in the Library, set its values in Properties, and press **Add the selected filter** in the Pipeline panel. **Filter > Add to pipeline** does the same.
- Or press **Make from the history**. It turns the filter steps of the active image's history into a pipeline, with the values and scope each one used.

Steps that make a table or features, steps that run from their own dialog (such as Resize), and filters that need a selection as their input cannot be pipeline steps. The studio tells you why.

## Change it

Each step has:

- A check box that turns it on or off. A step that is off passes its input on unchanged.
- Arrow buttons to move it up or down. You can also drag a step by its handle.
- A settings button that opens its values and its scope: the whole image, inside the selection or outside it.
- A remove button.

## Run it

**Run on the original image** (or **Filter > Run pipeline**) runs the steps that are on, in order, starting from the original image of the active document. The result becomes one history step, such as "Pipeline (3 steps)". Starting from the original means the same pipeline always gives the same result.

A step with a selection scope uses the selection you have when you press Run. If an earlier step changed the image size, the selection no longer fits, and the run stops with a message.

Each step shows its time, or "Cached". The studio keeps the result of every step. When you change a step and run again, only that step and the ones after it run. The steps before it come from the cache.

If a step fails, the run stops there. The message names the step, and nothing is added to the history.

## Save and load

**Save as JSON** downloads `pipeline.json`. **Load a pipeline** reads one back. The file lists each step's filter, values, on or off, and scope:

```json
{
  "format": "pixelnexus-pipeline",
  "version": 1,
  "steps": [
    { "filter": "median", "params": { "size": 3 }, "enabled": true, "scope": "whole" }
  ]
}
```

On load, every value is checked against the catalog, as if you had typed it. A value out of range is changed to fit, with a warning. A step whose filter this studio does not know is left out, with a warning. A pipeline never holds images, keys or other private data.
