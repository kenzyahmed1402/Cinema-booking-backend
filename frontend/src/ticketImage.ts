import { longDate, money } from "./format";
import type { BookingDetail } from "./types";
import { qrPath } from "./components/QrCode";
import { ticketLink, ticketReference } from "./components/TicketCard";

// The ticket as a PNG picture, drawn in the browser (nothing is uploaded).
// The poster is copied from the ticket on screen; if the browser won't allow
// that picture on a canvas, the ticket is drawn without it.

const WIDTH = 900;
const HEIGHT = 1320;
const SERIF = '"Playfair Display Variable", Georgia, serif';
const SANS = '"Inter Variable", system-ui, sans-serif';

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image"));
    image.src = src;
  });

const posterImage = async (posterSvg: SVGSVGElement | null) => {
  if (!posterSvg) return null;
  const copy = posterSvg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("width", "200");
  copy.setAttribute("height", "300");
  const xml = new XMLSerializer().serializeToString(copy);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`).catch(() => null);
};

// Splits text into lines that fit a width
const wrap = (ctx: CanvasRenderingContext2D, text: string, width: number) => {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const draw = (booking: BookingDetail, poster: HTMLImageElement | null) => {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const { showtime } = booking;

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#141414";
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(40, 40, WIDTH - 80, HEIGHT - 80, 36);
  ctx.fill();
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#efe8da";
  ctx.font = `600 34px ${SERIF}`;
  ctx.fillText("Seatora", 90, 120);
  ctx.font = `600 22px ${SANS}`;
  ctx.textAlign = "right";
  ctx.fillText(`ADMIT ${booking.seats.length}`, WIDTH - 90, 118);
  ctx.textAlign = "left";

  if (poster) ctx.drawImage(poster, 90, 170, 200, 300);
  const textX = poster ? 330 : 90;
  const textWidth = WIDTH - 90 - textX;

  ctx.fillStyle = "#fafafa";
  ctx.font = `600 50px ${SERIF}`;
  let y = 225;
  for (const line of wrap(ctx, showtime.movie.title, textWidth).slice(0, 3)) {
    ctx.fillText(line, textX, y);
    y += 60;
  }
  ctx.fillStyle = "#d6d6d6";
  ctx.font = `400 26px ${SANS}`;
  y += 10;
  for (const line of [
    longDate(showtime.startTime),
    `${showtime.screen.cinema?.name ?? "Cinema"} · Screen ${showtime.screen.screenNumber}`,
    `Seats ${[...booking.seats].sort().join(", ")}`,
  ]) {
    for (const part of wrap(ctx, line, textWidth)) {
      ctx.fillText(part, textX, y);
      y += 40;
    }
  }

  // The tear line, with a notch cut on each side
  const tearY = 540;
  ctx.strokeStyle = "#3a3a3a";
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(70, tearY);
  ctx.lineTo(WIDTH - 70, tearY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#0a0a0a";
  for (const x of [40, WIDTH - 40]) {
    ctx.beginPath();
    ctx.arc(x, tearY, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  // The QR code, dark on white with a quiet zone
  const qr = qrPath(ticketLink(booking._id));
  const side = 420;
  const qrX = (WIDTH - side) / 2;
  const qrY = 600;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX, qrY, side, side);
  const cell = Math.floor((side - 40) / qr.size);
  const offset = (side - cell * qr.size) / 2;
  ctx.fillStyle = "#0a0a0a";
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.isDark(row, col)) ctx.fillRect(qrX + offset + col * cell, qrY + offset + row * cell, cell, cell);
    }
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#8f8f8f";
  ctx.font = `500 22px ${SANS}`;
  ctx.fillText("REFERENCE", WIDTH / 2, 1090);
  ctx.fillStyle = "#fafafa";
  ctx.font = `600 46px ${SERIF}`;
  ctx.fillText(ticketReference(booking._id), WIDTH / 2, 1145);
  ctx.fillStyle = "#efe8da";
  ctx.font = `500 26px ${SANS}`;
  ctx.fillText(`Paid ${money(booking.totalPrice)} with PayPal`, WIDTH / 2, 1195);
  ctx.fillStyle = "#8f8f8f";
  ctx.font = `400 20px ${SANS}`;
  ctx.fillText("Fictional cinema · PayPal Sandbox, no real money", WIDTH / 2, 1245);
  return canvas;
};

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), "image/png");
    } catch (err) {
      reject(err);
    }
  });

export const downloadTicketImage = async (booking: BookingDetail, posterSvg: SVGSVGElement | null) => {
  await document.fonts.ready;
  const poster = await posterImage(posterSvg);
  let blob: Blob;
  try {
    blob = await toBlob(draw(booking, poster));
  } catch {
    blob = await toBlob(draw(booking, null));
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Seatora-ticket-${ticketReference(booking._id)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
