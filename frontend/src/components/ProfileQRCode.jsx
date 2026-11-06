import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  buildPhysicalQrSvg,
  getPhysicalQrDimensions,
  getQrDetails,
  PHYSICAL_QR_MODULE_WIDTHS,
} from "../utils/physicalQrSvg.js";
import { getProfileShortUrl } from "../utils/profileShortUrl.js";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ProfileQRCode({ profile, showManagementControls = false }) {
  const svgRef = useRef(null);
  const [moduleWidthMm, setModuleWidthMm] = useState(0.8);
  const [baseMarginMm, setBaseMarginMm] = useState(2);
  const [qrDetails, setQrDetails] = useState(null);
  const [exportError, setExportError] = useState("");
  const code = profile.shortCode || "preview";
  const qrUrl = profile.shortCode
    ? getProfileShortUrl(profile.shortCode)
    : getProfileShortUrl("000000000000");

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    try {
      const modules = Number(svg.viewBox.baseVal.width);
      setQrDetails(getQrDetails(modules));
    } catch {
      setQrDetails(null);
    }
  }, [qrUrl]);

  function downloadDigitalSvg() {
    if (!svgRef.current) return;
    const svg = new XMLSerializer().serializeToString(svgRef.current);
    downloadBlob(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      `linkbase-${code}-qr.svg`,
    );
  }

  function downloadDigitalPng() {
    if (!svgRef.current) return;
    const svg = svgRef.current.cloneNode(true);
    svg.setAttribute("width", "1200");
    svg.setAttribute("height", "1200");
    const source = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], {
        type: "image/svg+xml;charset=utf-8",
      }),
    );
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1200;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(source);
        setExportError("Could not create the digital PNG.");
        return;
      }
      context.drawImage(image, 0, 0, 1200, 1200);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `linkbase-${code}-qr.png`);
        URL.revokeObjectURL(source);
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      setExportError("Could not create the digital PNG.");
    };
    image.src = source;
  }

  function downloadPhysicalSvg() {
    setExportError("");
    const svg = svgRef.current;
    const foreground = svg?.querySelector('path[fill="#000000"]');

    if (!svg || !foreground || !qrDetails) {
      setExportError("Physical SVG is not available for this QR code.");
      return;
    }

    try {
      const result = buildPhysicalQrSvg({
        foregroundPath: foreground.getAttribute("d"),
        viewBoxModules: Number(svg.viewBox.baseVal.width),
        moduleWidthMm,
        baseMarginMm,
      });
      downloadBlob(
        new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }),
        `linkbase-${code}-physical-qr.svg`,
      );
    } catch (error) {
      setExportError(error.message);
    }
  }

  let physicalDimensions = null;
  if (qrDetails) {
    try {
      physicalDimensions = getPhysicalQrDimensions({
        viewBoxModules: qrDetails.matrixModules + 8,
        moduleWidthMm,
        baseMarginMm,
      });
    } catch {
      physicalDimensions = null;
    }
  }

  return (
    <div className="profile-qr-export">
      <div className="public-qr-code-surface">
        <QRCodeSVG
          ref={svgRef}
          value={qrUrl}
          size={150}
          level="L"
          minVersion={1}
          boostLevel={false}
          marginSize={4}
          bgColor="#FFFFFF"
          fgColor="#000000"
          title="LinkBase profile QR code"
        />
      </div>
      {showManagementControls && (
        <div className="qr-export-controls">
          <a className="qr-short-url" href={qrUrl}>
            {qrUrl}
          </a>
          <div className="qr-digital-downloads">
            <button type="button" onClick={downloadDigitalSvg}>
              Download Digital SVG
            </button>
            <button type="button" onClick={downloadDigitalPng}>
              Download Digital PNG
            </button>
          </div>
          <details className="qr-physical-export">
            <summary>Physical QR SVG</summary>
            <div className="qr-physical-controls">
              <fieldset>
                <legend>Module width</legend>
                <div className="qr-module-width-options">
                  {PHYSICAL_QR_MODULE_WIDTHS.map((width) => (
                    <button
                      key={width}
                      type="button"
                      aria-pressed={moduleWidthMm === width}
                      onClick={() => setModuleWidthMm(width)}
                    >
                      {width.toFixed(1)} mm
                    </button>
                  ))}
                </div>
              </fieldset>
              <label>
                Base margin (mm)
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.2"
                  value={baseMarginMm}
                  onChange={(event) =>
                    setBaseMarginMm(Number(event.target.value))
                  }
                />
              </label>
            </div>
            {qrDetails && physicalDimensions && (
              <p className="qr-physical-specs">
                Version {qrDetails.version}; {qrDetails.matrixModules} x{" "}
                {qrDetails.matrixModules} modules; 4-module quiet zone;{" "}
                {physicalDimensions.backgroundWidthMm.toFixed(1)} mm square
                base.
              </p>
            )}
            <p className="qr-export-note">
              SVG layers are identified as background and foreground. Import and
              extrude them as separate CAD bodies; this export is SVG geometry,
              not an STL. With a 0.2 mm nozzle, module widths of 0.6/0.8/1.0 mm
              provide 3/4/5 nozzle widths.
            </p>
            {exportError && <p className="error-message">{exportError}</p>}
            <button
              type="button"
              onClick={downloadPhysicalSvg}
              disabled={!physicalDimensions}
            >
              Download Physical SVG
            </button>
          </details>
        </div>
      )}
    </div>
  );
}

export default ProfileQRCode;
