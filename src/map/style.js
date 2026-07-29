import { layers, namedFlavor } from '@protomaps/basemaps';

// Local Lokoja/Felele extract, served from public/map/ (see docs/ROADMAP.md Day 2).
const PMTILES_PATH = '/map/felele.pmtiles';

export function buildStyle() {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${PMTILES_PATH}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers('protomaps', namedFlavor('light'), { lang: 'en' }),
  };
}
