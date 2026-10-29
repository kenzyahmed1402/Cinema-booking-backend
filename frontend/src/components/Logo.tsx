import { LOGO_LIT_RADIUS, LOGO_SCREEN, LOGO_SCREEN_WIDTH, LOGO_SEAT_RADIUS, LOGO_SEAT_WIDTH, LOGO_SEATS } from "../logo";

// The Seatora symbol in the theme's ivory
export const Logo = ({ size = 30 }: { size?: number }) => (
  <svg className="logo" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
    <path d={LOGO_SCREEN} fill="none" stroke="var(--accent)" strokeWidth={LOGO_SCREEN_WIDTH} strokeLinecap="round" />
    {LOGO_SEATS.map((seat) =>
      seat.lit ? (
        <circle key={`${seat.x}-${seat.y}`} cx={seat.x} cy={seat.y} r={LOGO_LIT_RADIUS} fill="var(--accent)" />
      ) : (
        <circle
          key={`${seat.x}-${seat.y}`}
          cx={seat.x}
          cy={seat.y}
          r={LOGO_SEAT_RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={LOGO_SEAT_WIDTH}
        />
      )
    )}
  </svg>
);
