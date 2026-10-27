import type { CSSProperties } from "react";

// The movies are fictional and have no artwork, so each gets a generated
// poster: a glowing gradient whose colours come from its title
const hash = (text: string) => [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);

export const posterStyle = (title: string): CSSProperties => {
  const seed = hash(title);
  // Hues in the violet / indigo / blue / cyan range of the theme
  const hueA = 190 + (seed % 90);
  const hueB = 190 + ((seed >>> 8) % 90);
  const x = 20 + ((seed >>> 16) % 60);
  return {
    background: [
      `radial-gradient(circle at ${x}% 25%, hsl(${hueA} 90% 65% / 0.85), transparent 55%)`,
      `radial-gradient(circle at ${100 - x}% 85%, hsl(${hueB} 85% 55% / 0.75), transparent 60%)`,
      `linear-gradient(160deg, hsl(${hueB} 60% 18%), hsl(${hueA} 55% 8%))`,
    ].join(", "),
  };
};

export const Poster = ({ title, genre, size = "large" }: { title: string; genre?: string; size?: "large" | "small" }) => (
  <div className={`poster ${size}`} style={posterStyle(title)} role="img" aria-label={`Poster for ${title}`}>
    {genre && <span className="poster-genre">{genre}</span>}
    <span className="poster-title">{title}</span>
  </div>
);
