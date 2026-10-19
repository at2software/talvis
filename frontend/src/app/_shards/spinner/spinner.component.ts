import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
    selector: 'spinner',
    imports: [],
    templateUrl: './spinner.component.html',
    styleUrl: './spinner.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[style.display]': 'inline() ? "inline-block" : "block"',
        '[style.verticalAlign]': 'inline() ? "middle" : null',
    },
})
export class SpinnerComponent {
    size = input<number>(48);
    centered = input<boolean>(true);
    visible = model<boolean>(true);
    inline = input<boolean>(false);
    logo = input<boolean>(false);

    show() {
        this.visible.set(true);
    }
    hide() {
        this.visible.set(false);
    }
}
