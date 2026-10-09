import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { GlobalService } from '@models/global.service';

export const redirectSeedAdminToSetup: CanActivateFn = () => (inject(GlobalService).isSeedAdmin() ? inject(Router).createUrlTree(['/setup']) : true);

export const onlySeedAdmin: CanActivateFn = () => (inject(GlobalService).isSeedAdmin() ? true : inject(Router).createUrlTree(['/dashboard']));
