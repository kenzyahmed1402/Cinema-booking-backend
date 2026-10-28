import type { CSSProperties } from "react";

// The movies are fictional and have no artwork, so each gets a generated
// poster: soft light over a dark base, its colours taken from the title.
// Posters are the only colourful part of the calm page.
const hash = (text: string) => [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);

// Clear, cinematic hues; yellow-greens are left out because they turn muddy
// on a dark base
const HUES = [205, 225, 250, 270, 290, 315, 335, 355, 15, 30, 170, 188];

export const posterStyle = (title: string): CSSProperties => {
  const seed = hash(title);
  const hueA = HUES[seed % HUES.length];
  // a close neighbour, so the two lights blend instead of clashing
  const hueB = (hueA + 18 + ((seed >>> 9) % 24)) % 360;
  const x = 20 + ((seed >>> 16) % 60);
  return {
    background: [
      `radial-gradient(circle at ${x}% 22%, hsl(${hueA} 70% 58% / 0.9), transparent 58%)`,
      `radial-gradient(circle at ${100 - x}% 78%, hsl(${hueB} 65% 45% / 0.8), transparent 62%)`,
      `linear-gradient(170deg, hsl(${hueB} 35% 16%), hsl(${hueA} 30% 7%))`,
    ].join(", "),
  };
};

export const Poster = ({ title, genre, size = "large" }: { title: string; genre?: string; size?: "large" | "small" }) => (
  <div className={`poster ${size}`} style={posterStyle(title)} role="img" aria-label={`Poster for ${title}`}>
    {genre && <span className="poster-genre">{genre}</span>}
    <span className="poster-title">{title}</span>
  </div>
);
