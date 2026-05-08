import { routeRequest } from "../src/rss.js";
import { createStorageFromEnv } from "../src/storage.js";
import { hubUrlFor } from "../src/websub.js";

export async function onRequest(context) {
  return routeRequest(context.request, {
    env: context.env,
    storage: createStorageFromEnv(context.env),
    webSubHubUrl: (origin) => hubUrlFor(origin, context.env),
    next: () => context.next(),
  });
}
