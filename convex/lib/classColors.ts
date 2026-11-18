const HUES = [4, 26, 48, 96, 150, 184, 214, 332];

function hslToHex(hue: number, saturation: number, lightness: number) {
  const sat = saturation / 100;
  const lig = lightness / 100;
  const chroma = (1 - Math.abs(2 * lig - 1)) * sat;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (section < 1) {
    red = chroma;
    green = x;
  } else if (section < 2) {
    red = x;
    green = chroma;
  } else if (section < 3) {
    green = chroma;
    blue = x;
  } else if (section < 4) {
    green = x;
    blue = chroma;
  } else if (section < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }
  const match = lig - chroma / 2;
  const channel = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

/** Eight families, eight steps each. A row shares one hue. */
export const CLASS_COLORS: readonly string[] = HUES.flatMap((hue) =>
  Array.from({ length: 8 }, (_, step) => {
    const lightness = 34 + step * 6;
    const saturation = step < 4 ? 62 + step * 4 : 74 - (step - 4) * 6;
    return hslToHex(hue, saturation, lightness);
  }),
);

const COLOR_SET = new Set(CLASS_COLORS);

export function isClassColor(value: string) {
  return COLOR_SET.has(value);
}
