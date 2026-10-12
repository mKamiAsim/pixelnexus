/**
 * WebGL2 renderer for the image viewport.
 *
 * One full-screen triangle and one fragment shader draw everything: the pasteboard, the
 * transparency checkerboard, the image, the pixel grid and the compare modes. Drawing happens
 * on demand, not in a loop.
 *
 * - At 100% zoom and above, pixels are read with texelFetch, so each image pixel is an exact,
 *   sharp square.
 * - Below 100%, the texture is sampled with mipmaps, so a large image shrinks smoothly.
 *
 * The selection mask is a one-channel texture. Marching ants mark the inside edge of the
 * selection (values of 50% and more), with black and white dashes that move when the phase
 * changes. Quick Mask tints the unselected part, and the mask view shows the mask in gray.
 */
import type { ViewState } from "@/canvas/viewport";
import type { RgbaImage } from "@/core/image/types";
import type { Mask } from "@/core/mask/mask";

export type RenderMode = "current" | "original" | "split" | "overlay" | "difference";

/** The part of the image a preview covers, in image pixels. */
export interface PreviewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Rgb = readonly [number, number, number];

/** How the selection shows: marching ants, a tint on the unselected part, or the mask in gray. */
export type MaskView = "ants" | "quick-mask" | "mask";

const MASK_VIEWS: Record<MaskView, number> = { ants: 0, "quick-mask": 1, mask: 2 };

export interface RenderColors {
  readonly pasteboard: Rgb;
  readonly checkerA: Rgb;
  readonly checkerB: Rgb;
}

export interface RenderRequest {
  readonly view: ViewState;
  /** Viewport size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly mode: RenderMode;
  /** Draw the original in the left half and the current image in the right half. */
  readonly sideBySide: boolean;
  /** Split position in CSS pixels from the left edge, for split mode. */
  readonly splitX: number;
  /** Opacity of the original over the current image, for overlay mode. */
  readonly overlayOpacity: number;
  readonly pixelGrid: boolean;
  readonly colors: RenderColors;
  /** How the selection shows. The selection is drawn only when a mask is set. */
  readonly maskView: MaskView;
  /** Moves the marching ants along. Any number. Keep it fixed for a still pattern. */
  readonly antsPhase: number;
}

const MODES: Record<RenderMode, number> = {
  current: 0,
  original: 1,
  split: 2,
  overlay: 3,
  difference: 4,
};

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uCurrent;
uniform sampler2D uOriginal;
uniform sampler2D uPreview;
uniform bool uHasPreview;
uniform vec4 uPreviewRect;
uniform vec2 uPreviewSize;
uniform vec2 uCurrentSize;
uniform vec2 uOriginalSize;
uniform float uZoom;
uniform vec2 uPan;
uniform float uDpr;
uniform vec2 uRegionOrigin;
uniform float uCanvasHeight;
uniform int uMode;
uniform float uSplitX;
uniform float uOpacity;
uniform bool uGrid;
uniform vec3 uPasteboard;
uniform vec3 uCheckerA;
uniform vec3 uCheckerB;
uniform sampler2D uMask;
uniform bool uHasMask;
uniform vec2 uMaskSize;
uniform int uMaskView;
uniform float uAntsPhase;
out vec4 outColor;

bool inside(vec2 p, vec2 size) {
  return p.x >= 0.0 && p.y >= 0.0 && p.x < size.x && p.y < size.y;
}

vec4 fetch(sampler2D tex, vec2 size, vec2 p) {
  if (!inside(p, size)) return vec4(0.0);
  if (uZoom >= 1.0) return texelFetch(tex, ivec2(floor(p)), 0);
  return texture(tex, p / size);
}

// The current image, with the filter preview on top where it has one.
vec4 currentAt(vec2 p) {
  if (uHasPreview) {
    vec2 q = p - uPreviewRect.xy;
    if (q.x >= 0.0 && q.y >= 0.0 && q.x < uPreviewRect.z && q.y < uPreviewRect.w) {
      vec2 scale = uPreviewSize / uPreviewRect.zw;
      vec2 t = q * scale;
      if (uZoom * scale.x >= 1.0) return texelFetch(uPreview, ivec2(floor(t)), 0);
      return texture(uPreview, t / uPreviewSize);
    }
  }
  return fetch(uCurrent, uCurrentSize, p);
}

float maskAt(vec2 p) {
  if (!inside(p, uMaskSize)) return 0.0;
  if (uZoom >= 1.0) return texelFetch(uMask, ivec2(floor(p)), 0).r;
  return texture(uMask, p / uMaskSize).r;
}

