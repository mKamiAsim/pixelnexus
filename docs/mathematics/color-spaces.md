# Color spaces

PixelNexus stores every image as 8-bit sRGB with straight alpha. Some filters work in other color spaces. This page lists the conversions, with the exact formulas the code uses (`web/src/core/color/convert.ts`). Tests compare them with scikit-image.

## sRGB and linear light

sRGB values are encoded: they are not proportional to light. The transfer function of IEC 61966-2-1 turns an encoded value \(V\) from 0 to 255 into linear light \(L\) from 0 to 1, with \(c = V / 255\):

\[
L = \begin{cases} c / 12.92 & c \le 0.04045 \\ \left(\frac{c + 0.055}{1.055}\right)^{2.4} & \text{otherwise} \end{cases}
\]

Averaging should strictly happen in linear light. Most filters in PixelNexus, as in OpenCV and scikit-image, work on the encoded values, and each filter page says which it uses.

## Brightness: luma

When a filter works on **brightness only**, it uses luma with the BT.709 weights on encoded values:

\[
Y' = 0.2126\, R + 0.7152\, G + 0.0722\, B
\]

Relative luminance uses the same weights on linear values. JPEG cleanup with DnCNN-3 uses full-range Y'CbCr with the BT.709 weights, and keeps Cb and Cr.

## HSV and HSL

Both use the hexcone model, with hue in degrees from 0 up to 360 and the other two from 0 to 1. With \(M = \max(R, G, B)\) and \(m = \min(R, G, B)\), all divided by 255:

- HSV: value \(V = M\), saturation \(S = (M - m) / M\), or 0 when \(M = 0\).
- HSL: lightness \(L = (M + m) / 2\), saturation \((M - m) / (M + m)\) when \(L \le 0.5\), else \((M - m) / (2 - M - m)\).

Hue is the angle of the color around the hexagon of red, yellow, green, cyan, blue and magenta.

## CIE XYZ and Lab

XYZ comes from linear light with the sRGB matrix for the D65 white:

\[
\begin{pmatrix} X \\ Y \\ Z \end{pmatrix} =
\begin{pmatrix}
0.412453 & 0.357580 & 0.180423 \\
0.212671 & 0.715160 & 0.072169 \\
0.019334 & 0.119193 & 0.950227
\end{pmatrix}
\begin{pmatrix} R \\ G \\ B \end{pmatrix}
\]

CIE Lab (D65 white, 2 degree observer, white point \(X_n = 0.95047\), \(Y_n = 1\), \(Z_n = 1.08883\)) uses

\[
f(t) = \begin{cases} t^{1/3} & t > 0.008856 \\ 7.787\, t + 16/116 & \text{otherwise} \end{cases}
\]

with \(L^* = 116 f(Y/Y_n) - 16\) (or \(903.3\, Y/Y_n\) for small \(Y\)), \(a^* = 500\,(f(X/X_n) - f(Y/Y_n))\) and \(b^* = 200\,(f(Y/Y_n) - f(Z/Z_n))\). Lab is close to how people judge color differences, so distances in it are used for color selection and clustering.

## When the color space changes

Files with more than 8 bits per channel or an embedded color profile are converted to 8-bit sRGB when they open, with a warning. Exported files are always 8-bit sRGB without a profile.
