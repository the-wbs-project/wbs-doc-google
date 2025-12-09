import { APP_ROUTES } from "./app.routes";

export * from './containers/mpp';
export * from './workflow/wbs';

export default {
    fetch: APP_ROUTES.fetch,
} satisfies ExportedHandler<Env>;
