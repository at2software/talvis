import * as L from 'leaflet';

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const DARK_TILE_FILTER = 'invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9) saturate(0.4)';

export const addDarkTileLayer = (map: L.Map): L.TileLayer => {
    const tilePane = map.getPane('tilePane');
    if (tilePane) tilePane.style.filter = DARK_TILE_FILTER;

    const attribution = L.control.attribution({ prefix: false }).addTo(map);
    const container = attribution.getContainer();
    if (container) Object.assign(container.style, { background: 'rgba(0, 0, 0, 0.6)', color: 'var(--bs-secondary-color)' });

    return L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
};
