import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { modelResource } from '@models/http/model-resource';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { CodeEditorComponent } from '@app/_shards/code-editor/code-editor.component';
import { PdfLogo, PdfTemplateService } from '@models/pdf-template.service';
import { Toast } from '@shards/toast/toast';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

const A4_WIDTH_PX = (210 * 96) / 25.4;

const SHIM_CSS = `
html,body{margin:0;padding:0;background:#525659;}
body{padding:24px 0;}
.pdf-page{position:relative;width:210mm;min-height:297mm;margin:0 auto;background:#fff;color:#000;
  padding:125mm 20mm 30pt 25mm;box-sizing:border-box;box-shadow:0 4px 24px rgba(0,0,0,.5);overflow:hidden;counter-reset:page 1;}
.pdf-flow{position:relative;}
.pdf-flow .footer{position:absolute;}
[data-pdfedit-id]{cursor:pointer;}
[data-pdfedit-id]:hover{outline:1px dashed rgba(178,210,53,.6);outline-offset:1px;}`;

const CLIENT_SCRIPT = `(function(){
  var HL='2px solid #b2d235';var sel=null;
  function send(t,d){d=d||{};d.source='pdfedit';d.type=t;parent.postMessage(d,'*');}
  function computed(el){var c=getComputedStyle(el);return{fontSize:c.fontSize,color:c.color,fontWeight:c.fontWeight,
    fontStyle:c.fontStyle,textAlign:c.textAlign,marginTop:c.marginTop,marginBottom:c.marginBottom,
    paddingTop:c.paddingTop,paddingBottom:c.paddingBottom};}
  document.addEventListener('click',function(e){
    var el=e.target;while(el&&el!==document.body&&!el.getAttribute('data-pdfedit-id'))el=el.parentElement;
    e.preventDefault();e.stopPropagation();
    if(sel)sel.style.outline='';
    if(!el||el===document.body||!el.getAttribute('data-pdfedit-id')){sel=null;send('select',{id:null});return;}
    sel=el;el.style.outline=HL;
    send('select',{id:el.getAttribute('data-pdfedit-id'),computed:computed(el)});
  },true);
  window.addEventListener('message',function(e){
    var d=e.data;if(!d||d.source!=='pdfedit-parent')return;
    var el=document.querySelector('[data-pdfedit-id="'+d.id+'"]');
    if(d.type==='style'&&el){for(var k in d.style){el.style[k]=d.style[k];}}
    else if(d.type==='text'&&el){el.textContent=d.text;}
    else if(d.type==='zoom'){document.documentElement.style.zoom=d.value;}
    else if(d.type==='deselect'){if(sel){sel.style.outline='';sel=null;}}
  });
})();`;

interface Selected {
    id: string;
    tag: string;
    text: string | null;
    fontSize: string;
    color: string;
    bold: boolean;
    italic: boolean;
    textAlign: string;
    marginTop: string;
    marginBottom: string;
    paddingTop: string;
    paddingBottom: string;
}

