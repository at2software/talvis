import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { User } from '@models/user/user.model';
import { Toast } from '@shards/toast/toast';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'rsa-settings-empty',
    templateUrl: './rsa-settings-empty.component.html',
    imports: [EmptyStateComponent, SpinnerComponent],
})
export class RsaSettingsEmptyComponent {
    user = input.required<User>();
    isGenerating = false;

    async createKeypair() {
        this.isGenerating = true;
        try {
            await this.user().createRsaKeyPair();
        } catch (error) {
            console.error('Failed to generate RSA keypair:', error);
            Toast.error($localize`:@@i18n.rsa.generateFailed:failed to generate RSA key pair – please try again`);
        } finally {
            this.isGenerating = false;
        }
    }

    onFileSelected($event: Event) {
        const input = $event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const fileReader = new FileReader();
            fileReader.onload = () => {
                this.user().importFromPem(fileReader.result as string);
            };
            fileReader.readAsText(input.files[0]);
        }
    }
}
