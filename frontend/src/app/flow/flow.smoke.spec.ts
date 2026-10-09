import { renderComponent } from '@testing/component-test';
import { FlowApprovalsComponent } from '@app/flow/approvals/flow-approvals.component';

describe('flow renders', () => {
    it('FlowApprovalsComponent', () => {
        expect(renderComponent(FlowApprovalsComponent).nativeElement).toBeTruthy();
    });
});
