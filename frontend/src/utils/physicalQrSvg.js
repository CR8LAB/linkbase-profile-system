export const PHYSICAL_QR_MODULE_WIDTHS = [0.6, 0.8, 1.0];
export const QR_QUIET_ZONE_MODULES = 4;

export function getQrDetails(viewBoxModules) {
  if (!Number.isInteger(viewBoxModules)) {
    throw new TypeError("QR viewBox module dimension must be an integer");
  }

  const matrixModules = viewBoxModules - QR_QUIET_ZONE_MODULES * 2;
  if (matrixModules < 21 || (matrixModules - 17) % 4 !== 0) {
    throw new RangeError("QR viewBox does not contain a valid QR matrix");
  }

  return {
    version: (matrixModules - 17) / 4,
    matrixModules,
    moduleCount: matrixModules * matrixModules,
  };
}

export function getPhysicalQrDimensions({
  viewBoxModules,
  moduleWidthMm = 0.8,
  baseMarginMm = 2,
}) {
  const qr = getQrDetails(viewBoxModules);

  if (!PHYSICAL_QR_MODULE_WIDTHS.includes(moduleWidthMm)) {
    throw new RangeError("Module width must be 0.6, 0.8 or 1.0 mm");
  }
  if (!Number.isFinite(baseMarginMm) || baseMarginMm < 0 || baseMarginMm > 20) {
    throw new RangeError("Base margin must be between 0 and 20 mm");
  }

  const qrWidthMm = viewBoxModules * moduleWidthMm;
  const backgroundWidthMm = qrWidthMm + 2 * baseMarginMm;

  return {
    ...qr,
    quietZoneModules: QR_QUIET_ZONE_MODULES,
    moduleWidthMm,
    baseMarginMm,
    qrWidthMm,
    backgroundWidthMm,
  };
}

export function buildPhysicalQrSvg({
  foregroundPath,
  viewBoxModules,
  moduleWidthMm = 0.8,
  baseMarginMm = 2,
}) {
  if (
    typeof foregroundPath !== "string" ||
    !/^[MmHhVvZz0-9.,\s-]+$/.test(foregroundPath)
  ) {
    throw new TypeError("QR foreground path contains unsupported SVG data");
  }

  const dimensions = getPhysicalQrDimensions({
    viewBoxModules,
    moduleWidthMm,
    baseMarginMm,
  });
  const backgroundSize = dimensions.backgroundWidthMm;
  const transform = `translate(${baseMarginMm} ${baseMarginMm}) scale(${moduleWidthMm})`;

  return {
    dimensions,
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${backgroundSize}mm" height="${backgroundSize}mm" viewBox="0 0 ${backgroundSize} ${backgroundSize}" shape-rendering="crispEdges">`,
      `<rect id="background" data-part="background" x="0" y="0" width="${backgroundSize}" height="${backgroundSize}" fill="#FFFFFF"/>`,
      `<path id="foreground" data-part="foreground" d="${foregroundPath}" transform="${transform}" fill="#000000" fill-rule="nonzero"/>`,
      "</svg>",
    ].join("\n"),
  };
}
