import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { modelListResource } from '@models/http/model-resource';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MarketingService } from '@models/marketing/marketing.service';
import { NgbDropdownModule, NgbTooltipModule, NgbTypeaheadModule, NgbTypeaheadSelectItemEvent } from '@ng-bootstrap/ng-bootstrap';
import { DndDirective } from '@directives/dnd.directive';
import { Nx } from '@app/nx/nx.directive';
import { File } from '@models/file/file.model';
import { TextParamEditorComponent } from '@shards/text-param-editor/text-param-editor.component';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { GuidedTourComponent } from '@shards/guided-tour/guided-tour.component';
import { Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, tap } from 'rxjs/operators';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Dictionary } from '@constants/constants';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';

interface AssetCategory {
    name: string;
    icon: string;
    color: string;
    count: number;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-assets',
    templateUrl: './marketing-assets.component.html',
    styleUrls: ['./marketing-assets.component.scss'],
    imports: [DatePipe, FormsModule, NgbDropdownModule, NgbTooltipModule, NgbTypeaheadModule, DndDirective, Nx, TextParamEditorComponent, EmptyStateComponent, GuidedTourComponent, SpinnerComponent, CdkDropList, CdkDrag, CdkDropListGroup],
})
export class MarketingAssetsComponent {
    #marketingService = inject(MarketingService);
    #route = inject(ActivatedRoute);

    searchQuery = '';
    searchTags = '';

    #tagSelected = false;

    defaultCategories: AssetCategory[] = [
        { name: 'Brand Assets', icon: 'branding_watermark', color: 'primary', count: 0 },
        { name: 'Social Media', icon: 'share', color: 'info', count: 0 },
        { name: 'Email Templates', icon: 'email', color: 'success', count: 0 },
        { name: 'Presentations', icon: 'slideshow', color: 'warning', count: 0 },
        { name: 'Print Materials', icon: 'print', color: 'secondary', count: 0 },
        { name: 'Video Content', icon: 'videocam', color: 'danger', count: 0 },
        { name: 'Documents', icon: 'description', color: 'dark', count: 0 },
    ];