const TOKEN_LABELS: Record<string, string> = {
    companyName: $localize`:@@i18n.settings.pdf.token.companyName:company name`,
    companyAddress: $localize`:@@i18n.settings.pdf.token.companyAddress:address in one line`,
    companyStreet: $localize`:@@i18n.settings.pdf.token.companyStreet:street`,
    companyPostcode: $localize`:@@i18n.settings.pdf.token.companyPostcode:postcode`,
    companyCity: $localize`:@@i18n.settings.pdf.token.companyCity:city`,
    companyCountry: $localize`:@@i18n.settings.pdf.token.companyCountry:country`,
    companyWeb: $localize`:@@i18n.settings.pdf.token.companyWeb:website`,
    companyMail: $localize`:@@i18n.settings.pdf.token.companyMail:email`,
    companyPhone: $localize`:@@i18n.settings.pdf.token.companyPhone:phone`,
    companyFax: $localize`:@@i18n.settings.pdf.token.companyFax:fax`,
    companyOwners: $localize`:@@i18n.settings.pdf.token.companyOwners:managing directors`,
    companyRegisterNumber: $localize`:@@i18n.settings.pdf.token.companyRegisterNumber:commercial register number`,
    companyRegisterCourt: $localize`:@@i18n.settings.pdf.token.companyRegisterCourt:register court`,
    companyVatId: $localize`:@@i18n.settings.pdf.token.companyVatId:VAT ID`,
    companyTaxId: $localize`:@@i18n.settings.pdf.token.companyTaxId:tax number`,
    companyIban: $localize`:@@i18n.settings.pdf.token.companyIban:IBAN`,
    companyBic: $localize`:@@i18n.settings.pdf.token.companyBic:BIC`,
    companyContact: $localize`:@@i18n.settings.pdf.token.companyContact:contact block`,
    companyRegistration: $localize`:@@i18n.settings.pdf.token.companyRegistration:registration block`,
    companyBankDetails: $localize`:@@i18n.settings.pdf.token.companyBankDetails:bank details block`,
    companyHeader: $localize`:@@i18n.settings.pdf.token.companyHeader:footer table with contact, registration and bank details`,
    senderAddress: $localize`:@@i18n.settings.pdf.token.senderAddress:sender line above the address`,
    place: $localize`:@@i18n.settings.pdf.token.place:place in the date line`,
    logo: $localize`:@@i18n.settings.pdf.token.logo:logo, use as image source`,
    documentTitle: $localize`:@@i18n.settings.pdf.token.documentTitle:document title`,
    address: $localize`:@@i18n.settings.pdf.token.address:recipient address`,
    headerInfo: $localize`:@@i18n.settings.pdf.token.headerInfo:info block with contact person and customer number`,
    dayNow: $localize`:@@i18n.settings.pdf.token.dayNow:date`,
    content: $localize`:@@i18n.settings.pdf.token.content:document content`,
    footerContext: $localize`:@@i18n.settings.pdf.token.footerContext:document name in the footer`,
    pageLabel: $localize`:@@i18n.settings.pdf.token.pageLabel:word "page"`,
    pageOfLabel: $localize`:@@i18n.settings.pdf.token.pageOfLabel:word "of"`,
    pageCount: $localize`:@@i18n.settings.pdf.token.pageCount:total number of pages`,
};

interface Placeholder {
    token: string;
    label: string;
    value: string;
}

type StyleProp = 'fontSize' | 'color' | 'fontWeight' | 'fontStyle' | 'textAlign' | 'marginTop' | 'marginBottom' | 'paddingTop' | 'paddingBottom';

