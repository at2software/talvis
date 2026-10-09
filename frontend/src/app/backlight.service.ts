import { Service } from '@angular/core';
import { whenIdle } from '@constants/idle';

const GRID = 3;
const INTERVAL_MS = 2500;
const TARGET_SELECTOR = '.card, .logo';
const BACKGROUND_TARGET = 'logo';
const LINE_SELECTOR = '.progress-bar';
const MIN_LINE = 0.25;
const COVERAGE_GAIN = 3;
const EDGE_CELLS: [number, number][] = [[2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];

@Service()
export class BacklightService {
    #canvas = this.#createCanvas();
    #applied = new WeakMap<HTMLElement, string>();
    #backgrounds = new Map<string, HTMLImageElement | null>();

    constructor() {
        setInterval(() => {
            if (!document.hidden) whenIdle(() => this.#sampleAll(), INTERVAL_MS);
        }, INTERVAL_MS);
    }

    #createCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = GRID;
        return canvas.getContext('2d', { willReadFrequently: true })!;
    }

    #sampleAll() {
        for (const target of document.querySelectorAll<HTMLElement>(TARGET_SELECTOR)) {
            if (target.parentElement?.closest('.card')) continue;
            const rect = target.getBoundingClientRect();
            if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) continue;
            this.#apply(target, this.#sample(target, rect));
        }
    }

    #sample(target: HTMLElement, targetRect: DOMRect): string[] | null {
        const images: [CanvasImageSource, DOMRect][] = [...target.querySelectorAll<HTMLCanvasElement | HTMLImageElement>('canvas, img')]
            .filter(isReadable)
            .map(el => [el, el.getBoundingClientRect()]);
        const background = target.classList.contains(BACKGROUND_TARGET) && this.#backgroundImage(target);
        if (background) images.push([background, targetRect]);
        const lines = target.querySelectorAll<HTMLElement>(LINE_SELECTOR);
        if (!images.length && !lines.length) return null;

        const ctx = this.#canvas;
        const sx = GRID / targetRect.width;
        const sy = GRID / targetRect.height;
        const project = (r: DOMRect) => [(r.left - targetRect.left) * sx, (r.top - targetRect.top) * sy, r.width * sx, r.height * sy] as const;

        ctx.clearRect(0, 0, GRID, GRID);
        ctx.imageSmoothingQuality = 'high';
        for (const [image, r] of images) {
            if (r.width && r.height) ctx.drawImage(image, ...project(r));
        }
        for (const line of lines) {
            const r = line.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const [x, y, w, h] = project(r);
            const thick = Math.max(h, MIN_LINE);
            ctx.fillStyle = getComputedStyle(line).backgroundColor;
            ctx.fillRect(x, y + (h - thick) / 2, Math.max(w, MIN_LINE), thick);
        }

        let data: Uint8ClampedArray;
        try {
            data = ctx.getImageData(0, 0, GRID, GRID).data;
        } catch {
            this.#canvas = this.#createCanvas();
            return null;
        }

        const colors = EDGE_CELLS.map(([x, y]) => glow(data, (y * GRID + x) * 4));
        return colors.some(c => c !== 'transparent') ? colors : null;
    }

    #backgroundImage(el: HTMLElement): HTMLImageElement | null {
        const url = /url\("?(.*?)"?\)/.exec(getComputedStyle(el).backgroundImage)?.[1];
        if (!url) return null;

        let image = this.#backgrounds.get(url);
        if (image === undefined) {
            image = new Image();
            if (new URL(url, location.href).origin !== location.origin) image.crossOrigin = 'anonymous';
            image.onerror = () => this.#backgrounds.set(url, null);
            image.src = url;
            this.#backgrounds.set(url, image);
        }
        return image?.complete && image.naturalWidth ? image : null;
    }

    #apply(target: HTMLElement, colors: string[] | null) {
        const key = colors?.join() ?? '';
        if (this.#applied.get(target) === key) return;
        this.#applied.set(target, key);

        if (!colors) {
            target.removeAttribute('data-backlight');
            return;
        }
        colors.forEach((c, i) => target.style.setProperty(`--backlight-${i}`, c));
        target.setAttribute('data-backlight', '');
    }
}

function isReadable(el: HTMLCanvasElement | HTMLImageElement): boolean {
    if (el instanceof HTMLCanvasElement) return el.width > 0 && el.height > 0;
    if (!el.complete || !el.naturalWidth) return false;
    if (el.crossOrigin !== null) return true;
    const url = new URL(el.currentSrc || el.src, location.href);
    return url.origin === location.origin || url.protocol === 'data:' || url.protocol === 'blob:';
}

function glow(data: Uint8ClampedArray, i: number): string {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const alpha = Math.round(Math.min(1, (a / 255) * COVERAGE_GAIN) * Math.min(1, chroma * 2.5) * 100) / 100;
    return alpha < 0.05 ? 'transparent' : `rgb(${r} ${g} ${b} / ${alpha})`;
}
