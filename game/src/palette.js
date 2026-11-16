// The look plan, in one place. Dusk in a desert freight yard: warm sand, dark steel,
// one amber accent. The same names are the CSS custom properties in index.html.
// sable / vulture are the two teams' colours, used for visors, markers and the HUD.
export const PALETTE = {
  canvas: '#17130e',
  surface: '#262015',
  hairline: '#4a3d27',
  ink: '#f0e6d2',
  muted: '#a08b6d',
  accent: '#e07b39',
  sable: '#4fb3a1',
  vulture: '#d45a4a',
};

export function shade(name) {
  return PALETTE[name];
}
