import { layers, namedFlavor } from '@protomaps/basemaps';

// Local Lokoja/Felele extract, served from public/map/ (see docs/ROADMAP.md Day 2).
const PMTILES_PATH = '/map/felele.pmtiles';

// Esri's World Imagery service: free to use, no API key or billing, served
// as plain XYZ raster tiles -- fits the free-tools-only constraint the same
// way the OSM/Protomaps basemap does, just aerial photography instead of
// vector map data. There's no vector data to draw ourselves here, so the
// campus buildings/paths/place layers (added separately in MapView) are
// what make it readable rather than just a photo.
const ESRI_WORLD_IMAGERY_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
];

export function buildStyle(flavor = 'light') {
  if (flavor === 'satellite') {
    return {
      version: 8,
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: ESRI_WORLD_IMAGERY_TILES,
          tileSize: 256,
          maxzoom: 19,
          attribution:
            'Imagery: Esri, Maxar, Earthstar Geographics | Paths &amp; buildings: <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        },
      },
      layers: [{ id: 'esri-satellite-layer', type: 'raster', source: 'esri-satellite' }],
    };
  }

  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${flavor}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${PMTILES_PATH}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers('protomaps', namedFlavor(flavor), { lang: 'en' }),
  };
}
