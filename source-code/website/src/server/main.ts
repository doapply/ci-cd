/**
 * ------------------------------------
 * This is the main entry point of the server and therefore app.
 *
 * Multiple things come together here:
 *  - express.js that powers the server https://expressjs.com/
 *  - vite-plugin-ssr that powers routing and rendering https://vite-plugin-ssr.com/
 *  - telefunc that powers RPCs https://telefunc.com/
 *
 * !Note: This file has not hot module reload. If you change code, you need to restart the server
 * !      by re-running `npm run dev`.
 * ------------------------------------
 */

import express from "express";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import { renderPage } from "vite-plugin-ssr";
import { URL } from "url";
import { telefunc } from "telefunc";
import { proxy } from "./git-proxy.js";
import { serverSideEnv, validateEnv } from "@env";
import sirv from "sirv";
import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";

// validate the env variables.
await validateEnv();

// the flag is set in the package.json scripts
// via `NODE_ENV=production <command>`
const isProduction = process.env.NODE_ENV === "production";

const env = await serverSideEnv();

/** the root path of the server (website/) */
const rootPath = new URL("../..", import.meta.url).pathname;

const app = express();
// compress responses with gzip
app.use(compression());

// setup sentry error tracking
// must happen before the request handlers
if (isProduction) {
	Sentry.init({
		dsn: env.SENTRY_DSN_SERVER,
		integrations: [
			// enable HTTP calls tracing
			new Sentry.Integrations.Http({ tracing: true }),
			// enable Express.js middleware tracing
			new Tracing.Integrations.Express({ app }),
		],
		tracesSampleRate: 0.8,
	});

	// RequestHandler creates a separate execution context using domains, so that every
	// transaction/span/breadcrumb is attached to its own Hub instance
	app.use(Sentry.Handlers.requestHandler());
	// TracingHandler creates a trace for every incoming request
	app.use(Sentry.Handlers.tracingHandler());
}

if (isProduction) {
	// serve build files
	app.use(sirv(`${rootPath}/dist/client`));
} else {
	const viteServer = await createViteServer({
		server: { middlewareMode: true },
		root: rootPath,
		appType: "custom",
	});
	// start vite hot module reload dev server
	// use vite's connect instance as middleware
	app.use(viteServer.middlewares);
}

// serving telefunc https://telefunc.com/
app.all(
	"/_telefunc",
	// Parse & make HTTP request body available at `req.body` (required by telefunc)
	app.use(express.text()),
	// handle the request
	async (request, response) => {
		const { body, statusCode, contentType } = await telefunc({
			url: request.originalUrl,
			method: request.method,
			body: request.body,
		});
		return response.status(statusCode).type(contentType).send(body);
	}
);

// forward git requests to the proxy with wildcard `*`.
app.all(env.VITE_GIT_REQUEST_PROXY_PATH + "*", proxy);

// serving @src/pages and /public
//! it is extremely important that a request handler is not async to catch errors
//! express does not catch async errors. hence, renderPage uses the callback pattern
app.get("*", (request, response, next) => {
	renderPage({
		urlOriginal: request.originalUrl,
	})
		.then((pageContext) => {
			if (pageContext.httpResponse === null) {
				return next();
			}
			const { body, statusCode, contentType } = pageContext.httpResponse;
			return response.status(statusCode).type(contentType).send(body);
		})
		// pass the error to expresses error handling
		.catch(next);
});

const port = process.env.PORT ?? 3000;
app.listen(port);
console.log(`Server running at http://localhost:${port}/`);

// log to sentry
if (isProduction) {
	// The error handler must be before any other error middleware and after all controllers
	app.use(Sentry.Handlers.errorHandler());
}