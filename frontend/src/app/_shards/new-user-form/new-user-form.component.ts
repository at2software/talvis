import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dictionary } from '@constants/constants';

export const MIN_PASSWORD_LENGTH = 8;

@Component({
    selector: 'new-user-form',
    templateUrl: './new-user-form.component.html',
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewUserFormComponent {
    name = model('');
    email = model('');
    password = model('');
    passwordRepeat = model('');
    confirmPassword = input(false);
    errors = input<Dictionary<string>>({});
    submitted = output<void>();

    readonly passwordsMatch = computed(() => !this.confirmPassword() || this.password() === this.passwordRepeat());
    readonly valid = computed(() => !!this.name().trim() && !!this.email().trim() && this.password().length >= MIN_PASSWORD_LENGTH && this.passwordsMatch());
}
