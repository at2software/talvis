import * as L from 'leaflet';

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/**
 * Adds the OSM tile layer. The theme look (inverted tiles in dark mode, plain tiles in light mode)
 * comes from `src/scss/_leaflet.scss` via `--tv-map-tile-filter`, so it follows a live theme switch.
 */
export const addThemedTileLayer = (map: L.Map): L.TileLayer => {
    L.control.attribution({ prefix: false }).addTo(map);
    return L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
};
