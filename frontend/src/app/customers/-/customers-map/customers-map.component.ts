import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, viewChild } from '@angular/core';
import { CompanyService } from '@models/company/company.service';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import * as L from 'leaflet';
import { addDarkTileLayer } from '@constants/map-tiles';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { CustomerLocationDto } from '@models/_core/api-response';
import { modelListResource } from '@models/http/model-resource';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'customers-map',
    templateUrl: './customers-map.component.html',
    styleUrls: ['./customers-map.component.scss'],
    imports: [ToolbarComponent, SpinnerComponent],
})
export class CustomersMapComponent {
    private readonly mapContainer = viewChild.required<ElementRef<HTMLElement>>('mapContainer');

    #companyService = inject(CompanyService);
    #destroyRef = inject(DestroyRef);

    #map?: L.Map;
    #markers: L.Marker[] = [];
    #customers = modelListResource(() => this.#companyService.getWithCoordinates());
    customers = this.#customers.value;
    loading = this.#customers.isLoading;

    constructor() {
        delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
        L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
            iconUrl: 'assets/leaflet/marker-icon.png',
            shadowUrl: 'assets/leaflet/marker-shadow.png',
        });
        afterNextRender(() => this.#initializeMap());
        effect(() => {
            this.customers();
            if (this.#map) this.#addMarkersToMap();
        });
        this.#destroyRef.onDestroy(() => this.#map?.remove());
    }

    #initializeMap(): void {
        this.#map = L.map(this.mapContainer().nativeElement, {
            center: [50.0, 10.0], // Center of Europe
            zoom: 4,
            zoomControl: false,
            scrollWheelZoom: true,
            attributionControl: false,
        });

        addDarkTileLayer(this.#map);

        if (this.customers().length > 0) {
            this.#addMarkersToMap();
        }
    }

    #addMarkersToMap(): void {
        if (!this.#map) return;

        this.#markers.forEach((marker) => marker.remove());
        this.#markers = [];

        this.customers().forEach((customer) => {
            if (customer.lat && customer.lng && !isNaN(customer.lat) && !isNaN(customer.lng) && isFinite(customer.lat) && isFinite(customer.lng)) {
                const customIcon = this.#createCustomIcon(customer.pinSize, customer.pinColor);

                const marker = L.marker([customer.lat, customer.lng], { icon: customIcon })
                    .bindPopup(
                        `
                        <div class="customer-popup">
                            <h6>${customer.name}</h6>
                            <button class="btn btn-sm btn-primary mt-2" onclick="window.open('${customer.path}', '_blank')">
                                View Customer
                            </button>
                        </div>
                    `,
                    );

                marker.addTo(this.#map!);
                this.#markers.push(marker);
            } else {
                console.warn('Invalid coordinates for customer:', customer.name, customer.lat, customer.lng);
            }
        });

        if (this.#markers.length > 0) {
            const group = new L.FeatureGroup(this.#markers);
            this.#map.fitBounds(group.getBounds().pad(0.1));
        }
    }

    onMarkerClick(customer: CustomerLocationDto): void {
        window.open(customer.path, '_blank');
    }

    #createCustomIcon(size: string, color: string): L.Icon {
        const sizes: Dictionary<[number, number]> = {
            small: [12, 19],
            medium: [18, 29],
            large: [24, 38],
        };

        const iconSize = sizes[size as keyof typeof sizes] || sizes.small;
        return L.icon({
            iconUrl: `data:image/svg+xml;base64,${btoa(this.#createMarkerSvg(color))}`,
            shadowUrl: 'assets/leaflet/marker-shadow.png',
            iconSize: iconSize,
            iconAnchor: [iconSize[0] / 2, iconSize[1]],
            popupAnchor: [0, -iconSize[1]],
            shadowSize: [41, 41],
            shadowAnchor: [12, 41],
        });
    }

    #createMarkerSvg(color: string): string {
        const colors = {
            grey: '#6c757d',
            red: '#dc3545',
            orange: '#fd7e14',
            yellow: '#ffc107',
            green: '#28a745',
        };

        const fillColor = colors[color as keyof typeof colors] || colors.grey;
        return `
            <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.5 0C5.596 0 0 5.596 0 12.5c0 12.5 12.5 28.5 12.5 28.5s12.5-16 12.5-28.5C25 5.596 19.404 0 12.5 0z" 
                      fill="${fillColor}" 
                      stroke="#000" 
                      stroke-width="1"/>
                <circle cx="12.5" cy="12.5" r="4" fill="#fff"/>
            </svg>
        `;
    }
}
