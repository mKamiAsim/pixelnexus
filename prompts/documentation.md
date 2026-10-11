# Claude Code Prompt: Build Comprehensive Technical Documentation for SpectraForge

## 1. Objective

Create comprehensive, technically accurate documentation for the SpectraForge image-processing application using MkDocs and the Material for MkDocs theme.

The documentation must serve as a technical reference for developers, computer vision engineers, researchers, and students who need to understand how every image-processing filter works mathematically and how it is implemented in the source code.

This is not a marketing website or a basic user manual. The primary objective is to explain the mathematical foundations, algorithms, kernel matrices, parameter calculations, implementation details, limitations, and testing of the image-processing operations implemented in the project.

Publish the documentation through GitHub Pages using a maintainable MkDocs configuration.

## 2. Mandatory First Step: Repository Inspection

Before modifying any files:

1. Inspect the repository structure and identify the frontend, backend, filter registry, processing engine, mathematical metadata, selection engine, and test suites.
2. Inspect the actual implementation of every filter and its associated parameters.
3. Identify which filters are fully implemented, partially implemented, planned, optional, or dependent on external models.
4. Identify the libraries and versions used by each implementation.
5. Inspect existing documentation, dependency configuration, build scripts, and deployment workflows.
6. Identify discrepancies between mathematical descriptions, UI metadata, backend behavior, and tests.
7. Prepare and present a documentation plan before making changes.

Wait for approval before implementing the documentation.

Do not invent implementation details. Source code and tests are the primary references for documenting actual behavior. Use authoritative mathematical references for theoretical explanations where needed.

## 3. Documentation Technology

Use:

- MkDocs.
- Material for MkDocs.
- Markdown documentation files.
- LaTeX-compatible mathematical notation.
- A suitable MathJax integration for rendering equations.
- Mermaid diagrams where they improve architectural explanations.
- MkDocs navigation and cross-references.
- GitHub Pages deployment.
- Automated documentation validation.

Inspect the existing dependency files first. Reuse compatible installed dependencies and update configuration carefully.

Pin or constrain dependencies according to the repository's dependency-management conventions. Avoid unnecessary dependencies and incompatible version upgrades.

Do not put all documentation into one large Markdown file. Create a structured documentation hierarchy.

## 4. Required Documentation Structure

Create a logical documentation tree similar to the following. Adapt it to the actual application and source code.

docs/
- index.md
- getting-started/
  - installation.md
  - development-environment.md
  - configuration.md
  - running-tests.md
  - deployment.md
- architecture/
  - overview.md
  - frontend-architecture.md
  - backend-architecture.md
  - filter-registry.md
  - processing-pipeline.md
  - image-data-model.md
  - selection-and-masking.md
  - preview-and-rendering.md
  - execution-model.md
- mathematics/
  - foundations.md
  - image-representation.md
  - convolution-and-correlation.md
  - linearity-and-superposition.md
  - spatial-and-frequency-domains.md
  - Fourier-transform.md
  - wavelet-transforms.md
  - color-spaces.md
  - numerical-precision.md
  - boundary-conditions.md
  - masks-and-alpha-blending.md
  - computational-complexity.md
- filters/
  - index.md
  - linear/
  - nonlinear/
  - adaptive-statistical/
  - morphology/
  - frequency-domain/
  - wavelets-multiscale/
  - edge-detection/
  - texture-features/
  - enhancement-color/
  - restoration/
  - segmentation/
  - deep-learning/
- selection/
  - overview.md
  - manual-tools.md
  - magic-wand.md
  - color-range.md
  - quick-selection.md
  - object-selection.md
  - subject-segmentation.md
  - masks-and-refinement.md
- mathematical-inspector/
  - overview.md
  - kernel-generation.md
  - formula-rendering.md
  - parameter-synchronization.md
  - developer-mode.md
- implementation/
  - adding-a-filter.md
  - filter-definition-schema.md
  - backend-integration.md
  - frontend-integration.md
  - testing-guidelines.md
  - optional-dependencies.md
  - model-integration.md
- reference/
  - filter-catalog.md
  - parameter-reference.md
  - api-reference.md
  - dependencies.md
  - limitations.md
- contributing.md

Create directories and individual files only where appropriate. The final documentation must have a working navigation structure, meaningful content, and no empty placeholder pages.

## 5. Technical Documentation for Every Filter

This is the most important requirement.

Create an individual technical reference page for every implemented filter. Group pages by the filter taxonomy already used by the application.

Each filter page must contain the following sections where applicable.

### 5.1 Filter overview

Document:

