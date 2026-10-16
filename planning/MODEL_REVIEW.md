# Model license review (Phase 7b)

Checked on 2026-10-16. Nothing on this page has been downloaded. Licenses were read from each project's own LICENSE file or README through the GitHub API. Sizes and SHA-256 values come from Hugging Face and GitHub metadata, not from downloads.

**Approved on 2026-10-16.** The approved set is below, under Decision. It is in `catalog/models.yaml`, and each file downloads only when you click Download model or run the CLI command. The tables keep the full review.

## How to read the table

- **Hash known**: the SHA-256 is published in the source's metadata, so it can be pinned now.
- **Hash at first download**: the source publishes no hash. It is computed on the first download after your approval, checked once by hand, and then pinned.
- **Runs as**: ONNX runs in ONNX Runtime, in the engine and in the browser. "OpenCV" runs through the engine's OpenCV. "PyTorch weights" must first be exported to ONNX with PyTorch, a one-time step on this machine.

## Selection models

| Model | Task | License (checked) | File and source | Size | Hash | Runs as | Phone | Suggestion |
|---|---|---|---|---|---|---|---|---|
| U2-Net small (u2netp) | Subject | Apache 2.0, [U-2-Net](https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE) | u2netp.onnx, rembg release v0.0.0 | 4.6 MB | At first download | ONNX | Yes | Include, on-device default |
| IS-Net general use | Subject | Apache 2.0, [DIS](https://github.com/xuebinqin/DIS/blob/main/LICENSE.md) | isnet-general-use.onnx, rembg release v0.0.0 | 178 MB | At first download | ONNX | No | Include, engine |
| BiRefNet lite | Subject | MIT, [BiRefNet](https://github.com/ZhengPeng7/BiRefNet/blob/main/LICENSE) | onnx/model.onnx, onnx-community/BiRefNet_lite-ONNX | 224 MB | Known, 560002...3333 | ONNX | No | Include, engine, best quality |
| MODNet | Portrait subject with soft edges, matting | Apache 2.0, code and models, [MODNet README](https://github.com/ZHKKKe/MODNet#license) | onnx/model.onnx, Xenova/modnet | 25.9 MB | Known, 07c308...4df9 | ONNX | Yes | Include |
| EfficientSAM tiny | Click and box selection | Apache 2.0, [EfficientSAM](https://github.com/yformer/EfficientSAM/blob/main/LICENSE) | efficient_sam_vitt_encoder.onnx and _decoder.onnx, official repo | 24.8 + 16.6 MB | At first download | ONNX | Yes | Include, on-device default |
| SAM 2.1 tiny | Click and box selection | Apache 2.0, checkpoints included, [SAM 2 README](https://github.com/facebookresearch/sam2#license) | vision_encoder and prompt_encoder_mask_decoder, onnx-community/sam2.1-hiera-tiny-ONNX | 155 MB | Known, 4 files | ONNX | No | Include, engine |

Not suggested: the onnx-community copy of IS-Net, since it is tagged AGPL-3.0 there, unlike the original. The rembg copy above follows the original Apache 2.0 project. A third-party MobileSAM ONNX copy (PulpCut) states no license of its own, so EfficientSAM, with official ONNX files, takes its place.

## Restoration and super-resolution

| Model | Task | License (checked) | File and source | Size | Hash | Runs as | Phone | Suggestion |
|---|---|---|---|---|---|---|---|---|
| Swin2SR lightweight x2 | Super-resolution 2x | Apache 2.0, [swin2sr](https://github.com/mv-lab/swin2sr/blob/main/LICENSE) | onnx/model.onnx, Xenova/swin2SR-lightweight-x2-64 | 8.1 MB | Known, c2abbf...10db | ONNX | Yes | Include, on-device default |
| Swin2SR real-world x4 | Super-resolution 4x | Apache 2.0, as above | onnx/model.onnx, Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr | 52.8 MB | Known, f496dc...c835 | ONNX | No | Include, engine |
| Swin2SR compressed x4 | JPEG cleanup with 4x enlargement | Apache 2.0, as above | onnx/model.onnx, Xenova/swin2SR-compressed-sr-x4-48 | 55.1 MB | Known, 203870...02f7 | ONNX | No | Include, engine |
| Real-ESRGAN general x4v3 | Super-resolution 4x | BSD 3-Clause, [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE) | realesr-general-x4v3.pth, official release v0.2.5.0 | 4.9 MB | At first download | PyTorch weights | Yes, after export | Include if you accept the export step |
| DnCNN color, blind | Denoising | MIT, [KAIR](https://github.com/cszn/KAIR/blob/master/LICENSE), same author | dncnn_color_blind.pth, KAIR release | 2.7 MB | At first download | PyTorch weights | Yes, after export | Include if you accept the export step |
| FFDNet color | Denoising with a noise level | MIT, KAIR, as above | ffdnet_color.pth, KAIR release | 3.4 MB | At first download | PyTorch weights | Yes, after export | Include if you accept the export step |
| FBCNN color | JPEG cleanup | Apache 2.0, [FBCNN](https://github.com/jiaxi-jiang/FBCNN) | fbcnn_color.pth, official release v1.0 | 288 MB | At first download | PyTorch weights | No | Optional, large |
| FSRCNN x2, EDSR x4 | Super-resolution, for teaching | Apache 2.0, [FSRCNN_Tensorflow](https://github.com/Saafke/FSRCNN_Tensorflow/blob/master/LICENSE) and [EDSR_Tensorflow](https://github.com/Saafke/EDSR_Tensorflow/blob/master/LICENSE) | FSRCNN_x2.pb and EDSR_x4.pb from those repos | 0.04 MB and 38.6 MB | At first download | OpenCV dnn_superres | FSRCNN yes | Include, no export needed |
| Restormer | Denoising and deblurring | MIT, [Restormer](https://github.com/swz30/Restormer/blob/main/LICENSE.md) | gaussian_color_denoising_blind.pth, official releases | 104.6 MB | At first download | PyTorch weights | No | Later, optional |

Not suggested now: NAFNet (MIT), since its weights are on Google Drive and Baidu only, with no stable URL to check. The DnCNN and FFDNet repositories themselves have no license file, so the KAIR copies by the same author, under MIT, are used instead. SRCNN has no official weights with a license, and FSRCNN covers the teaching need.

## Other learned filters

| Model | Task | License (checked) | File and source | Size | Hash | Runs as | Suggestion |
|---|---|---|---|---|---|---|---|
| Fast neural style: mosaic, candy, udnie, rain princess, pointilism | Style transfer | Apache 2.0, [ONNX model zoo](https://github.com/onnx/models/blob/main/LICENSE); trained with the PyTorch example code, BSD 3-Clause | *-9.onnx, onnx/models | 6.7 MB each | Known, 5 files | ONNX | Include |
| HED | Learned edges | BSD 2-Clause, [HED](https://github.com/s9xie/hed/blob/master/LICENSE) | hed_pretrained_bsds.caffemodel, https://vcl.ucsd.edu/hed/ | 58.9 MB | At first download | OpenCV dnn | Include. The server answers over HTTPS |
| PiDiNet | Learned edges | MIT text, but "just for research purpose" in [its LICENSE](https://github.com/hellozhuo/pidinet/blob/master/LICENSE) | ONNX copies by third parties | under 1 MB | Third-party copies | ONNX | Leave out |
| Zero-DCE | Low-light enhancement | CC BY-NC 4.0, non-commercial, [Zero-DCE README](https://github.com/Li-Chongyi/Zero-DCE#license) | PyTorch weights | under 1 MB | At first download | PyTorch weights | Your call. Allowed only as non-commercial, like the structured edge model |

## Decisions for you

1. Approve the rows marked Include, or strike any you do not want.
2. The PyTorch export step: accept it (PyTorch is installed once on this machine to make the ONNX files, and never in the engine), or skip the rows that need it.
3. Zero-DCE: include as non-commercial, or leave out.
4. FBCNN and Restormer: include as optional large models, or leave for later.

## Decision (2026-10-16)

The owner approved this set, the one-time PyTorch export step, and PiDiNet for study and other non-commercial use:

| Use | In the browser and on phones | In the local engine |
|---|---|---|
| Subject selection | u2netp | birefnet-lite |
| Portrait and soft edges | modnet | modnet |
| Click and box selection | efficientsam-ti | sam2-1-tiny |
| Denoising | dncnn-color-blind | dncnn-color-blind, ffdnet-color |
| JPEG cleanup | dncnn3 | dncnn3 |
| Super-resolution | swin2sr-lightweight-x2 | realesr-general-x4v3 |
| Teaching super-resolution | none | fsrcnn-x2, edsr-x4 |
| Learned edges | none | hed-bsds, pidinet |
| Style transfer | style-mosaic, style-candy, style-udnie, style-rain-princess, style-pointilism | the same |

DnCNN-3 (dncnn3, MIT, from KAIR) was added in place of FBCNN for JPEG cleanup, since it is 2.7 MB instead of 288 MB.

Left out for now: IS-Net (BiRefNet lite is better), FBCNN and Restormer (large), Zero-DCE (non-commercial only), NAFNet (no stable download link).

The SHA-256 of each file that had no published hash was computed from one download on 2026-10-16, from the pinned URL in models.yaml. The u2netp hash matched an independent mirror. Those downloads were deleted afterwards.
