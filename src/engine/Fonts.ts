/** Subset UI fonts in public/fonts (see scripts/subset_fonts.py); falls back to the system serif on failure. */
export async function loadFonts(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const faces = [
    new FontFace('Cinzel', `url(${base}fonts/cinzel.woff2) format("woff2")`, { weight: '400 900' }),
    new FontFace('Noto Serif TC', `url(${base}fonts/noto-serif-tc.woff2) format("woff2")`, { weight: '200 900' }),
  ];
  await Promise.all(
    faces.map(async (f) => {
      try {
        document.fonts.add(await f.load());
      } catch {
        /* system serif */
      }
    }),
  );
}
