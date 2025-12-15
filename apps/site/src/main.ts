import { bootstrapApplication } from '@angular/platform-browser';
import { registerLicense } from '@syncfusion/ej2-base';
import { appConfig } from './app/app.config';
import { App } from './app/app';
// @ts-ignore
import { environment } from './environments/environment';

registerLicense(environment.syncfusionLicense);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
