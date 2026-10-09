import { afterNextRender, ChangeDetectionStrategy, Component, inject, Injector, TemplateRef, viewChild, computed, effect, input, signal, untracked } from '@angular/core';
import { QuillEditorComponent, QuillModules } from 'ngx-quill';
import type Quill from 'quill';
import { NgbActiveModal, NgbDropdownModule, NgbModal, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { SmartLinkDirective } from '@directives/smart-link.directive';
import { Param } from '@models/param/param.model';
import { ParamService } from '@models/param/param.service';
import { personalized } from '@constants/personalized';
import { Serializable } from '@models/_core/serializable';
import { MarketingService } from '@models/marketing/marketing.service';
import { File } from '@models/file/file.model';
import { FormsModule } from '@angular/forms';
import { SafePipe } from '@pipes/safe.pipe';
import { PaymentPlanEditorComponent } from '@shards/payment-plan-editor/payment-plan-editor.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Dictionary } from '@constants/constants';
import { modelResource } from '@models/http/model-resource';
import { insertCurrentDate } from '@constants/quill';

type ContentSegment = { type: 'html'; content: string } | { type: 'payment-plan' };
interface I18nVariant {
    language: string;
    formality: string;
    text: string;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'text-param-editor',
    templateUrl: './text-param-editor.component.html',
    styleUrls: ['./text-param-editor.component.scss'],
    imports: [QuillEditorComponent, FormsModule, SafePipe, PaymentPlanEditorComponent, SpinnerComponent, NgbDropdownModule, NgbTooltipModule, SmartLinkDirective],
})
export class TextParamEditorComponent {

    #modalService = inject(NgbModal);
    #paramService = inject(ParamService);
    #marketingService = inject(MarketingService);
    #injector = inject(Injector);

    showTextSource = input<boolean>(false);
    key = input<string>('');
    object = input<Serializable | undefined>(undefined);
    fallback = input<boolean>(false);
    to = input<Dictionary<string> | object | null>(null);
    maxHeight = input<string | undefined>(undefined);
    locale = input<string | undefined>(undefined);
    previewLocale = input<string | undefined>(undefined);

    readonly toolbarId = `text-param-editor-toolbar-${Math.random().toString(36).slice(2)}`;
    readonly modules: QuillModules = { toolbar: { container: `#${this.toolbarId}` } };

    readonly imageSelectionModal = viewChild<TemplateRef<unknown>>('imageSelectionModal');

    #quill?: Quill;

    param = signal<Param | undefined>(undefined);
    images = signal<File[]>([]);
    loadingImages = signal(false);
    isExpanded = signal(false);
    isLocalized = signal(false);
    currentLanguage = signal('de');
    currentFormality = signal('formal');
    i18nVariants = signal<I18nVariant[]>([]);
    editorValue = signal('');
    htmlMode = signal(false);

    readonly editorReady = signal(false);

    readonly availableLocales = computed(() =>
        this.i18nVariants().map((v) => ({
            language: v.language,
            formality: v.formality,
            label: `${v.language.toUpperCase()} - ${v.formality}`,
        })),
    );
    readonly selectedLocaleKey = computed(() => `${this.currentLanguage()}-${this.currentFormality()}`);
    readonly selectedLocaleLabel = computed(() => `${this.currentLanguage().toUpperCase()} - ${this.currentFormality()}`);
    readonly showLocalizationControls = computed(() => !this.object() && !this.previewLocale());
    readonly showModalLocalizationControls = computed(() => !this.object());
    readonly contentSegments = computed((): ContentSegment[] => {
        const p = this.param();
        if (!p) return [];
        const val = this.#getDisplayValue();
        if (!val.includes('[payment-plan]')) {
            return [{ type: 'html', content: val.formatPlaceholders() }];
        }
        const parts = val.split('[payment-plan]');
        return parts.flatMap((part, i) => {
            const items: ContentSegment[] = [];
            if (part) items.push({ type: 'html', content: part.formatPlaceholders() });
            if (i < parts.length - 1) items.push({ type: 'payment-plan' });
            return items;
        });
    });

    readonly isEmpty = computed(() => this.contentSegments().every((seg) => seg.type === 'html' && !/<img/i.test(seg.content) && !seg.content.replace(/<[^>]*>/g, '').trim()));

