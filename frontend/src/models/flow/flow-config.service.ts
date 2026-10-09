import { Service } from '@angular/core';
import type { Observable } from 'rxjs';
import { TalvisHttpService } from '@models/http/http.talvis';
import { Serializable } from '@models/_core/serializable';
import type { FlowConfigurationDto, FlowTransitionDto } from '@models/_core/api-response';

@Service()
export class FlowConfigService extends TalvisHttpService<Serializable> {
    apiPath = 'flow';

    transitions = (): Observable<FlowTransitionDto[]> => this.aget('flow/transitions', null, Object);
    configuration = (): Observable<FlowConfigurationDto> => this.get('flow/phases', null, Object);
}