// True on the last screen pixel inside the selection, next to an unselected one.
bool selectionEdge(vec2 p) {
  if (maskAt(p) < 0.5) return false;
  float d = 1.0 / uZoom;
  return maskAt(p + vec2(d, 0.0)) < 0.5 || maskAt(p - vec2(d, 0.0)) < 0.5 ||
         maskAt(p + vec2(0.0, d)) < 0.5 || maskAt(p - vec2(0.0, d)) < 0.5;
}

void main() {
  vec2 device = vec2(gl_FragCoord.x, uCanvasHeight - gl_FragCoord.y) - uRegionOrigin;
  vec2 css = device / uDpr;
  vec2 p = (css - uPan) / uZoom;
  bool inCurrent = inside(p, uCurrentSize);
  bool inOriginal = inside(p, uOriginalSize);
  bool showsOriginal = uMode == 1 || (uMode == 2 && css.x < uSplitX);
  bool covered = uMode == 0 ? inCurrent : (uMode == 1 ? inOriginal :
                 (uMode == 2 ? (showsOriginal ? inOriginal : inCurrent) : (inCurrent || inOriginal)));
  if (!covered) {
    outColor = vec4(uPasteboard, 1.0);
    return;
  }
  vec4 color;
  if (uMode == 0) color = currentAt(p);
  else if (uMode == 1 || (uMode == 2 && showsOriginal)) color = fetch(uOriginal, uOriginalSize, p);
  else if (uMode == 2) color = currentAt(p);
  else {
    vec4 current = currentAt(p);
    vec4 original = fetch(uOriginal, uOriginalSize, p);
    if (uMode == 3) color = mix(current, original, uOpacity);
    else color = vec4(abs(current.rgb - original.rgb), max(current.a, original.a));
  }
  vec2 cell = floor(css / 8.0);
  vec3 checker = mod(cell.x + cell.y, 2.0) < 1.0 ? uCheckerA : uCheckerB;
  vec3 rgb = mix(checker, color.rgb, color.a);
  if (uHasMask) {
    if (uMaskView == 2) rgb = vec3(maskAt(p));
    else if (uMaskView == 1) rgb = mix(rgb, vec3(1.0, 0.0, 0.0), 0.5 * (1.0 - maskAt(p)));
    else if (selectionEdge(p)) {
      float dash = mod(floor((css.x + css.y + uAntsPhase) / 4.0), 2.0);
      rgb = dash < 1.0 ? vec3(0.0) : vec3(1.0);
    }
  }
  if (uGrid && uZoom >= 8.0) {
    vec2 f = fract(p) * uZoom * uDpr;
    if (f.x < 1.0 || f.y < 1.0) rgb = mix(rgb, vec3(0.5), 0.4);
  }
  outColor = vec4(rgb, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create a WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader did not compile: ${log ?? "no log"}`);
  }
  return shader;
}

interface UploadedTexture {
  readonly texture: WebGLTexture;
  readonly image: RgbaImage;
}

export class ImageRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private current: UploadedTexture | null = null;
  private original: UploadedTexture | null = null;
  private preview: { texture: UploadedTexture; rect: PreviewRect } | null = null;
  private mask: { texture: WebGLTexture; mask: Mask } | null = null;
  readonly maxTextureSize: number;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl)
      throw new Error("This browser does not support WebGL2, which the image viewport needs.");
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Shader program did not link: ${gl.getProgramInfoLog(program) ?? "no log"}`);
    }
    this.program = program;
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name))
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }

  private createTexture(image: RgbaImage): UploadedTexture {
    const { gl } = this;
    if (image.width > this.maxTextureSize || image.height > this.maxTextureSize) {
      throw new Error(
        `The image is larger than this graphics card can show (${this.maxTextureSize} pixels per side).`,
      );
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      image.width,
      image.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { texture, image };
  }

  /**
   * Upload images when they change. Textures are reused by image identity, so an image is never
   * uploaded twice, and a texture is freed only when neither slot uses it.
   */
  setImages(current: RgbaImage, original: RgbaImage): void {
    const previous = [this.current, this.original].filter((t): t is UploadedTexture => t !== null);
    const known = new Map(previous.map((t) => [t.image, t]));
    const take = (image: RgbaImage) => {
      const texture = known.get(image) ?? this.createTexture(image);
      known.set(image, texture);
      return texture;
    };
    const nextCurrent = take(current);
    const nextOriginal = take(original);
    for (const texture of new Set(previous)) {
      if (texture !== nextCurrent && texture !== nextOriginal)
        this.gl.deleteTexture(texture.texture);
    }
    this.current = nextCurrent;
    this.original = nextOriginal;
  }

  /**
   * Show a filter preview on top of the current image. `rect` is the part of the image it
   * covers, in image pixels. The preview may have a lower resolution than that part.
   */
  setPreview(image: RgbaImage | null, rect: PreviewRect | null): void {
    if (!image || !rect) {
      if (this.preview) this.gl.deleteTexture(this.preview.texture.texture);
      this.preview = null;
      return;
    }
    if (this.preview?.texture.image === image) {
      this.preview = { texture: this.preview.texture, rect };
      return;
    }
    if (this.preview) this.gl.deleteTexture(this.preview.texture.texture);
    this.preview = { texture: this.createTexture(image), rect };
  }

  /** Show a selection. Null hides it. The texture is uploaded again only when the mask changes. */
  setMask(mask: Mask | null): void {
    const { gl } = this;
    if (this.mask?.mask === mask) return;
    if (this.mask) gl.deleteTexture(this.mask.texture);
    this.mask = null;
    if (!mask) return;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      mask.width,
      mask.height,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      mask.data,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.mask = { texture, mask };
  }

  render(request: RenderRequest): void {
    const { gl, canvas, current, original } = this;
    if (!current || !original) return;
    const deviceWidth = Math.max(1, Math.round(request.width * request.dpr));
    const deviceHeight = Math.max(1, Math.round(request.height * request.dpr));
    if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
      canvas.width = deviceWidth;
      canvas.height = deviceHeight;
    }
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, current.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, original.texture);
    gl.uniform1i(this.uniform("uCurrent"), 0);
    gl.uniform1i(this.uniform("uOriginal"), 1);
    const preview = this.preview;
    gl.uniform1i(this.uniform("uHasPreview"), preview ? 1 : 0);
    if (preview) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, preview.texture.texture);
      gl.uniform1i(this.uniform("uPreview"), 2);
      const { x, y, width, height } = preview.rect;
      gl.uniform4f(this.uniform("uPreviewRect"), x, y, width, height);
      gl.uniform2f(
        this.uniform("uPreviewSize"),
        preview.texture.image.width,
        preview.texture.image.height,
      );
    } else {
      // Every sampler needs a valid texture unit, even when it is not read.
      gl.uniform1i(this.uniform("uPreview"), 1);
    }
    const mask = this.mask;
    gl.uniform1i(this.uniform("uHasMask"), mask ? 1 : 0);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, mask ? mask.texture : current.texture);
    gl.uniform1i(this.uniform("uMask"), 3);
    gl.uniform2f(
      this.uniform("uMaskSize"),
      mask?.mask.width ?? current.image.width,
      mask?.mask.height ?? current.image.height,
    );
    gl.uniform1i(this.uniform("uMaskView"), MASK_VIEWS[request.maskView]);
    gl.uniform1f(this.uniform("uAntsPhase"), request.antsPhase);
    gl.uniform2f(this.uniform("uCurrentSize"), current.image.width, current.image.height);
    gl.uniform2f(this.uniform("uOriginalSize"), original.image.width, original.image.height);
    gl.uniform1f(this.uniform("uZoom"), request.view.zoom);
    gl.uniform1f(this.uniform("uDpr"), request.dpr);
    gl.uniform1f(this.uniform("uCanvasHeight"), deviceHeight);
    gl.uniform1f(this.uniform("uOpacity"), request.overlayOpacity);
    gl.uniform1i(this.uniform("uGrid"), request.pixelGrid ? 1 : 0);
    gl.uniform3f(this.uniform("uPasteboard"), ...request.colors.pasteboard);
    gl.uniform3f(this.uniform("uCheckerA"), ...request.colors.checkerA);
    gl.uniform3f(this.uniform("uCheckerB"), ...request.colors.checkerB);

    const draw = (x: number, width: number, mode: RenderMode, panX: number) => {
      const left = Math.round(x * request.dpr);
      const right = Math.round((x + width) * request.dpr);
      gl.viewport(left, 0, right - left, deviceHeight);
      gl.uniform2f(this.uniform("uRegionOrigin"), left, 0);
      gl.uniform2f(this.uniform("uPan"), panX, request.view.panY);
      gl.uniform1i(this.uniform("uMode"), MODES[mode]);
      gl.uniform1f(this.uniform("uSplitX"), request.splitX);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    if (request.sideBySide) {
      // Each half shows the same image point at the same place within the half.
      const half = request.width / 2;
      const panX = request.view.panX - half / 2;
      draw(0, half, "original", panX);
      draw(half, request.width - half, "current", panX);
    } else {
      draw(0, request.width, request.mode, request.view.panX);
    }
  }

  dispose(): void {
    const { gl } = this;
    this.setPreview(null, null);
    this.setMask(null);
    for (const texture of new Set([this.current, this.original])) {
      if (texture) gl.deleteTexture(texture.texture);
    }
    gl.deleteProgram(this.program);
    this.current = null;
    this.original = null;
  }
}

/** Read a hex color token from CSS, for example --px-canvas, as 0 to 1 channels. */
export function cssColor(name: string, fallback: Rgb = [0.5, 0.5, 0.5]): Rgb {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match?.[1]) return fallback;
  const hex = match[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as Rgb;
}