@Component({
    selector: 'app-settings-pdf',
    templateUrl: './settings-pdf.component.html',
    styleUrl: './settings-pdf.component.scss',
    imports: [FormsModule, NgTemplateOutlet, ToolbarComponent, CodeEditorComponent, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPdfComponent {
    readonly saving = signal(false);
    readonly rendering = signal(false);
    readonly dirty = signal(false);

    readonly panelTab = signal<'element' | 'placeholders' | 'code'>('element');
    readonly selected = signal<Selected | null>(null);
    readonly selectedHtml = signal('');
    readonly pdfUrl = signal<SafeResourceUrl | null>(null);

    private readonly iframe = viewChild<ElementRef<HTMLIFrameElement>>('preview');

    #svc = inject(PdfTemplateService);
    #sanitizer = inject(DomSanitizer);
    #parser = new DOMParser();
    #reloadTimer?: ReturnType<typeof setTimeout>;
    #objectUrl?: string;
    #zoom = 1;
    #ro?: ResizeObserver;

    readonly #template = modelResource(() => this.#svc.load());
    readonly loading = this.#template.isLoading;
    readonly baseUrl = computed(() => this.#template.value()?.baseUrl ?? '');
    readonly pdfBase = computed(() => this.#template.value()?.pdfBase ?? '');
    readonly html = linkedSignal(() => this.#template.value()?.html ?? '');
    readonly css = linkedSignal(() => this.#template.value()?.css ?? '');
    readonly logoUrl = linkedSignal(() => this.#template.value()?.logoUrl ?? '');
    readonly hasCustomLogo = linkedSignal(() => this.#template.value()?.hasCustomLogo ?? false);
    readonly customized = linkedSignal(() => this.#template.value()?.customized ?? false);
    readonly #tokens = computed(() => this.#template.value()?.tokens ?? {});
    readonly #logoSources = computed(() => this.#template.value()?.logoSources ?? []);
    readonly senderPlaceholders = computed(() => this.#placeholders(this.#template.value()?.senderTokens ?? []));
    readonly documentPlaceholders = computed(() => this.#placeholders(this.#template.value()?.documentTokens ?? []));

    constructor() {
        inject(DestroyRef).onDestroy(() => {
            this.#ro?.disconnect();
            if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl);
        });
        effect(() => {
            if (!this.#template.hasValue()) return;
            this.dirty.set(false);
            setTimeout(() => this.reloadPreview());
        });
    }

    reloadPreview(attempt = 0) {
        const frame = this.iframe()?.nativeElement;
        if (!frame) {
            if (attempt < 20) setTimeout(() => this.reloadPreview(attempt + 1), 50);
            return;
        }
        this.#ensureObserver(frame);
        this.#recalcZoom(frame);
        frame.srcdoc = this.#buildSrcdoc();
    }

    #ensureObserver(frame: HTMLIFrameElement) {
        if (this.#ro) return;
        const pane = frame.parentElement;
        if (!pane) return;
        this.#ro = new ResizeObserver(() => {
            if (this.#recalcZoom(frame)) this.#post({ type: 'zoom', value: this.#zoom });
        });
        this.#ro.observe(pane);
    }

    #recalcZoom(frame: HTMLIFrameElement): boolean {
        const pane = frame.parentElement;
        if (!pane || !pane.clientWidth) return false;
        const fit = Math.min(3, Math.max(0.2, (pane.clientWidth - 24) / A4_WIDTH_PX));
        const rounded = Math.round(fit * 1000) / 1000;
        if (rounded === this.#zoom) return false;
        this.#zoom = rounded;
        return true;
    }

    #buildSrcdoc(): string {
        const doc = this.#parse(this.html());
        this.#assignIds(doc);

        const base = doc.querySelector('base') ?? doc.head.insertBefore(doc.createElement('base'), doc.head.firstChild);
        base.setAttribute('href', this.baseUrl());

        const userCss = doc.createElement('style');
        userCss.textContent = this.css().replace(/url\(\s*(['"]?)(?!https?:|data:|\/|#)/gi, `url($1${this.pdfBase()}`);
        const links = doc.querySelectorAll('link[href*="styles.css"]');
        if (links.length) links[0].replaceWith(userCss);
        else doc.head.insertBefore(userCss, base.nextSibling);
        links.forEach((l) => l.remove());

        const logoSources = this.#logoSources();
        doc.querySelectorAll('img').forEach((img) => {
            if (logoSources.includes(img.getAttribute('src') ?? '')) img.setAttribute('src', this.logoUrl());
        });

        const shim = doc.createElement('style');
        shim.textContent = SHIM_CSS + `\nhtml{zoom:${this.#zoom};}`;
        doc.head.appendChild(shim);

        const page = doc.createElement('div');
        page.className = 'pdf-page';
        const flow = doc.createElement('div');
        flow.className = 'pdf-flow';
        while (doc.body.firstChild) flow.appendChild(doc.body.firstChild);
        page.appendChild(flow);
        doc.body.appendChild(page);

        const script = doc.createElement('script');
        script.textContent = CLIENT_SCRIPT;
        doc.body.appendChild(script);

        const tokens = this.#tokens();
        return ('<!DOCTYPE html>\n' + doc.documentElement.outerHTML).replace(/\[(\w+)\]/g, (m, key: string) => tokens[key] ?? m);
    }

    @HostListener('window:message', ['$event'])
    onMessage(e: MessageEvent) {
        const d = e.data;
        if (!d || d.source !== 'pdfedit' || d.type !== 'select') return;
        if (d.id == null) {
            this.selected.set(null);
            return;
        }
        this.#readSelection(d.id, d.computed ?? {});
    }

    #readSelection(id: string, computed: Record<string, string>) {
        const doc = this.#parse(this.html());
        this.#assignIds(doc);
        const el = doc.querySelector<HTMLElement>(`[data-pdfedit-id="${id}"]`);
        if (!el) return;
        const st = el.style;
        this.selected.set({
            id,
            tag: el.tagName.toLowerCase(),
            text: el.children.length === 0 ? el.textContent : null,
            fontSize: st.fontSize || computed['fontSize'] || '',
            color: this.#toHex(st.color || computed['color'] || ''),
            bold: this.#isBold(st.fontWeight || computed['fontWeight'] || ''),
            italic: (st.fontStyle || computed['fontStyle']) === 'italic',
            textAlign: st.textAlign || computed['textAlign'] || 'left',
            marginTop: st.marginTop || '',
            marginBottom: st.marginBottom || '',
            paddingTop: st.paddingTop || '',
            paddingBottom: st.paddingBottom || '',
        });
        this.selectedHtml.set(this.#cleanOuter(el));
    }

    setStyle(prop: StyleProp, value: string) {
        const sel = this.selected();
        if (!sel) return;
        this.#applyToCanonical(sel.id, (el) => (el.style[prop as any] = value));
        this.#post({ type: 'style', id: sel.id, style: { [prop]: value } });
    }

    setText(value: string) {
        const sel = this.selected();
        if (!sel) return;
        this.selected.set({ ...sel, text: value });
        this.#applyToCanonical(sel.id, (el) => (el.textContent = value));
        this.#post({ type: 'text', id: sel.id, text: value });
    }

    toggleBold() {
        const sel = this.selected();
        if (!sel) return;
        const bold = !sel.bold;
        this.selected.set({ ...sel, bold });
        this.setStyle('fontWeight', bold ? 'bold' : 'normal');
    }

    toggleItalic() {
        const sel = this.selected();
        if (!sel) return;
        const italic = !sel.italic;
        this.selected.set({ ...sel, italic });
        this.setStyle('fontStyle', italic ? 'italic' : 'normal');
    }

    setAlign(align: string) {
        const sel = this.selected();
        if (!sel) return;
        this.selected.set({ ...sel, textAlign: align });
        this.setStyle('textAlign', align);
    }

    onStyleInput(field: keyof Selected, prop: StyleProp, value: string) {
        const sel = this.selected();
        if (!sel) return;
        this.selected.set({ ...sel, [field]: value });
        this.setStyle(prop, value);
    }

    addBlock(kind: 'text' | 'divider' | 'spacer') {
        const doc = this.#parse(this.html());
        this.#assignIds(doc);
        const snippet = kind === 'divider' ? '<hr>' : kind === 'spacer' ? '<div style="height:8mm;"></div>' : '<div>Neuer Textblock</div>';
        const tmpl = doc.createElement('template');
        tmpl.innerHTML = snippet;
        const node = tmpl.content.firstElementChild;
        if (!node) return;

        const sel = this.selected();
        const anchor = sel ? doc.querySelector(`[data-pdfedit-id="${sel.id}"]`) : null;
        if (anchor?.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling);
        else (doc.querySelector('.content') ?? doc.body).appendChild(node);

        this.html.set(this.#serialize(doc));
        this.dirty.set(true);
        this.selected.set(null);
        this.reloadPreview();
    }

    removeSelected() {
        const sel = this.selected();
        if (!sel) return;
        const doc = this.#parse(this.html());
        this.#assignIds(doc);
        doc.querySelector(`[data-pdfedit-id="${sel.id}"]`)?.remove();
        this.html.set(this.#serialize(doc));
        this.dirty.set(true);
        this.selected.set(null);
        this.reloadPreview();
    }

    onFullHtmlChange(value: string) {
        this.html.set(value);
        this.#scheduleReload();
    }

    onCssChange(value: string) {
        this.css.set(value);
        this.#scheduleReload();
    }

    onScopedHtmlChange(snippet: string) {
        const sel = this.selected();
        if (!sel) {
            this.onFullHtmlChange(snippet);
            return;
        }
        this.selectedHtml.set(snippet);
        const doc = this.#parse(this.html());
        this.#assignIds(doc);
        const el = doc.querySelector(`[data-pdfedit-id="${sel.id}"]`);
        if (!el) return;
        try {
            el.outerHTML = snippet;
        } catch {
            return; // incomplete markup while typing - ignore until it parses
        }
        this.html.set(this.#serialize(doc));
        this.dirty.set(true);
        this.#scheduleReload();
    }

    editFullDocument() {
        this.selected.set(null);
        this.#post({ type: 'deselect' });
    }

    #scheduleReload() {
        this.dirty.set(true);
        clearTimeout(this.#reloadTimer);
        this.#reloadTimer = setTimeout(() => this.reloadPreview(), 350);
    }

    save() {
        this.saving.set(true);
        this.#svc.save(this.html(), this.css()).subscribe({
            next: () => {
                this.saving.set(false);
                this.dirty.set(false);
                this.customized.set(true);
                Toast.success($localize`:@@i18n.settings.pdf.saved:PDF template saved`);
            },
            error: () => this.saving.set(false),
        });
    }

    renderRealPdf() {
        this.rendering.set(true);
        this.#svc.renderPdf(this.html(), this.css()).subscribe({
            next: (r) => {
                this.#setPdf(r.pdf);
                this.rendering.set(false);
            },
            error: () => this.rendering.set(false),
        });
    }

    revert() {
        this.#svc.revert().subscribe((t) => {
            this.html.set(t.html);
            this.css.set(t.css);
            this.logoUrl.set(t.logoUrl);
            this.customized.set(t.customized);
            this.dirty.set(false);
            this.selected.set(null);
            this.reloadPreview();
            Toast.success($localize`:@@i18n.settings.pdf.reverted:Reverted to original template`);
        });
    }

    onLogoSelected(event: Event) {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        this.#svc.uploadLogo(file).subscribe((r) => {
            this.#applyLogo(r);
            Toast.success($localize`:@@i18n.settings.pdf.logoUpdated:Logo updated`);
        });
    }

    removeLogo() {
        this.#svc.removeLogo().subscribe((r) => {
            this.#applyLogo(r);
            Toast.success($localize`:@@i18n.settings.pdf.logoRemoved:uploaded logo removed`);
        });
    }

    insertPlaceholder(token: string) {
        const placeholder = `[${token}]`;
        const sel = this.selected();
        if (sel?.text != null) {
            this.setText(sel.text + placeholder);
            this.reloadPreview();
            return;
        }
        navigator.clipboard.writeText(placeholder).catch(console.error);
        Toast.success($localize`:@@i18n.settings.pdf.placeholderCopied:placeholder copied to the clipboard`);
    }

    #applyLogo(logo: PdfLogo) {
        this.logoUrl.set(logo.logoUrl);
        this.hasCustomLogo.set(logo.hasCustomLogo);
        this.reloadPreview();
    }

    #placeholders(keys: string[]): Placeholder[] {
        const tokens = this.#tokens();
        return keys.map((token) => ({
            token,
            label: TOKEN_LABELS[token] ?? token,
            value: (tokens[token] ?? '').replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        }));
    }

    closePdf() {
        this.pdfUrl.set(null);
    }

    #applyToCanonical(id: string, mutate: (el: HTMLElement) => void) {
        const doc = this.#parse(this.html());
        this.#assignIds(doc);
        const el = doc.querySelector<HTMLElement>(`[data-pdfedit-id="${id}"]`);
        if (!el) return;
        mutate(el);
        if (this.selected()?.id === id) this.selectedHtml.set(this.#cleanOuter(el));
        this.html.set(this.#serialize(doc));
        this.dirty.set(true);
    }

    #cleanOuter(el: HTMLElement): string {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.removeAttribute('data-pdfedit-id');
        clone.querySelectorAll('[data-pdfedit-id]').forEach((n) => n.removeAttribute('data-pdfedit-id'));
        return clone.outerHTML;
    }

    #post(message: Record<string, unknown>) {
        this.iframe()?.nativeElement.contentWindow?.postMessage({ source: 'pdfedit-parent', ...message }, '*');
    }

    #parse(htmlStr: string): Document {
        return this.#parser.parseFromString(htmlStr, 'text/html');
    }

    #assignIds(doc: Document) {
        doc.body.querySelectorAll('*').forEach((el, i) => el.setAttribute('data-pdfedit-id', String(i)));
    }

    #serialize(doc: Document): string {
        doc.querySelectorAll('[data-pdfedit-id]').forEach((el) => el.removeAttribute('data-pdfedit-id'));
        return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    }

    #setPdf(base64: string) {
        if (this.#objectUrl) URL.revokeObjectURL(this.#objectUrl);
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        this.#objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        this.pdfUrl.set(this.#sanitizer.bypassSecurityTrustResourceUrl(this.#objectUrl));
    }

    #toHex(color: string): string {
        if (!color) return '#000000';
        if (color.startsWith('#')) return color;
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!m) return '#000000';
        return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    }

    #isBold(weight: string): boolean {
        return weight === 'bold' || parseInt(weight, 10) >= 600;
    }
}
