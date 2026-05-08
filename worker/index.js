import { routeRequest } from "../src/rss.js";
import { createStorageFromEnv } from "../src/storage.js";
import { hubUrlFor, runWebSubPoll } from "../src/websub.js";

function routeOptions(env, ctx) {
  return {
    env,
    storage: env.DB ? createStorageFromEnv(env) : null,
    webSubHubUrl: (origin) => hubUrlFor(origin, env),
    next: (request) => env.ASSETS.fetch(request),
    waitUntil: ctx?.waitUntil?.bind(ctx),
  };
}

export default {
  async fetch(request, env, ctx) {
    return routeRequest(request, {
      ...routeOptions(env, ctx),
      next: () => env.ASSETS.fetch(request),
    });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runWebSubPoll(routeOptions(env, ctx)));
  },
};