- Official filter name.
- Internal filter ID.
- Category and subcategory.
- Primary purpose.
- Mathematical classification.
- Linear or nonlinear behavior.
- Spatial, frequency, transform, statistical, morphological, iterative, or learned operation.
- Typical use cases.
- Suitable image types.
- Known limitations.
- Related filters and alternatives.

### 5.2 Mathematical foundations

Explain the mathematical principle behind the filter.

Include:

- The main mathematical formula in LaTeX.
- A definition of every symbol.
- Assumptions and boundary conditions.
- A step-by-step derivation where useful.
- Simplified intuition explaining what the equation means.
- Conditions under which the formulation is valid.
- Differences between the theoretical formulation and the implementation.

Do not merely paste an equation. Explain how the equation transforms image data.

For formulas that depend on a noise model, probability distribution, physical model, or statistical assumption, document those assumptions explicitly.

For complex methods, separate the mathematical model into understandable stages.

### 5.3 Kernel matrix and operator representation

When the filter uses a fixed convolution kernel, display the exact matrix and explain the coefficients.

For example, the Sobel X operator can be represented as:

\[
K_x =
\begin{bmatrix}
-1&0&1\\
-2&0&2\\
-1&0&1
\end{bmatrix}
\]

Explain how the matrix is applied to a neighborhood and how its output is interpreted.

For dynamically generated kernels, explain the kernel-generation formula, parameter dependencies, normalization, and supported sizes.

For filters that do not use a conventional convolution kernel, provide the appropriate representation:

- Median filters: neighborhood and order-statistic definition.
- Bilateral filters: spatial and intensity weights.
- Morphological filters: structuring elements and set operations.
- Frequency filters: transfer functions and frequency-response plots where practical.
- Wavelet filters: decomposition, coefficient processing, and reconstruction.
- Statistical filters: estimator equations and assumptions.
- Iterative restoration: objective function, regularization, update rules, and stopping criteria.
- Feature detectors: response functions and feature-selection rules.
- Segmentation algorithms: energy functions, region-growing rules, graph representations, or flooding procedures.
- Neural filters: model architecture, tensor operations, inference procedure, and relevant model references.

Never invent a kernel matrix for an algorithm that does not have one.

### 5.4 Step-by-step algorithm

Document the implementation flow in sufficient detail for another developer to understand or reproduce the algorithm.

Include pseudocode for non-trivial algorithms.

Where appropriate, explain:

- Input preprocessing.
- Color-space conversion.
- Padding and boundary handling.
- Neighborhood or patch construction.
- Kernel generation.
- Intermediate calculations.
- Normalization and clipping.
- Iterative processing.
- Postprocessing.
- Output conversion.

For multi-stage algorithms such as Canny, BM3D, watershed, Richardson–Lucy, and wavelet thresholding, document the individual stages and how they interact.

### 5.5 Parameters and defaults

Document every supported parameter.

For each parameter, provide:

- Name.
- Data type.
- Default value.
- Valid range or allowed values.
- Mathematical meaning.
- Effect on output.
- Performance implications.
- Validation rules.
- Interactions with other parameters.

Parameter defaults must come from the actual source code or authoritative configuration.

Do not use guessed values.

Explain any implementation-specific differences between the theoretical algorithm and the library function used.

### 5.6 Implementation details

For every filter, document:

- Source file and function or class.
- Internal filter identifier.
- Processing library and relevant version.
- Input image format and expected shape.
- Supported channel configurations.
- Supported data types.
- Color-space requirements.
- Output type and dimensions.
- Alpha-channel behavior.
- Border-handling mode.
- Numerical precision and normalization.
- Whether the operation is performed on the frontend, backend, or an external model.
- Optional dependencies.
- Model-loading requirements, if applicable.
- Error handling and unsupported configurations.

Reference actual repository paths and function names. Do not invent file locations.

When code is changed later, ensure that the documentation remains aligned with the implementation.

### 5.7 Worked numerical example

For filters with understandable local calculations, include a small worked example.

For example:

1. Show a small input matrix.
2. Show the applicable kernel or neighborhood.
3. Show the multiplication or selection operation.
4. Calculate the output value.
5. Explain the result.

For a convolution filter, demonstrate a single output pixel using the actual kernel.

For a median filter, show the selected neighborhood and the sorted values.

For morphology, demonstrate the effect of the structuring element.

For a frequency-domain filter, use a simplified spectrum to explain which frequencies are retained or suppressed.

For iterative or neural algorithms where a hand calculation is inappropriate, provide a small conceptual example and explain the intermediate representations instead.

Clearly distinguish illustrative calculations from actual application output.

### 5.8 Computational complexity

Discuss time and memory complexity.

Where possible, express the expected complexity in terms of:

- Image width and height.
- Number of pixels.
- Kernel size.
- Number of channels.
- Number of scales.
- Number of iterations.
- Number of patches or neighboring regions.
- Model size and inference requirements.

For example, a direct convolution with a \(k \times k\) kernel over an image of \(N\) pixels generally requires \(O(Nk^2)\) operations per channel.

A separable convolution can reduce the kernel-related cost to approximately \(O(Nk)\).

Explain when an implementation benefits from FFTs, separable kernels, vectorization, parallel execution, GPU acceleration, or caching.

Do not claim measured performance unless actual benchmarks exist. Distinguish theoretical complexity from observed execution time.

### 5.9 Artifacts and limitations

Explain potential problems, including:

- Blurring.
- Ringing.
- Edge halos.
- Oversharpening.
- Noise amplification.
- Loss of fine details.
- Color shifts.
- Border artifacts.
- Numerical instability.
- Sensitivity to parameter selection.
- Failure under mismatched statistical assumptions.
- AI-generated details that are not supported by the original image.

Describe suitable alternatives and parameter adjustments.

### 5.10 Testing and validation

Document the tests used to verify the filter.

Include:

- Test file paths.
- Numerical correctness tests.
- Known test cases.
- Expected output behavior.
- Boundary-condition tests.
- Data-type tests.
- Masked-processing tests.
- Performance tests, if available.
- Numerical tolerances.

Identify missing tests and recommend additional tests where needed.

Do not claim that a test passes unless it has actually been executed successfully.

### 5.11 References

Provide reliable references to:

- Original research papers where relevant.
- Authoritative textbooks.
- Official library documentation.
- Relevant standards.
- The source implementation.

Use primary sources when possible. Distinguish original research from later reviews and library documentation.

Do not fabricate publications, authors, DOIs, links, or citations.

## 6. Complete Filter Catalog

Cross-reference the entire filter catalog from the application prompt.

Cover all filter families:

1. Linear spatial filters.
2. Nonlinear spatial filters.
3. Adaptive and statistical filters.
4. Morphological filters.
5. Frequency-domain filters.
6. Wavelet and multiscale filters.
7. Edge detection and boundary analysis.
8. Texture, corner, blob, and feature extraction.
9. Image enhancement, illumination, and color processing.
10. Restoration and reconstruction.
11. Segmentation and region-based processing.
12. Deep-learning and learned image processing.

For every filter in the catalog, assign one of these statuses:

- Implemented and tested.
- Implemented, testing incomplete.
- Partially implemented.
- Available through an optional dependency.
- Available through an optional pretrained model.
- Planned but not implemented.
- Unsupported or deprecated.

Use the actual implementation state.

Every filter should have a catalog entry. Implemented filters must link to their detailed technical pages. Planned filters may have concise status pages, but must not be documented as working implementations.

Where two names refer to the same algorithm or implementation, explain the alias rather than duplicating the technical explanation unnecessarily.

## 7. Mathematical Inspector Documentation

Document the architecture of the application's mathematical inspector.

Explain:

- How filter metadata is represented.
- How formulas are stored and rendered.
- How parameters are validated.
- How kernels are generated.
- How the displayed kernel relates to the processing implementation.
- How parameter changes update the formula, matrix, and preview.
- How mathematical documentation remains synchronized with executable code.
- How algorithms without fixed kernels are represented.
- How source paths and test references are exposed safely.
- How numerical examples are calculated.

Describe the single-source-of-truth design for filter definitions and identify any existing inconsistencies.

Recommend automated consistency checks where practical.

For example, tests should verify that changing Gaussian sigma changes the generated kernel and that the displayed coefficients match the actual coefficients used by the filter implementation.

## 8. Selection and Masking Documentation

Provide technical documentation for:

- Rectangular and elliptical selection.
- Freehand and polygonal lasso.
- Quick Selection.
- Magic Wand.
- Color Range.
- Object Selection.
- Subject Selection.
- Click-guided segmentation.
- Background selection.
- Edge-assisted selection.
- Feathering, expansion, contraction, and smoothing.
- Mask inversion and Boolean mask operations.
- Alpha blending and regional filtering.

Explain coordinate transformations between image pixels, the displayed canvas, and the selection overlay.

Document the mask representation, pixel-value conventions, interpolation, antialiasing, and soft-mask blending.

Explain how filters that depend on surrounding pixels operate near selection boundaries.

For model-based segmentation, document the model, version, input preprocessing, prompt representation, output masks, hardware requirements, license, and known limitations.

Separate traditional algorithms from pretrained AI segmentation.

## 9. Architecture and Data Flow

Include technical diagrams for:

