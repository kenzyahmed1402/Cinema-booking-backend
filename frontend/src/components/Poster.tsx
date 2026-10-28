import { useId } from "react";
import { genreArt, POSTER_BASE } from "./genreArt";

// The movies are fictional and have no artwork, so each gets a line-art
// poster for its genre. The title nudges the drawing and its glow, so two
// movies of the same genre don't look like copies.
const hash = (text: string) => [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);

const between = (seed: number, min: number, max: number) => min + (seed % 1000) / 999 * (max - min);

export const Poster = ({ title, genre, size = "large" }: { title: string; genre?: string; size?: "large" | "small" }) => {
  const glowId = useId();
  const { colour, art } = genreArt(genre);
  const seed = hash(title);
  const dx = between(seed, -10, 10);
  const dy = between(seed >>> 10, -8, 8);
  const turn = between(seed >>> 20, -6, 6);
  const scale = between(seed >>> 5, 0.92, 1.06);
  const glowX = between(seed >>> 15, 35, 65);

  return (
    <div className={`poster ${size}`} role="img" aria-label={`Poster for ${title}${genre ? `, ${genre}` : ""}`}>
      <svg className="poster-art" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id={glowId} cx={`${glowX}%`} cy="38%" r="60%">
            <stop offset="0" stopColor={colour} stopOpacity="0.24" />
            <stop offset="1" stopColor={colour} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="200" height="300" fill={POSTER_BASE} />
        <rect width="200" height="300" fill={`url(#${glowId})`} />
        <rect x="8" y="8" width="184" height="284" rx="6" fill="none" stroke={colour} strokeOpacity="0.18" vectorEffect="non-scaling-stroke" />
        <g
          transform={`translate(${dx.toFixed(1)} ${dy.toFixed(1)}) rotate(${turn.toFixed(1)} 100 115) translate(100 115) scale(${scale.toFixed(3)}) translate(-100 -115)`}
          fill="none"
          stroke={colour}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {art}
        </g>
      </svg>
      {genre && <span className="poster-genre">{genre}</span>}
      <span className="poster-title">{title}</span>
    </div>
  );
};