    #filters = signal({
        category: decodeURIComponent(this.#route.snapshot.paramMap.get('category') ?? '') || 'Brand Assets',
        query: '',
        tags: '',
    });
    selectedCategory = computed(() => this.#filters().category);

    #assets = modelListResource(this.#filters, (f) =>
        this.#marketingService.indexMarketingAssets(f.category, f.query, f.tags).pipe(tap((assets) => assets.forEach((asset) => this.#wireCategoryChangeAction(asset)))),
    );
    assets = linkedSignal(() => this.#assets.value());
    loading = this.#assets.isLoading;

    #allAssets = modelListResource(() => this.#marketingService.indexMarketingAssets('', '', ''));
    categories = computed(() => this.defaultCategories.map((c) => ({ ...c, count: this.#allAssets.value().filter((a) => a.category === c.name).length })));

    allTags = computed(() => Array.from(new Set(this.assets().flatMap((a) => a.tags ?? []))).sort());

    onFilesUploaded() {
        this.#assets.reload();
        this.#allAssets.reload();
    }

    onDropOnGrid() {}

    onDropOnCategory(event: CdkDragDrop<File[]>, categoryName: string) {
        if (event.previousContainer === event.container) return;

        const asset = event.item.data as File;
        if (!asset || asset.category === categoryName) return;

        this.#marketingService.updateMarketingAssetCategory(asset.id, categoryName).subscribe(() => this.#onAssetRecategorized());
    }

    #onAssetRecategorized() {
        this.#assets.reload();
        this.#allAssets.reload();
    }

    #wireCategoryChangeAction(asset: File) {
        const otherCategories = this.defaultCategories.filter((c) => c.name !== asset.category);
        asset.actions.splice(asset.actions.length - 1, 0, {
            title: this.changeCategoryLabel,
            children: otherCategories.map((c) => ({
                title: c.name,
                action: () => this.#marketingService.updateMarketingAssetCategory(asset.id, c.name).pipe(tap(() => this.#onAssetRecategorized())),
            })),
        });
    }

    categorizeFile(file: File): string {
        const extension = file.name.split('.').pop()?.toLowerCase();
        const type = file.mime.toLowerCase() || '';

        if (type.startsWith('image/')) {
            if (['jpg', 'jpeg', 'png', 'svg'].includes(extension || '')) {
                return 'Brand Assets';
            }
            return 'Social Media';
        }

        if (type.startsWith('video/')) return 'Video Content';
        if (['pdf', 'doc', 'docx'].includes(extension || '')) return 'Documents';
        if (['ppt', 'pptx'].includes(extension || '')) return 'Presentations';
        return 'Documents';
    }

    filterByCategory(category: string) {
        this.#filters.update((f) => ({ ...f, category: category === f.category ? '' : category }));
    }

    onSearch() {
        this.#filters.update((f) => ({ ...f, query: this.searchQuery, tags: this.searchTags }));
    }

    #setAssetTags(asset: File, newTags: string[]) {
        asset.tags = newTags;
        this.assets.update((assets) => [...assets]);
    }

    addTagToAsset(asset: File, tag: string) {
        if (!tag.trim()) return;

        const currentTags = asset.tags || [];
        if (!currentTags.includes(tag.trim())) {
            const newTags = [...currentTags, tag.trim()];
            this.#marketingService.updateMarketingAssetTags(asset.id, newTags).subscribe(() => this.#setAssetTags(asset, newTags));
        }
    }

    removeTagFromAsset(asset: File, tagToRemove: string) {
        if (!asset.tags) return;

        const newTags = asset.tags.filter((tag) => tag !== tagToRemove);
        this.#marketingService.updateMarketingAssetTags(asset.id, newTags).subscribe(() => this.#setAssetTags(asset, newTags));
    }

    onTagInputKeyup(event: KeyboardEvent, asset: File, input: HTMLInputElement) {
        const afterSelection = this.#tagSelected;
        this.#tagSelected = false;

        if (event.key !== 'Enter' || afterSelection || !input.value.trim()) return;

        this.addTagToAsset(asset, input.value);
        this.#clearTagInput(input);
        event.preventDefault();
    }

    onTagSelected(event: NgbTypeaheadSelectItemEvent, asset: File, input: HTMLInputElement) {
        event.preventDefault();
        this.#tagSelected = true;
        this.addTagToAsset(asset, event.item);
        this.#clearTagInput(input);
    }

    #clearTagInput(input: HTMLInputElement) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
    }

    onTagSearchSelected(event: NgbTypeaheadSelectItemEvent) {
        event.preventDefault();
        this.searchTags = event.item;
        this.onSearch();
    }

    tagTypeahead = (text$: Observable<string>) =>
        text$.pipe(
            debounceTime(200),
            distinctUntilChanged(),
            map((term) => (term.length < 1 ? [] : this.allTags().filter((tag) => tag.toLowerCase().indexOf(term.toLowerCase()) > -1).slice(0, 10))),
        );

    getCategoryColor(categoryName: string | undefined): string {
        if (!categoryName) return 'secondary';
        const category = this.defaultCategories.find((cat) => cat.name === categoryName);
        return category ? category.color : 'secondary';
    }

    getCategoryParamKey(categoryName: string): string {
        const keyMap: Dictionary<string> = {
            'Brand Assets': 'params/MARKETING_BRAND_ASSETS_DESC',
            'Social Media': 'params/MARKETING_SOCIAL_MEDIA_DESC',
            'Email Templates': 'params/MARKETING_EMAIL_TEMPLATES_DESC',
            Presentations: 'params/MARKETING_PRESENTATIONS_DESC',
            'Print Materials': 'params/MARKETING_PRINT_MATERIALS_DESC',
            'Video Content': 'params/MARKETING_VIDEO_CONTENT_DESC',
            Documents: 'params/MARKETING_DOCUMENTS_DESC',
        };
        return keyMap[categoryName] || 'params/MARKETING_DOCUMENTS_DESC';
    }

    getFileIcon(mime: string): string {
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('video/')) return 'videocam';
        if (mime.includes('pdf')) return 'picture_as_pdf';
        if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slideshow';
        if (mime.includes('spreadsheet') || mime.includes('excel')) return 'table_chart';
        if (mime.includes('document') || mime.includes('word')) return 'description';
        return 'insert_drive_file';
    }

    formatFileSize(bytes?: number): string {
        if (!bytes) return 'Unknown';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
    }

    isImage(mime: string): boolean {
        return mime.startsWith('image/');
    }

    uncategorizedLabel = $localize`:@@i18n.marketing.uncategorized:uncategorized`;
    changeCategoryLabel = $localize`:@@i18n.common.changeCategory:change category`;

    getRemoveTagTitle(tag: string): string {
        return $localize`:@@i18n.marketing.click_to_remove_tag:click to remove: ${tag}`;
    }
}
