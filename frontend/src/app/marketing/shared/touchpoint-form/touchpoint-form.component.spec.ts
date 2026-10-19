import { renderComponent } from '@testing/component-test';
import type { TouchpointPayloadDto } from '@models/_core/api-response';
import { TouchpointFormComponent } from './touchpoint-form.component';

describe('TouchpointFormComponent', () => {
    const setup = () => {
        const form = renderComponent(TouchpointFormComponent).componentInstance;
        const emitted: TouchpointPayloadDto[] = [];
        form.submitted.subscribe((_) => emitted.push(_));
        return { form, emitted };
    };

    it('requires an outcome for a connected call', () => {
        const { form } = setup();
        form.result.set('connected');
        expect(form.canSubmit()).toBe(false);
        form.outcome.set('meeting_booked');
        expect(form.canSubmit()).toBe(true);
    });

    it('sends a retry date only for unanswered calls and callbacks', () => {
        const { form, emitted } = setup();
        form.result.set('no_answer');
        form.submit();
        expect(emitted[0].retry_at).toBeTruthy();
        expect(emitted[0].outcome).toBeNull();

        form.result.set('connected');
        form.outcome.set('not_interested');
        form.submit();
        expect(emitted[1].retry_at).toBeNull();
    });

    it('offers only results that fit the channel', () => {
        const { form } = setup();
        form.channel.set('email');
        expect(form.results().map((_) => _.key)).toEqual(['sent', 'replied', 'bounced']);
        expect(form.result()).toBeUndefined();
    });
});
