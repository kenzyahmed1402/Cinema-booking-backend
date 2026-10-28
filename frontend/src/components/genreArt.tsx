import type { ReactNode } from "react";

// Line-art posters for the fictional movies: one symbol and one muted accent
// colour per genre, drawn on a 200 x 300 canvas around the point (100, 115).
// Shapes that must hide lines behind them are filled with the poster's base.

export const POSTER_BASE = "#0b0b0b";

type GenreArt = { colour: string; art: ReactNode };

const sciFi: GenreArt = {
  colour: "#5cc2c6",
  art: (
    <>
      <circle cx="152" cy="62" r="5" />
      <circle cx="48" cy="58" r="1.5" />
      <circle cx="160" cy="168" r="1.5" />
      <circle cx="40" cy="150" r="1" />
      <path d="M44 184 A76 76 0 0 1 164 68" strokeDasharray="2 6" />
      <g transform="rotate(-18 100 115)">
        <ellipse cx="100" cy="115" rx="64" ry="15" />
        <circle cx="100" cy="115" r="36" fill={POSTER_BASE} />
        <path d="M100 79 A36 36 0 0 1 100 151" opacity="0.5" />
        <path d="M36 115 A64 15 0 0 0 164 115" />
      </g>
    </>
  ),
};

const horror: GenreArt = {
  colour: "#c4524e",
  art: (
    <>
      <path d="M140 46 A28 28 0 1 0 140 102 A22 22 0 1 1 140 46 Z" />
      <path d="M30 212 L170 212" />
      <path d="M84 212 C86 190 82 170 86 150 C88 138 84 126 80 112" />
      <path d="M85 160 C96 150 104 146 118 134 L130 120" />
      <path d="M104 146 L112 128" />
      <path d="M84 140 C72 132 66 124 58 108" />
      <path d="M66 122 L52 118" />
      <path d="M81 118 C88 106 90 96 96 86" />
      <path d="M86 176 C76 172 66 172 56 166" />
      <path d="M114 70 l6 4 l6 -4 M58 62 l5 3 l5 -3" />
    </>
  ),
};

const drama: GenreArt = {
  colour: "#c8a98a",
  art: (
    <>
      <path d="M60 68 Q100 52 140 68 Q144 132 100 178 Q56 132 60 68 Z" />
      <path d="M72 100 L94 91 M128 100 L106 91" />
      <path d="M74 112 Q84 104 94 112 M106 112 Q116 104 126 112" />
      <path d="M80 152 Q100 134 120 152" />
      <path d="M84 120 q-4 8 0 11 q4 -3 0 -11 Z" />
    </>
  ),
};

const comedy: GenreArt = {
  colour: "#e6bf62",
  art: (
    <>
      <path d="M60 68 Q100 52 140 68 Q144 132 100 178 Q56 132 60 68 Z" />
      <path d="M72 96 Q84 86 96 96 M104 96 Q116 86 128 96" />
      <path d="M74 110 Q84 100 94 110 M106 110 Q116 100 126 110" />
      <path d="M76 134 Q100 164 124 134 Q100 146 76 134 Z" />
      <path d="M148 58 l4 8 l8 4 l-8 4 l-4 8 l-4 -8 l-8 -4 l8 -4 Z" />
    </>
  ),
};

const romance: GenreArt = {
  colour: "#e08ea2",
  art: (
    <>
      <path d="M92 182 C52 152 42 120 62 102 C78 89 92 99 92 112 C92 99 106 89 122 102 C142 120 132 152 92 182 Z" />
      <path
        d="M92 182 C52 152 42 120 62 102 C78 89 92 99 92 112 C92 99 106 89 122 102 C142 120 132 152 92 182 Z"
        transform="translate(44 -30) scale(0.72) translate(-12 40)"
      />
      <path d="M40 70 l3 6 l6 3 l-6 3 l-3 6 l-3 -6 l-6 -3 l6 -3 Z" />
    </>
  ),
};

const action: GenreArt = {
  colour: "#e07a4f",
  art: (
    <>
      <path d="M114 56 L82 122 L104 122 L88 186 L132 106 L108 106 L126 56 Z" />
      <path d="M24 92 L70 92 M36 110 L66 110 M20 128 L72 128 M40 146 L64 146" />
      <path d="M140 140 L176 140 M146 158 L170 158" />
    </>
  ),
};

const animation: GenreArt = {
  colour: "#7fc8a9",
  art: (
    <>
      <path d="M100 66 Q104 106 144 112 Q104 118 100 158 Q96 118 56 112 Q96 106 100 66 Z" />
      <path d="M150 64 Q151 74 160 76 Q151 78 150 88 Q149 78 140 76 Q149 74 150 64 Z" />
      <path d="M52 152 Q53 160 60 162 Q53 164 52 172 Q51 164 44 162 Q51 160 52 152 Z" />
      <path d="M58 196 C80 176 104 214 126 192 C140 178 158 186 150 200 C144 210 128 204 134 194" />
      <circle cx="100" cy="112" r="62" strokeDasharray="1 7" />
    </>
  ),
};

const thriller: GenreArt = {
  colour: "#8ea7cf",
  art: (
    <>
      <circle cx="92" cy="108" r="38" />
      <circle cx="92" cy="108" r="31" opacity="0.4" />
      <path d="M120 136 L154 172" strokeWidth="3" />
      <circle cx="92" cy="100" r="8" />
      <path d="M88 107 L84 124 L100 124 L96 107" />
    </>
  ),
};

// Any other genre: a film reel in the site's ivory
const other: GenreArt = {
  colour: "#efe8da",
  art: (
    <>
      <circle cx="100" cy="112" r="44" />
      <circle cx="100" cy="112" r="6" />
      {[0, 72, 144, 216, 288].map((angle) => (
        <circle key={angle} cx="100" cy="88" r="10" transform={`rotate(${angle} 100 112)`} />
      ))}
      <path d="M144 112 C160 140 150 170 176 184" />
    </>
  ),
};

const BY_GENRE: Record<string, GenreArt> = {
  scifi: sciFi,
  sciencefiction: sciFi,
  horror,
  drama,
  comedy,
  romance,
  action,
  animation,
  thriller,
};

export const genreArt = (genre = "") => BY_GENRE[genre.toLowerCase().replace(/[^a-z]/g, "")] ?? other;
