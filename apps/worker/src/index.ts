import { APP_ROUTES } from "./app.routes";

export { WbsWorkflow } from './workflow/wbs';
export { MppWorkflow } from './workflow/mpp';
export { RefineWorkflow } from './workflow/refine';

export default {
    fetch: APP_ROUTES.fetch,
} satisfies ExportedHandler<Env>;