    readonly #inlineParamJson = computed(() => {
        const key = this.key();
        const object = this.object();
        if (!key || !object?.params || !(key in object.params) || !object.params[key]) return undefined;
        return { key, value: object.params[key], parent_path: object.apiPathWithId(), fallback: false };
    });
    readonly #loadedParam = modelResource(
        () => (this.key() && !this.#inlineParamJson() ? { key: this.key(), path: this.object()?.apiPathWithId(), fallback: this.fallback() } : undefined),
        ({ key, fallback }) => this.object()?.showParam(key, { fallback }) ?? this.#paramService.show(key, { fallback }),
    );

    constructor() {
        effect(() => {
            const json = this.#inlineParamJson() ?? this.#loadedParam.value();
            if (json) untracked(() => this.#assignJson(json));
        });

        effect(() => {
            this.locale();
            this.previewLocale();
            untracked(() => {
                if (this.param()) this.#applyLocale();
            });
        });
    }

    #applyLocale() {
        if (!this.isLocalized() || !this.i18nVariants().length) return;

        const localeStr = this.previewLocale() || this.locale() || (this.to() as { getLocale?: () => string } | null)?.getLocale?.() || 'de-formal';
        const [targetLang, targetFormality] = localeStr.split('-');
        const variants = this.i18nVariants();

        const target = variants.find((v) => v.language === targetLang && v.formality === targetFormality) || variants.find((v) => v.language === 'de' && v.formality === 'formal') || variants[0];

        if (target) {
            this.currentLanguage.set(target.language);
            this.currentFormality.set(target.formality);
        }
    }

    #assignJson(json: unknown) {
        this.#assign(Param.fromJson(json));
    }

    #assign(p: Param) {
        this.param.set(p);
        if (Array.isArray(p.value)) {
            this.isLocalized.set(true);
            this.i18nVariants.set(p.value as I18nVariant[]);
            this.#applyLocale();
        } else {
            this.isLocalized.set(false);
            this.i18nVariants.set([]);
        }
    }

    open(content: TemplateRef<unknown>) {
        this.editorValue.set(this.isLocalized() ? this.#getCurrentVariantText() : ((this.param()?.value as string) ?? ''));
        this.editorReady.set(false);
        this.htmlMode.set(false);
        afterNextRender(() => this.editorReady.set(true), { injector: this.#injector });

        this.#modalService.open(content, { size: 'lg' }).result.then(() => {
            this.#ensureObjectPath();
            const p = this.param()!;
            if (this.isLocalized()) {
                const variant = this.i18nVariants().find((v) => v.language === this.currentLanguage() && v.formality === this.currentFormality());
                if (variant) variant.text = this.editorValue();
                p.update({ value: [...this.i18nVariants()] }).subscribe((r) => this.#assignJson(r));
            } else {
                p.update({ value: this.editorValue() }).subscribe((r) => this.#assignJson(r));
            }
        });
    }

    #ensureObjectPath() {
        const object = this.object();
        const p = this.param();
        if (object && p?.fallback) {
            p.parent_path = object.apiPathWithId();
            p.fallback = false;
        }
    }

    resetParam() {
        this.param()
            ?.update({ value: null })
            .subscribe((r) => this.#assignJson(r));
    }

    #getCurrentVariantText(): string {
        if (!this.isLocalized()) return (this.param()?.value as string) ?? '';
        return this.i18nVariants().find((v) => v.language === this.currentLanguage() && v.formality === this.currentFormality())?.text ?? '';
    }

    #getDisplayValue(): string {
        const raw = this.isLocalized() ? this.#getCurrentVariantText() : ((this.param()?.value as string) ?? '');
        const to = this.to();
        return to && typeof to === 'object' && !Array.isArray(to) ? personalized(raw, to as Dictionary<string>) : raw;
    }

    localize() {
        if (this.isLocalized()) return;

        const currentText = (this.param()?.value as string) ?? '';
        const variants: I18nVariant[] = [
            { language: 'de', formality: 'formal', text: currentText },
            { language: 'de', formality: 'informal', text: currentText },
            { language: 'en', formality: 'formal', text: currentText },
            { language: 'en', formality: 'informal', text: currentText },
        ];
        this.i18nVariants.set(variants);
        this.isLocalized.set(true);
        this.currentLanguage.set('de');
        this.currentFormality.set('formal');
        this.#ensureObjectPath();
        this.param()!
            .update({ value: [...variants] })
            .subscribe((r) => this.#assignJson(r));
    }

    removeLocalization() {
        if (!this.isLocalized()) return;

        const plainText = this.#getCurrentVariantText();
        this.i18nVariants.set([]);
        this.isLocalized.set(false);
        this.#ensureObjectPath();
        this.param()!
            .update({ value: plainText })
            .subscribe((r) => this.#assignJson(r));
    }

    onLocaleChange(locale: string) {
        if (locale === 'remove') {
            this.removeLocalization();
            return;
        }

        if (this.isLocalized() && this.editorValue()) {
            const variants = this.i18nVariants();
            const current = variants.find((v) => v.language === this.currentLanguage() && v.formality === this.currentFormality());
            if (current) {
                current.text = this.editorValue();
                this.i18nVariants.set([...variants]);
            }
        }

        const [lang, formality] = locale.split('-');
        this.currentLanguage.set(lang);
        this.currentFormality.set(formality);
        this.editorValue.set(this.#getCurrentVariantText());
    }

    onEditorCreated(quill: Quill) {
        this.#quill = quill;
    }

    insertCurrentDate() {
        if (this.#quill) insertCurrentDate(this.#quill);
    }

    openImageSelection() {
        this.loadingImages.set(true);
        this.images.set([]);
        this.#modalService.open(this.imageSelectionModal()!, { size: 'lg' });

        this.#marketingService.indexMarketingAssets('', '', '').subscribe((data) => {
            this.images.set(data.filter((asset) => asset.mime?.startsWith('image/')));
            this.loadingImages.set(false);
        });
    }

    selectImage(image: File) {
        this.#insertImage(image);
        this.images.set([]);
    }

    selectImageFromModal(image: File, modal: NgbActiveModal) {
        this.#insertImage(image);
        modal.close('Image selected');
        this.images.set([]);
    }

    #insertImage(image: File) {
        if (!this.#quill) return;
        const url = image.preview_url || image.download_url;
        const range = this.#quill.getSelection() ?? { index: this.#quill.getLength(), length: 0 };
        this.#quill.insertEmbed(range.index, 'image', url, 'user');
        this.#quill.setSelection(range.index + 1, 0);
    }

    toggleHtmlMode() {
        if (!this.htmlMode() && this.#quill) this.editorValue.set(this.#quill.getSemanticHTML());
        this.htmlMode.update((v) => !v);
    }

    toggleExpanded() {
        this.isExpanded.update((v) => !v);
    }
}
