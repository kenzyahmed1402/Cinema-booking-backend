// The Seatora symbol on a 64 x 64 grid: the cinema screen, and two curved
// rows of seats with yours lit in the middle. Drawn in ivory line art; the
// header and the ticket image both use this, so they always match. The
// favicons in public/ are a bolder version made for small sizes.

export const LOGO_SCREEN = "M13 17 Q32 9 51 17";

export const LOGO_SEATS: { x: number; y: number; lit?: boolean }[] = [
  { x: 12, y: 32 },
  { x: 22, y: 35 },
  { x: 32, y: 36, lit: true },
  { x: 42, y: 35 },
  { x: 52, y: 32 },
  { x: 17, y: 47.3 },
  { x: 27, y: 49.7 },
  { x: 37, y: 49.7 },
  { x: 47, y: 47.3 },
];

export const LOGO_SEAT_RADIUS = 3;
export const LOGO_LIT_RADIUS = 4.2;
export const LOGO_SCREEN_WIDTH = 3.6;
export const LOGO_SEAT_WIDTH = 1.86;

// Draws the symbol on a canvas at (x, y), size pixels wide
export const drawLogo = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineCap = "round";
  ctx.lineWidth = LOGO_SCREEN_WIDTH;
  ctx.stroke(new Path2D(LOGO_SCREEN));
  ctx.lineWidth = LOGO_SEAT_WIDTH;
  for (const seat of LOGO_SEATS) {
    ctx.beginPath();
    ctx.arc(seat.x, seat.y, seat.lit ? LOGO_LIT_RADIUS : LOGO_SEAT_RADIUS, 0, Math.PI * 2);
    if (seat.lit) ctx.fill();
    else ctx.stroke();
  }
  ctx.restore();
};