- Overall system architecture.
- Frontend/backend interaction.
- Image upload and validation.
- Filter registry and execution.
- Mathematical metadata flow.
- Kernel generation and visualization.
- Selection and mask creation.
- Masked filter application.
- Multi-filter processing pipelines.
- Preview generation and final export.
- Optional neural-model inference.
- Testing and validation.

Use Mermaid where suitable.

Every diagram must represent the actual architecture. Label optional components and distinguish implemented features from planned ones.

## 10. Developer Extension Guide

Document how to add a new filter from beginning to end.

Explain:

1. Selecting the appropriate category.
2. Defining the filter metadata.
3. Defining and validating parameters.
4. Implementing the algorithm.
5. Generating the mathematical formula.
6. Generating a kernel or alternative operator representation.
7. Integrating frontend controls.
8. Integrating backend execution where required.
9. Supporting selection masks where appropriate.
10. Adding unit and integration tests.
11. Documenting numerical limitations.
12. Updating the catalog and navigation.
13. Verifying the filter's implementation status.
14. Running all relevant checks.

Provide small examples based on the actual repository architecture.

Prefer extending the existing registry and interfaces instead of creating parallel systems.

## 11. Quality and Documentation Standards

All technical pages must:

- Use precise, accessible technical English.
- Define mathematical notation.
- Use consistent terminology.
- Render equations correctly.
- Include meaningful internal links.
- Avoid redundant explanations.
- Avoid unsupported claims.
- Separate theory from implementation details.
- Clearly identify assumptions and limitations.
- Include examples where useful.
- Identify source files and tests.
- Keep theoretical formulas consistent with the actual implementation.

Do not fill pages with generic explanations that are unrelated to the project's implementation.

Do not duplicate the entire application README across multiple pages.

Do not hide incomplete documentation behind broad statements that a filter is supported.

## 12. MkDocs Configuration and GitHub Pages

Create or update the MkDocs configuration using the repository's established conventions.

Configure:

- Material for MkDocs theme.
- Navigation.
- Search.
- Mathematical rendering.
- Code syntax highlighting.
- Useful admonitions and tabs where appropriate.
- Mermaid support if required.
- Cross-references.
- Responsive navigation.
- Repository links where appropriate.
- GitHub Pages deployment.

Create or update a GitHub Actions workflow that builds and validates the documentation.

Use appropriate permissions and a safe deployment process. Do not publish secrets or internal configuration.

If an existing deployment workflow is present, inspect and extend it rather than creating a conflicting workflow.

Document the local commands needed to install dependencies, build the site, and preview it.

Ensure that the documentation can be built from a clean environment using the documented instructions.

## 13. Automated Validation

Implement or configure checks for:

- Successful MkDocs builds.
- Invalid navigation entries.
- Broken internal links.
- Missing referenced files.
- Invalid Markdown or malformed mathematical notation where tooling permits.
- Missing technical pages for implemented filters.
- Missing implementation-status metadata.
- Missing mathematical documentation.
- Missing test references where required.

Where feasible, create a validation script that compares the application's filter registry against the documentation catalog.

The validation script should identify:

- Implemented filters without documentation.
- Documented filters without registry entries.
- Incorrect or missing source paths.
- Missing implementation statuses.
- Missing mathematical formulas or operator representations.
- Broken internal links.

Do not automatically generate inaccurate mathematical documentation from filter names alone.

Use automated generation only for factual metadata that can be extracted reliably from the source code.

## 14. Deliverables

Deliver:

1. Complete MkDocs configuration.
2. A well-organized `docs/` directory.
3. Technical documentation for every implemented filter.
4. A complete filter catalog with implementation statuses.
5. Mathematical foundations and algorithm explanations.
6. Kernel and operator documentation.
7. Selection and masking documentation.
8. Architecture and data-flow diagrams.
9. Developer extension guides.
10. Dependency and model reference documentation.
11. GitHub Pages deployment workflow.
12. Documentation validation tooling.
13. Updated README instructions for local documentation development.
14. A list of documented filters and any remaining gaps.
15. A report of build and validation results.

## 15. Final Execution Instructions

First inspect the repository and present your documentation plan. Wait for approval before modifying files.

After approval, create the documentation incrementally.

Prioritize the architecture, mathematical foundations, filter registry, and implemented-filter references first. Then cover advanced filters, selection algorithms, restoration, and optional AI models.

Verify all formulas, matrices, parameters, source references, and implementation statuses against the code and reliable references.

Build the MkDocs site and run the available validation checks before reporting completion.

In the final report, summarize the documentation structure, major pages created, filters documented, validation results, GitHub Pages setup, and known gaps.

Do not claim complete technical coverage if any implemented filter lacks an accurate mathematical explanation or implementation reference.