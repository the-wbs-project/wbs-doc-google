import { Container } from '@cloudflare/containers';

export class MppService extends Container {
    defaultPort = 8080; // pass requests to port 8080 in the container
    sleepAfter = "2h"; // only sleep a container if it hasn't gotten requests in 2 hours
}
