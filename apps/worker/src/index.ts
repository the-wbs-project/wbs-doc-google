import { APP_ROUTES } from "./app.routes";

export * from './workflow/wbs';

export default {
    fetch: APP_ROUTES.fetch,
} satisfies ExportedHandler<Env>;
