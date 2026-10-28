import { useMemo } from "react";
import qrcode from "qrcode-generator";

// The QR code's dark squares as one SVG path, drawn by React: no markup is
// ever inserted as raw HTML. Medium error correction survives a creased or
// partly covered printout.
export const qrPath = (text: string) => {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let d = "";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    }
  }
  return { size, d, isDark: (row: number, col: number) => qr.isDark(row, col) };
};

// Dark on light with a quiet zone around it, as scanners expect
export const QrCode = ({ text, label }: { text: string; label: string }) => {
  const { size, d } = useMemo(() => qrPath(text), [text]);
  const margin = 4;
  const box = size + margin * 2;
  return (
    <svg className="qr" viewBox={`0 0 ${box} ${box}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={box} height={box} fill="#ffffff" />
      <path d={d} transform={`translate(${margin} ${margin})`} fill="#0a0a0a" />
    </svg>
  );
};
