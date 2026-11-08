import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import {
  buildPhysicalQrSvg,
  getPhysicalQrDimensions,
  getQrDetails,
} from "../src/utils/physicalQrSvg.js";
import { getProfileShortUrl } from "../src/utils/profileShortUrl.js";

test("qrcode.react renders the short URL as a minimum-version SVG with separate paths", () => {
  const shortUrl = getProfileShortUrl("a7c29c3d4e5f");
  assert.equal(shortUrl, "https://app.linkbase.co.za/a7c29c3d4e5f");
  const markup = renderToStaticMarkup(
    React.createElement(QRCodeSVG, {
      value: shortUrl,
      size: 150,
      level: "L",
      minVersion: 1,
      boostLevel: false,
      marginSize: 4,
    }),
  );
  const viewBoxModules = Number(markup.match(/viewBox="0 0 (\d+) \d+"/)?.[1]);
  const details = getQrDetails(viewBoxModules);

  assert.equal(details.version, 3);
  assert.equal(details.matrixModules, 29);
  assert.match(markup, /fill="#FFFFFF"/);
  assert.match(markup, /fill="#000000"/);
});

test("physical QR SVG separates a four-module matrix from its white base", () => {
  const output = buildPhysicalQrSvg({
    foregroundPath: "M4 4h1v1H4zM8 8h1v1H8z",
    viewBoxModules: 45,
    moduleWidthMm: 0.8,
    baseMarginMm: 2,
  });

  assert.equal(output.dimensions.version, 5);
  assert.equal(output.dimensions.matrixModules, 37);
  assert.equal(output.dimensions.moduleCount, 1369);
  assert.equal(output.dimensions.quietZoneModules, 4);
  assert.equal(output.dimensions.backgroundWidthMm, 40);
  assert.match(output.svg, /id="background"[^>]+fill="#FFFFFF"/);
  assert.match(output.svg, /id="foreground"[^>]+fill="#000000"/);
  assert.match(output.svg, /transform="translate\(2 2\) scale\(0\.8\)"/);
});

test("physical QR dimensions support the three tested module widths", () => {
  const dimensions = [0.6, 0.8, 1.0].map((moduleWidthMm) =>
    getPhysicalQrDimensions({ viewBoxModules: 37, moduleWidthMm }),
  );

  assert.deepEqual(
    dimensions.map((item) => item.backgroundWidthMm),
    [26.2, 33.6, 41],
  );
});

test("QR version is derived after excluding the four-module margins", () => {
  assert.deepEqual(getQrDetails(37), {
    version: 3,
    matrixModules: 29,
    moduleCount: 841,
  });
  assert.throws(() => getQrDetails(38), /valid QR matrix/);
});

test("physical SVG rejects unsupported sizes and unsafe path data", () => {
  assert.throws(
    () => getPhysicalQrDimensions({ viewBoxModules: 37, moduleWidthMm: 0.7 }),
    /Module width/,
  );
  assert.throws(
    () =>
      buildPhysicalQrSvg({
        foregroundPath: 'M0 0" onload="alert(1)',
        viewBoxModules: 37,
      }),
    /unsupported SVG data/,
  );
});
